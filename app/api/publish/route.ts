import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import {
  createBloggerDraft,
  getAuthorizedClient,
  updateBloggerDraft,
} from "@/lib/google";
import { sanitizeArticleHtml, sanitizeArticleTitle } from "@/lib/editorial";
import {
  getJobPublicationContext,
  hasDatabase,
  recordAuditEvent,
  updateJob,
} from "@/lib/store";

function validatePublishContent(
  title: string,
  html: string,
  sources: { url?: string }[] = [],
) {
  const safeTitle = sanitizeArticleTitle(title, "Blogger 제목");
  const safeHtml = sanitizeArticleHtml(html);
  if (safeHtml.replace(/<[^>]+>/g, " ").trim().length < 700)
    throw new Error(
      "Blogger 본문이 700자 미만이라 품질 기준을 통과하지 못합니다.",
    );
  if ((safeHtml.match(/<h2>/g) || []).length < 2)
    throw new Error("Blogger 본문에 핵심 소제목이 2개 이상 필요합니다.");
  const sourceHosts = new Set(
    sources
      .map((source) => {
        try {
          return new URL(source.url || "").hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  if (sourceHosts.size) {
    const citedHosts = new Set(
      [...safeHtml.matchAll(/href="(https?:\/\/[^"#]+)"/gi)]
        .map((match) => {
          try {
            return new URL(match[1]).hostname.replace(/^www\./, "");
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    );
    const minimum = Math.min(2, sourceHosts.size);
    const matched = [...sourceHosts].filter((host) =>
      citedHosts.has(host),
    ).length;
    if (matched < minimum)
      throw new Error(
        `Blogger 본문에 검증 출처 링크가 부족합니다(${matched}/${minimum}).`,
      );
  }
  return { safeTitle, safeHtml };
}

function isNotFound(error: any) {
  return Number(error?.code || error?.response?.status || 0) === 404;
}

function realtimeArticleIsStale(article: any) {
  if (article?.contentMode !== "realtime") return false;
  const producedAt = Date.parse(article?.producedAt || "");
  const hours = Number(article?.freshnessWindowHours || 24);
  if (!Number.isFinite(producedAt) || ![6, 24, 72, 168].includes(hours))
    return true;
  return Date.now() - producedAt > hours * 60 * 60 * 1000;
}

export async function POST(req: NextRequest) {
  try {
    const {
      action = "draft",
      blogId,
      postId,
      jobId,
      title,
      html,
      labels,
      article,
    } = await req.json();
    if (!blogId)
      return NextResponse.json(
        { error: "블로그 정보가 부족합니다." },
        { status: 400 },
      );
    const job =
      jobId && hasDatabase() ? await getJobPublicationContext(jobId) : null;
    if (job?.blogId && job.blogId !== blogId)
      return NextResponse.json(
        { error: "작업에 연결된 Blogger와 요청한 Blogger가 다릅니다." },
        { status: 409 },
      );

    if (action === "publish") {
      const publicationArticle = job?.article || article;
      if (realtimeArticleIsStale(publicationArticle))
        return NextResponse.json(
          {
            code: "REALTIME_REFRESH_REQUIRED",
            error:
              "실시간 관심 글의 현재성 확인 시간이 지났습니다. 공개 전에 ‘실시간 정보 다시 확인·재작성’을 실행하세요.",
          },
          { status: 409 },
        );
      if (!postId)
        return NextResponse.json(
          { error: "발행할 임시글 ID가 없습니다." },
          { status: 400 },
        );
      if (job?.postId && job.postId !== postId)
        return NextResponse.json(
          { error: "작업에 저장된 임시글과 요청한 글이 다릅니다." },
          { status: 409 },
        );
      if (job?.state === "published")
        return NextResponse.json({ id: postId, status: "published" });
      const auth = await getAuthorizedClient();
      const blogger = google.blogger({ version: "v3", auth });
      const currentDraft = await blogger.posts.get({ blogId, postId });
      try {
        validatePublishContent(
          currentDraft.data.title || "",
          currentDraft.data.content || "",
          job?.article?.sources || [],
        );
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message || "공개 전 품질 확인에 실패했습니다." },
          { status: 400 },
        );
      }
      const { data } = await blogger.posts.publish({ blogId, postId });
      if (jobId && hasDatabase())
        await updateJob(jobId, {
          state: "published",
          bloggerPostId: data.id || postId,
        });
      if (hasDatabase())
        await recordAuditEvent({
          action: "post_published",
          entityType: "article_job",
          entityId: jobId || postId,
          detail: { blogId, postId: data.id || postId, title: data.title },
        });
      return NextResponse.json({
        id: data.id,
        url: data.url,
        title: data.title,
        status: "published",
      });
    }

    let safeTitle = "";
    let safeHtml = "";
    try {
      ({ safeTitle, safeHtml } = validatePublishContent(
        title,
        html,
        article?.sources || [],
      ));
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Blogger 제목이 품질 기준에 맞지 않습니다." },
        { status: 400 },
      );
    }
    let recoveredDeletedDraft = false;
    let post:
      | Awaited<ReturnType<typeof createBloggerDraft>>
      | Awaited<ReturnType<typeof updateBloggerDraft>>;
    if (job?.postId) {
      try {
        post = await updateBloggerDraft(
          blogId,
          job.postId,
          { title: safeTitle, html: safeHtml, labels },
          jobId,
        );
      } catch (error: any) {
        if (!isNotFound(error)) throw error;
        recoveredDeletedDraft = true;
        post = await createBloggerDraft(
          blogId,
          { title: safeTitle, html: safeHtml, labels },
          jobId,
        );
      }
    } else {
      post = await createBloggerDraft(
        blogId,
        { title: safeTitle, html: safeHtml, labels },
        jobId,
      );
    }
    if (jobId && hasDatabase())
      await updateJob(jobId, {
        state: "draft",
        article: article
          ? { ...article, title: safeTitle, html: safeHtml }
          : { title: safeTitle, html: safeHtml, labels },
        bloggerPostId: post.id,
      });
    if (hasDatabase())
      await recordAuditEvent({
        action: recoveredDeletedDraft
          ? "draft_recreated"
          : "updated" in post && post.updated
            ? "draft_updated"
            : "reused" in post && post.reused
              ? "draft_reused"
              : "draft_created",
        entityType: "article_job",
        entityId: jobId || post.id,
        detail: { blogId, postId: post.id, title: safeTitle },
      });
    return NextResponse.json({
      ...post,
      status: "draft",
      recoveredDeletedDraft,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Blogger 발행 오류" },
      { status: 500 },
    );
  }
}
