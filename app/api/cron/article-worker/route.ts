import { after, NextRequest, NextResponse } from "next/server";
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
  finishRun,
  getArticleJobById,
  getAutomationConfig,
  getPerformanceGuidance,
  getRecentArticles,
  hasDatabase,
  recordAuditEvent,
  reserveEstimatedCost,
  startRun,
  updateJob,
} from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function queueDailyTopUp(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const origin = new URL(req.url).origin;
  after(async () => {
    await fetch(`${origin}/api/cron/daily`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => {});
  });
}

export async function POST(req: NextRequest) {
  let runId: number | undefined;
  let shouldTopUp = false;
  const jobId = String(req.nextUrl.searchParams.get("jobId") || "").slice(0, 220);
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    if (!jobId) throw new Error("jobId가 없습니다.");

    const job = await getArticleJobById(jobId);
    if (!job)
      return NextResponse.json({ skipped: true, reason: "job not found", jobId });

    if (["published", "draft"].includes(String(job.state)))
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already completed",
        jobId,
        state: job.state,
      });

    if (job.state !== "working")
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "job is not claimed",
        jobId,
        state: job.state,
      });

    shouldTopUp = true;
    runId = await startRun("article-worker");
    const config = await getAutomationConfig();
    const suppliedBlogId = String(
      req.nextUrl.searchParams.get("blogId") || "",
    ).trim();
    const primaryBlogName = process.env.PRIMARY_BLOGGER_NAME?.trim() || "장학짱";
    const targetBlogId =
      suppliedBlogId || (await resolveBloggerBlogIdByName(primaryBlogName));

    let article = job.article || null;
    if (article?.status !== "ready") {
      const reservation = await reserveEstimatedCost({
        jobId: job.id,
        blogId: targetBlogId,
        kind: `article-production-attempt-${Number(job.attempts || 1)}`,
        amountWon: Math.ceil(
          Number(config.estimatedArticleCostWon || 0) *
            (article?.recoveryDecision?.mode === "review_only"
              ? 0.35
              : article?.recoveryDecision?.mode === "content_repair"
                ? 0.7
                : 1),
        ),
        detail: {
          basis: "user-configured-estimate",
          mode: article?.recoveryDecision?.mode || "new_article",
          writerModel: config.writerModel,
          reviewerModel: config.reviewerModel,
        },
        enforceBudget: false,
      });

      const [existingArticles, performanceGuidance] = await Promise.all([
        getRecentArticles(30, targetBlogId),
        getPerformanceGuidance(targetBlogId),
      ]);

      const inferredRecoveryMode = article
        ? article.recoveryDecision?.mode ||
          (Number(article.review?.overallScore || 0) === 0
            ? "review_only"
            : Number(article.review?.factualScore || 0) < 80 ||
                Number(article.review?.evidenceScore || 0) < 80
              ? "evidence_repair"
              : "content_repair")
        : null;

      article = await produceArticle(
        {
          ...job,
          recoveryMode: inferredRecoveryMode,
          existingArticle: article,
          recoveryContext:
            inferredRecoveryMode === "evidence_repair"
              ? article?.recoveryDecision?.reasons ||
                article?.review?.issues ||
                []
              : undefined,
        },
        {
          keys: serverKeys(),
          writerModel: config.writerModel,
          reviewerModel: config.reviewerModel,
          styleGuide: config.categoryStyleMap[job.category] || config.styleGuide,
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
        if (runId)
          await finishRun(runId, "partial", {
            jobId,
            state: article.status,
          });
        return NextResponse.json({ ok: true, jobId, state: article.status });
      }
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
      error: null,
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
        mode: config.autoPublish ? "automatic-publish" : "automatic-draft",
      },
    });
    if (runId)
      await finishRun(runId, "success", {
        jobId,
        state: finalState,
        postId: published?.id || post.id,
      });
    return NextResponse.json({
      ok: true,
      jobId,
      state: finalState,
      postId: published?.id || post.id,
    });
  } catch (error: any) {
    shouldTopUp = false;
    const sourceBlocked = isSourceBlockedError(error);
    const systemic = !sourceBlocked && isSystemicProviderError(error);
    if (jobId) {
      await updateJob(jobId, {
        state: sourceBlocked ? "source_blocked" : "error",
        error: error?.message || "자동 작성 실패",
      }).catch(() => {});
    }
    if (runId)
      await finishRun(runId, "failed", {
        jobId,
        error: error?.message || "article worker failed",
        systemic,
      }).catch(() => {});
    return NextResponse.json(
      {
        error: error?.message || "자동 글 작성 작업 실패",
        jobId,
        sourceBlocked,
        systemic,
      },
      { status: systemic ? 503 : 500 },
    );
  } finally {
    if (shouldTopUp) queueDailyTopUp(req);
  }
}
