import { after, NextRequest, NextResponse } from "next/server";
import { assertCron } from "@/lib/cron";
import { resolveBloggerBlogIdByName } from "@/lib/google";
import {
  acquireAutomationLock,
  claimDueJobs,
  claimReadyDraftJobs,
  finishRun,
  finishStaleAutomationRuns,
  getAutomationConfig,
  getBudgetGuard,
  getOperationalStats,
  getTodayPublishedCount,
  hasDatabase,
  recoverStaleArticleJobs,
  resetGenericGenerationFailures,
  releaseAutomationLock,
  startRun,
} from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function dispatchWorkers(
  req: NextRequest,
  ids: string[],
  blogId: string,
) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET이 없습니다.");
  const origin = new URL(req.url).origin;
  await Promise.allSettled(
    ids.map((jobId) =>
      fetch(
        `${origin}/api/cron/article-worker?jobId=${encodeURIComponent(jobId)}&blogId=${encodeURIComponent(blogId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        },
      ),
    ),
  );
}

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

    // Repair jobs/runs left behind by a previous hard server timeout before
    // deciding how many new workers can be launched.
    const [resetGenerationFailures, recoveredJobIds, staleRunsClosed] =
      await Promise.all([
        resetGenericGenerationFailures(),
        recoverStaleArticleJobs(15),
        finishStaleAutomationRuns(15),
      ]);

    lockOwner = await acquireAutomationLock("daily-dispatch", 5);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "daily dispatch already running",
      });

    runId = await startRun("daily-production");
    const budget = await getBudgetGuard();
    const [publishedToday, operational] = await Promise.all([
      getTodayPublishedCount(),
      getOperationalStats(),
    ]);

    // Count currently running workers as reserved slots. This makes repeated
    // button taps and retry crons idempotent instead of over-publishing.
    const reserved = Math.max(0, Number(operational.working || 0));
    const remaining = Math.max(
      0,
      Number(config.dailyArticleLimit) - publishedToday - reserved,
    );

    if (remaining <= 0) {
      const detail = {
        requested: config.dailyArticleLimit,
        publishedToday,
        reserved,
        queued: 0,
        resetGenerationFailures: resetGenerationFailures.length,
        recovered: recoveredJobIds.length,
        staleRunsClosed,
      };
      await finishRun(runId, "success", detail);
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "daily target already covered",
        ...detail,
      });
    }

    const primaryBlogName =
      process.env.PRIMARY_BLOGGER_NAME?.trim() || "장학짱";
    // Resolve Blogger once before claiming jobs. If OAuth/blog lookup is broken,
    // leave the queue untouched instead of failing seven article workers.
    const targetBlogId = await resolveBloggerBlogIdByName(primaryBlogName);

    const readyJobs = await claimReadyDraftJobs(remaining);
    const remainingAfterReady = Math.max(0, remaining - readyJobs.length);
    const productionJobs =
      remainingAfterReady > 0 ? await claimDueJobs(remainingAfterReady) : [];
    const jobs = [...readyJobs, ...productionJobs];
    const jobIds = jobs.map((job: any) => String(job.id));

    const detail = {
      requested: config.dailyArticleLimit,
      publishedToday,
      reserved,
      queued: jobIds.length,
      queuedReady: readyJobs.length,
      queuedProduction: productionJobs.length,
      resetGenerationFailures: resetGenerationFailures.length,
      recovered: recoveredJobIds.length,
      staleRunsClosed,
      jobIds,
    };

    await finishRun(
      runId,
      jobIds.length || publishedToday >= config.dailyArticleLimit
        ? "success"
        : "partial",
      detail,
    );

    if (jobIds.length) {
      after(async () => {
        await dispatchWorkers(req, jobIds, targetBlogId);
      });
    }

    return NextResponse.json({
      ok: true,
      ...detail,
      budgetWarning: budget.paused
        ? "설정된 월 AI 예산을 초과했지만 자동 게시 우선 정책으로 계속 진행합니다."
        : null,
      message: jobIds.length
        ? "글 작업을 개별 백그라운드 worker로 넘겼습니다."
        : "현재 실행 가능한 글 작업이 없습니다.",
    });
  } catch (error: any) {
    if (runId)
      await finishRun(runId, "failed", {
        error: error?.message || "daily dispatch failed",
      }).catch(() => {});
    return NextResponse.json(
      { error: error?.message || "일일 자동 작성 시작 실패" },
      { status: error?.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("daily-dispatch", lockOwner).catch(() => {});
  }
}
