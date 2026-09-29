import { NextRequest, NextResponse } from "next/server";
import { assertCron, serverKeys } from "@/lib/cron";
import {
  createBloggerDraft,
  publishBloggerDraft,
  resolveBloggerBlogIdByName,
} from "@/lib/google";
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

// Daily jobs are persisted per article and may span multiple model calls.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let runId: number | undefined;
  let lockOwner: string | null = null;
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    const config = await getAutomationConfig();
    const primaryBlogName = process.env.PRIMARY_BLOGGER_NAME?.trim() || "장학짱";
    let primaryBlogId: string | null = null;
    const resolveTargetBlogId = async (_job?: any) => {
      if (!primaryBlogId)
        primaryBlogId = await resolveBloggerBlogIdByName(primaryBlogName);
      return primaryBlogId;
    };
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
        const targetBlogId = await resolveTargetBlogId(job);
        const post = await createBloggerDraft(targetBlogId, job.article, job.id);
        const published = config.autoPublish
          ? post.published
            ? post
            : await publishBloggerDraft(targetBlogId, post.id!)
          : null;
        const finalState = published ? "published" : "draft";
        await updateJob(job.id, {
          state: finalState,
          article: job.article,
          bloggerPostId: published?.id || post.id,
          blogId: targetBlogId,
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
            blogId: targetBlogId,
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
      Math.min(28, Math.max(config.dailyArticleLimit * 2, config.dailyArticleLimit + 4)),
    );
    const results: any[] = [...draftResults];
    let completedSlots = 0;
    let systemicFailure = false;

    const processJob = async (job: any) => {
      try {
        const targetBlogId = await resolveTargetBlogId(job);
        const [existingArticles, performanceGuidance] = await Promise.all([
          getRecentArticles(40, targetBlogId),
          getPerformanceGuidance(targetBlogId),
        ]);
        const reservation = await reserveEstimatedCost({
          jobId: job.id,
          blogId: targetBlogId,
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
        if (!reservation.allowed)
          return { id: job.id, state: "budget_paused", budget: reservation };

        const savedArticle = job.article || null;
        const inferredRecoveryMode = savedArticle
          ? savedArticle.recoveryDecision?.mode ||
            (Number(savedArticle.review?.overallScore || 0) === 0
              ? "review_only"
              : Number(savedArticle.review?.factualScore || 0) < 80 ||
                  Number(savedArticle.review?.evidenceScore || 0) < 80
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

        if (article.status !== "ready") {
          await updateJob(job.id, {
            state: article.status,
            article,
            blogId: targetBlogId,
            error: null,
          });
          return {
            id: job.id,
            state: article.status,
            bloggerMapped: true,
          };
        }

        const post = await createBloggerDraft(targetBlogId, article, job.id);
        const published = config.autoPublish
          ? post.published
            ? post
            : await publishBloggerDraft(targetBlogId, post.id!)
          : null;
        const finalState = published ? "published" : "draft";
        await updateJob(job.id, {
          state: finalState,
          article,
          bloggerPostId: published?.id || post.id,
          blogId: targetBlogId,
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
            blogId: targetBlogId,
            postId: published?.id || post.id,
            title: article.title,
            mode: config.autoPublish
              ? "automatic-publish"
              : "automatic-draft",
          },
        });
        return {
          id: job.id,
          state: finalState,
          postId: published?.id || post.id,
          success: true,
        };
      } catch (error: any) {
        const sourceBlocked = isSourceBlockedError(error);
        await updateJob(job.id, {
          state: sourceBlocked ? "source_blocked" : "error",
          error: error.message || "자동 작성 실패",
        });
        return {
          id: job.id,
          state: sourceBlocked ? "source_blocked" : "error",
          error: error.message,
          systemic: !sourceBlocked && isSystemicProviderError(error),
        };
      }
    };

    // Run a small concurrent wave so seven articles do not serialize into the
    // 300-second Vercel limit. Only launch as many jobs as are still needed.
    let cursor = 0;
    while (
      completedSlots < config.dailyArticleLimit &&
      cursor < jobs.length &&
      !systemicFailure
    ) {
      const needed = config.dailyArticleLimit - completedSlots;
      const waveSize = Math.min(3, needed, jobs.length - cursor);
      const wave = jobs.slice(cursor, cursor + waveSize);
      cursor += waveSize;
      const waveResults = await Promise.all(wave.map(processJob));
      results.push(...waveResults);
      completedSlots += waveResults.filter((item) => item.success).length;
      systemicFailure = waveResults.some((item) => item.systemic);
      if (waveResults.some((item) => item.state === "budget_paused")) break;
    }

    if (cursor < jobs.length) {
      const deferredIds = jobs.slice(cursor).map((item) => item.id);
      await releaseJobClaims(
        deferredIds,
        systemicFailure
          ? "공통 API 인증·쿼터 오류로 다음 실행으로 이월했습니다."
          : "오늘 성공 발행 목표 또는 실행 한도에 도달해 다음 실행으로 이월했습니다.",
      );
      results.push({
        state: systemicFailure ? "circuit_breaker" : "replacement_reserve_released",
        deferred: deferredIds.length,
      });
    }

    const detail = {
      requested: config.dailyArticleLimit,
      processed: results.filter(
        (item) => item.id && !readyDrafts.some((job) => job.id === item.id),
      ).length,
      syncedDrafts: draftResults.filter((item) => item.state === "draft")
        .length,
      successful: completedSlots,
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
