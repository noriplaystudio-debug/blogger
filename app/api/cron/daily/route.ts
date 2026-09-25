import { NextRequest, NextResponse } from "next/server";
import { assertCron, serverKeys } from "@/lib/cron";
import { createBloggerDraft, publishBloggerDraft } from "@/lib/google";
import {
  isSourceBlockedError,
  isSystemicProviderError,
  produceArticle,
} from "@/lib/production";
import {
  claimDueJobs,
  claimReadyDraftJobs,
  acquireAutomationLock,
  finishRun,
  getAutomationConfig,
  getBudgetGuard,
  getPerformanceGuidance,
  getRecentArticles,
  hasDatabase,
  startRun,
  releaseAutomationLock,
  releaseJobClaims,
  recordAuditEvent,
  reserveEstimatedCost,
  updateJob,
} from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let runId: number | undefined;
  let lockOwner: string | null = null;
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    const config = await getAutomationConfig();
    if (!config.enabled)
      return NextResponse.json({
        skipped: true,
        reason: "automation disabled",
      });
    lockOwner = await acquireAutomationLock("daily-production", 60);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "daily production already running",
      });
    runId = await startRun("daily-production");
    const readyDrafts = await claimReadyDraftJobs(config.dailyArticleLimit);
    const draftResults: any[] = [];
    for (const job of readyDrafts) {
      try {
        const post = await createBloggerDraft(job.blog_id, job.article, job.id);
        const published = config.autoPublish
          ? post.published
            ? post
            : await publishBloggerDraft(job.blog_id, post.id!)
          : null;
        const finalState = published ? "published" : "draft";
        await updateJob(job.id, {
          state: finalState,
          article: job.article,
          bloggerPostId: published?.id || post.id,
        });
        await recordAuditEvent({
          action: published
            ? published.reused
              ? "published_reused"
              : "post_published"
            : post.reused
              ? "draft_reused"
              : "draft_created",
          entityType: "article_job",
          entityId: job.id,
          detail: {
            blogId: job.blog_id,
            postId: published?.id || post.id,
            title: job.article.title,
            mode: config.autoPublish
              ? "automatic-ready-publish"
              : "automatic-ready-sync",
          },
        });
        draftResults.push({
          id: job.id,
          state: finalState,
          postId: published?.id || post.id,
        });
      } catch (error: any) {
        await updateJob(job.id, {
          state: "ready",
          error: error.message || "Blogger 임시글 자동 저장 실패",
        });
        draftResults.push({
          id: job.id,
          state: "draft_error",
          error: error.message,
        });
      }
    }
    const budget = await getBudgetGuard();
    if (budget.paused) {
      const detail = {
        requested: config.dailyArticleLimit,
        processed: 0,
        syncedDrafts: draftResults.filter((item) => item.state === "draft")
          .length,
        results: draftResults,
        budget,
      };
      await finishRun(runId, "partial", detail);
      return NextResponse.json({
        skipped: true,
        reason: "monthly AI budget reached",
        ...detail,
      });
    }
    // 품질 재시도·출처 보강 실패가 일부 슬롯을 소모하지 않도록 충분한
    // 후보를 미리 확보한다. 인증·쿼터 같은 공통 장애만 즉시 중지한다.
    const jobs = await claimDueJobs(
      Math.min(50, Math.max(config.dailyArticleLimit * 3, config.dailyArticleLimit + 5)),
    );
    const results: any[] = [...draftResults];
    let consecutiveErrors = 0;
    let completedSlots = 0;
    for (let index = 0; index < jobs.length; index += 1) {
      if (completedSlots >= config.dailyArticleLimit) {
        const replacementReserveIds = jobs.slice(index).map((item) => item.id);
        await releaseJobClaims(
          replacementReserveIds,
          "오늘 작성량을 채워 대체 후보를 다음 실행으로 이월했습니다.",
        );
        results.push({
          state: "replacement_reserve_released",
          deferred: replacementReserveIds.length,
        });
        break;
      }
      const job = jobs[index];
      try {
        const existingArticles = await getRecentArticles(40, job.blog_id);
        const performanceGuidance = await getPerformanceGuidance(job.blog_id);
        const reservation = await reserveEstimatedCost({
          jobId: job.id,
          blogId: job.blog_id,
          kind: `article-production-attempt-${Number(job.attempts || 0) + 1}`,
          amountWon: Math.ceil(
            Number(config.estimatedArticleCostWon || 0) *
              (job.article?.recoveryDecision?.mode === "review_only"
                ? 0.35
                : job.article?.recoveryDecision?.mode === "content_repair"
                  ? 0.7
                  : 1),
          ),
          detail: {
            basis: "user-configured-estimate",
            mode: job.article?.recoveryDecision?.mode || "new_article",
            writerModel: config.writerModel,
            reviewerModel: config.reviewerModel,
          },
        });
        if (!reservation.allowed) {
          const pendingIds = jobs.slice(index).map((item) => item.id);
          await releaseJobClaims(
            pendingIds,
            "월 AI 예산 한도에 도달해 다음 실행으로 이월했습니다.",
          );
          results.push({
            state: "budget_paused",
            deferred: pendingIds.length,
            budget: reservation,
          });
          break;
        }
        const savedArticle = job.article || null;
        const inferredRecoveryMode = savedArticle
          ? savedArticle.recoveryDecision?.mode ||
            (Number(savedArticle.review?.overallScore || 0) === 0
              ? "review_only"
              : Number(savedArticle.review?.factualScore || 0) < 95 ||
                  Number(savedArticle.review?.evidenceScore || 0) < 95
                ? "evidence_repair"
                : "content_repair")
          : null;
        const article = await produceArticle(
          {
            ...job,
            recoveryMode: inferredRecoveryMode,
            existingArticle: savedArticle,
            recoveryContext:
              inferredRecoveryMode === "evidence_repair"
                ? savedArticle?.recoveryDecision?.reasons ||
                  savedArticle?.review?.issues ||
                  []
                : undefined,
          },
          {
            keys: serverKeys(),
            writerModel: config.writerModel,
            reviewerModel: config.reviewerModel,
            styleGuide:
              config.categoryStyleMap[job.category] || config.styleGuide,
            existingArticles,
            performanceGuidance,
          },
        );
        if (article.status === "ready" && job.blog_id) {
          const post = await createBloggerDraft(job.blog_id, article, job.id);
          const published = config.autoPublish
            ? post.published
              ? post
              : await publishBloggerDraft(job.blog_id, post.id!)
            : null;
          const finalState = published ? "published" : "draft";
          await updateJob(job.id, {
            state: finalState,
            article,
            bloggerPostId: published?.id || post.id,
          });
          await recordAuditEvent({
            action: published
              ? published.reused
                ? "published_reused"
                : "post_published"
              : post.reused
                ? "draft_reused"
                : "draft_created",
            entityType: "article_job",
            entityId: job.id,
            detail: {
              blogId: job.blog_id,
              postId: published?.id || post.id,
              title: article.title,
              mode: config.autoPublish
                ? "automatic-publish"
                : "automatic-draft",
            },
          });
          results.push({
            id: job.id,
            state: finalState,
            postId: published?.id || post.id,
          });
        } else {
          await updateJob(job.id, {
            state: article.status,
            article,
            error: job.blog_id
              ? null
              : "Blogger 블로그 매핑이 없어 내부 검토 대기 상태로 저장했습니다.",
          });
          results.push({
            id: job.id,
            state: article.status,
            bloggerMapped: Boolean(job.blog_id),
          });
        }
        completedSlots += 1;
        consecutiveErrors = 0;
      } catch (error: any) {
        const sourceBlocked = isSourceBlockedError(error);
        await updateJob(job.id, {
          state: sourceBlocked ? "source_blocked" : "error",
          error: error.message || "자동 작성 실패",
        });
        results.push({
          id: job.id,
          state: sourceBlocked ? "source_blocked" : "error",
          error: error.message,
        });
        if (sourceBlocked) {
          consecutiveErrors = 0;
          continue;
        }
        consecutiveErrors += 1;
        if (isSystemicProviderError(error)) {
          const deferredIds = jobs.slice(index + 1).map((item) => item.id);
          await releaseJobClaims(
            deferredIds,
            "연속 오류 2회로 비용 낭비를 막기 위해 다음 실행으로 이월했습니다.",
          );
          results.push({
            state: "circuit_breaker",
            deferred: deferredIds.length,
            reason: "shared provider authentication, quota, or billing error",
          });
          break;
        }
      }
    }
    const detail = {
      requested: config.dailyArticleLimit,
      processed: results.filter(
        (item) => item.id && !readyDrafts.some((job) => job.id === item.id),
      ).length,
      syncedDrafts: draftResults.filter((item) => item.state === "draft")
        .length,
      deferred: results.reduce(
        (sum, item) => sum + Number(item.deferred || 0),
        0,
      ),
      results,
    };
    await finishRun(
      runId,
      results.some((x) =>
        [
          "error",
          "source_blocked",
          "draft_error",
          "budget_paused",
          "circuit_breaker",
        ].includes(x.state),
      )
        ? "partial"
        : "success",
      detail,
    );
    return NextResponse.json({ ok: true, ...detail });
  } catch (error: any) {
    if (runId) await finishRun(runId, "failed", { error: error.message });
    return NextResponse.json(
      { error: error.message || "일일 자동 작성 실패" },
      { status: error.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("daily-production", lockOwner);
  }
}
