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
  releaseJobClaims,
  resetGenericGenerationFailures,
  releaseAutomationLock,
  recentRuns,
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
  if (!secret) {
    await releaseJobClaims(ids, "CRON_SECRET 누락으로 작업자 호출이 중단되어 재시도 대기 중입니다.");
    throw new Error("CRON_SECRET이 없습니다.");
  }
  const origin = new URL(req.url).origin;
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const dispatchOne = async (jobId: string) => {
    const response = await fetch(
      `${origin}/api/cron/article-worker?jobId=${encodeURIComponent(jobId)}&blogId=${encodeURIComponent(blogId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}),
        },
        cache: "no-store",
        redirect: "manual",
      },
    );
    const contentType = response.headers.get("content-type") || "";
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`worker dispatch redirected (${response.status})`);
    }
    if (!contentType.includes("application/json")) {
      throw new Error(`worker dispatch returned non-JSON (${response.status})`);
    }
    if (!response.ok && ![500, 503].includes(response.status)) {
      throw new Error(`worker dispatch rejected (${response.status})`);
    }
    const body = await response.json();
    // 500/503 JSON means the worker ran and recorded the job's failure; it is
    // different from a protection/transport failure that left the claim stuck.
    return {
      ok: response.ok && body?.ok !== false,
      systemic: Boolean(body?.systemic),
      sourceBlocked: Boolean(body?.sourceBlocked),
      state: String(body?.state || (response.ok ? "unknown" : "error")),
    };
  };

  // Test one production call before fanning out. Invalid credentials, empty
  // provider balance, or another systemic error must not trigger six more
  // billable attempts in the same daily run.
  const first = await Promise.allSettled([dispatchOne(ids[0])]);
  if (first[0].status === "fulfilled" && first[0].value.systemic) {
    await releaseJobClaims(
      ids.slice(1),
      "앞선 글에서 API 제공자 공통 오류가 확인되어 이번 실행의 나머지 글을 비용 보호를 위해 보류했습니다.",
    );
    const outcome = first[0].value;
    return {
      dispatched: 1,
      dispatchFailures: 0,
      workerFailures: 1,
      systemicFailures: 1,
      sourceBlocked: Number(outcome.sourceBlocked),
      workerStates: { [outcome.state]: 1 },
      deferredAfterSystemicFailure: Math.max(0, ids.length - 1),
      haltedForSystemicFailure: true,
      haltedForDispatchFailure: false,
      workerBypassConfigured: Boolean(bypassSecret),
    };
  }
  if (first[0].status === "rejected") {
    await releaseJobClaims(
      ids,
      "첫 작업자 호출을 전달하지 못해 나머지 작업도 비용 보호를 위해 보류했습니다.",
    );
    return {
      dispatched: 0,
      dispatchFailures: 1,
      workerFailures: 0,
      systemicFailures: 0,
      sourceBlocked: 0,
      workerStates: {},
      deferredAfterSystemicFailure: Math.max(0, ids.length - 1),
      haltedForSystemicFailure: false,
      haltedForDispatchFailure: true,
      workerBypassConfigured: Boolean(bypassSecret),
    };
  }
  const settled = [first[0], ...(await Promise.allSettled(ids.slice(1).map(dispatchOne)))];
  const failedIds = settled.flatMap((result, index) =>
    result.status === "rejected" ? [ids[index]] : [],
  );
  if (failedIds.length) {
    await releaseJobClaims(failedIds, "작업자 호출에 실패해 자동 재시도 대기 중입니다.");
  }
  const outcomes = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const workerStates = outcomes.reduce((acc: Record<string, number>, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});
  return {
    dispatched: outcomes.length,
    dispatchFailures: failedIds.length,
    workerFailures: outcomes.filter((item) => !item.ok).length,
    systemicFailures: outcomes.filter((item) => item.systemic).length,
    sourceBlocked: outcomes.filter((item) => item.sourceBlocked).length,
    workerStates,
    deferredAfterSystemicFailure: 0,
    haltedForSystemicFailure: false,
    haltedForDispatchFailure: false,
    workerBypassConfigured: Boolean(bypassSecret),
  };
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

    const todayKst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    const latestDaily = (await recentRuns()).find(
      (run: any) => run.kind === "daily-production",
    );
    const latestDailyDate = latestDaily?.started_at
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date(latestDaily.started_at))
      : "";
    if (
      latestDailyDate === todayKst &&
      latestDaily?.detail?.haltedForSystemicFailure === true
    )
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "오늘 공통 API 오류로 이미 중단되어 추가 호출을 보류했습니다.",
        haltedForSystemicFailure: true,
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

    if (jobIds.length) {
      after(async () => {
        try {
          const result = await dispatchWorkers(req, jobIds, targetBlogId);
          const failures = result.dispatchFailures + result.workerFailures;
          const status =
            result.haltedForSystemicFailure ||
            result.haltedForDispatchFailure ||
            (failures === jobIds.length && result.systemicFailures === jobIds.length)
              ? "failed"
              : failures > 0
                ? "partial"
                : "success";
          await finishRun(runId!, status, { ...detail, ...result });
        } catch (error: any) {
          await finishRun(runId!, "failed", {
            ...detail,
            dispatched: 0,
            dispatchError: error?.message || "worker dispatch failed",
            workerBypassConfigured: Boolean(
              process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim(),
            ),
          }).catch(() => {});
        }
      });
    } else {
      await finishRun(runId, "partial", { ...detail, dispatched: 0 });
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
