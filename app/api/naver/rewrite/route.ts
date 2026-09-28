import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateWithModel, parseJson, providerFor } from "@/lib/models";
import {
  NAVER_WRITER_SCHEMA,
  NAVER_WRITER_SYSTEM,
  naverPrompt,
  sanitizeNaverHtml,
  sanitizeNaverTitle,
} from "@/lib/naver";

export const maxDuration = 120;

async function postToLocalBridge(payload: any) {
  const bridgeUrl = process.env.NAVER_BRIDGE_URL;
  if (!bridgeUrl) return { configured: false as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { configured: true as const, ok: false as const, error: data.error || `네이버 브리지 오류(${response.status})` };
    }
    return { configured: true as const, ok: true as const, data };
  } catch (error: any) {
    return { configured: true as const, ok: false as const, error: error?.message || "로컬 네이버 브리지에 연결하지 못했습니다." };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const article = body?.article;
    if (!article?.title || !article?.html)
      return NextResponse.json({ code: "NAVER_INPUT_INVALID", error: "네이버로 변환할 완성 글이 없습니다." }, { status: 400 });
    const session = await getSession();
    const model = session.writerModel || body.writerModel || process.env.NAVER_WRITER_MODEL || "gpt-5.6-terra";
    const provider = providerFor(model);
    const key = session.apiKeys?.[provider] || process.env[`${provider === "openai" ? "OPENAI" : provider === "anthropic" ? "ANTHROPIC" : "GEMINI"}_API_KEY`];
    if (!key)
      return NextResponse.json({ code: "NAVER_WRITER_KEY_MISSING", error: `네이버용 재작성 모델(${provider}) API 키가 연결되지 않았습니다.` }, { status: 400 });
    const raw = await generateWithModel({
      model,
      keys: { [provider]: key },
      system: NAVER_WRITER_SYSTEM,
      prompt: naverPrompt({ ...article, category: body.category, keyword: body.keyword }),
      jsonSchema: NAVER_WRITER_SCHEMA,
      schemaName: "naver_blog_draft",
      maxTokens: 4800,
    });
    const rewritten = parseJson<any>(raw);
    const naverArticle = {
      title: sanitizeNaverTitle(rewritten.title),
      html: sanitizeNaverHtml(rewritten.html),
      labels: Array.isArray(rewritten.labels) ? rewritten.labels.slice(0, 10).map(String) : [],
      rewriteNotes: Array.isArray(rewritten.rewriteNotes) ? rewritten.rewriteNotes.slice(0, 8).map(String) : [],
    };
    const bridge = await postToLocalBridge({
      jobId: body.jobId || null,
      article: naverArticle,
      editorUrl: "https://blog.naver.com/PostWriteForm.naver",
    });
    if (bridge.configured && !bridge.ok)
      return NextResponse.json({ code: "NAVER_DRAFT_FAILED", error: bridge.error, naverArticle, bridgeConfigured: true }, { status: 502 });
    return NextResponse.json({
      ok: bridge.configured ? Boolean(bridge.ok) : false,
      mode: bridge.configured ? "local_browser" : "rewrite_only",
      code: bridge.configured ? "NAVER_DRAFT_SAVED" : "NAVER_BRIDGE_REQUIRED",
      naverArticle,
      bridgeConfigured: bridge.configured,
      bridge: bridge.configured ? bridge.data : undefined,
      editorUrl: "https://blog.naver.com/PostWriteForm.naver",
    });
  } catch (error: any) {
    return NextResponse.json({ code: "NAVER_REWRITE_FAILED", error: error?.message || "네이버용 글 재작성에 실패했습니다." }, { status: 500 });
  }
}
