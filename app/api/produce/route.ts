import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isSourceBlockedError, produceArticle } from "@/lib/production";
import {
  getAutomationConfig,
  getPerformanceGuidance,
  getRecentArticles,
  hasDatabase,
  reserveEstimatedCost,
  updateJob,
} from "@/lib/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
    if (!body?.category || !body?.keyword || !body?.angle?.titleIdea)
      return NextResponse.json(
        { error: "글 작업 정보가 부족해 API를 호출하지 않았습니다." },
        { status: 400 },
      );
    const session = await getSession();
    const config = hasDatabase() ? await getAutomationConfig() : null;
    const keys = {
      openai: session.apiKeys?.openai || process.env.OPENAI_API_KEY,
      anthropic: session.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY,
      google: session.apiKeys?.google || process.env.GEMINI_API_KEY,
    };
    const blogId = config?.categoryBlogMap[body.category];
    const performanceGuidance = hasDatabase()
      ? await getPerformanceGuidance(blogId)
      : null;
    const storedArticles = hasDatabase()
      ? await getRecentArticles(40, blogId)
      : [];
    if (config) {
      const recoveryCostFactor =
        body.recoveryMode === "review_only"
          ? 0.35
          : body.recoveryMode === "content_repair"
            ? 0.7
            : 1;
      const reservation = await reserveEstimatedCost({
        jobId: body.id || null,
        blogId,
        kind: `manual-production-${randomUUID()}`,
        amountWon: Math.ceil(
          Number(config.estimatedArticleCostWon || 0) * recoveryCostFactor,
        ),
        detail: {
          basis: "user-configured-estimate",
          mode: body.recoveryMode || "new_article",
          writerModel:
            session.writerModel || body.writerModel || config.writerModel,
          reviewerModel:
            session.reviewerModel || body.reviewerModel || config.reviewerModel,
        },
      });
      if (!reservation.allowed)
        return NextResponse.json(
          {
            error:
              "월 AI 예산 한도 때문에 작성을 시작하지 않았습니다. 수익 사령탑에서 예산을 조정하세요.",
            budget: reservation,
          },
          { status: 429 },
        );
    }
    const article = await produceArticle(body, {
      keys,
      writerModel:
        session.writerModel || body.writerModel || config?.writerModel || "",
      reviewerModel:
        session.reviewerModel ||
        body.reviewerModel ||
        config?.reviewerModel ||
        "",
      styleGuide:
        session.styleGuide ||
        body.styleGuide ||
        config?.categoryStyleMap[body.category] ||
        config?.styleGuide,
      existingArticles: [
        ...storedArticles,
        ...(Array.isArray(body.existingArticles) ? body.existingArticles : []),
      ].slice(0, 100),
      performanceGuidance,
    });
    if (config && body.id)
      await updateJob(body.id, { state: article.status, article });
    return NextResponse.json(article);
  } catch (error: any) {
    const sourceBlocked = isSourceBlockedError(error);
    if (body?.id && hasDatabase())
      await updateJob(body.id, {
        state: sourceBlocked ? "source_blocked" : "error",
        error: error.message || "글 작성·검수 실패",
      }).catch(() => {});
    return NextResponse.json(
      {
        code: sourceBlocked ? "SOURCE_BLOCKED" : "PRODUCTION_FAILED",
        state: sourceBlocked ? "source_blocked" : "error",
        error: error.message || "글 작성·검수에 실패했습니다.",
        ...(sourceBlocked
          ? { attempts: error.attempts, reasons: error.reasons }
          : {}),
      },
      { status: sourceBlocked ? 422 : 500 },
    );
  }
}
