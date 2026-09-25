import OpenAI from "openai";
import { google } from "googleapis";
import { getAuthorizedClient, listCurrentUserBlogs } from "@/lib/google";
import { parseJson } from "@/lib/models";
import {
  getAutomationConfig,
  reserveEstimatedCost,
  savePerformanceReport,
} from "@/lib/store";

type Metric = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type BlogPost = {
  title: string;
  url: string;
  published?: string;
  updated?: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
function shift(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function urlKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return value;
  }
}
function matchProperty(blogUrl: string, properties: string[]) {
  const host = hostname(blogUrl);
  return (
    properties.find(
      (site) => site.startsWith("sc-domain:") && host.endsWith(site.slice(10)),
    ) ||
    properties.find(
      (site) => !site.startsWith("sc-domain:") && blogUrl.startsWith(site),
    ) ||
    properties.find((site) => hostname(site) === host)
  );
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

async function pageMetrics(
  search: any,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<Metric[]> {
  const { data } = await search.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      type: "web",
      dataState: "final",
      rowLimit: 25000,
    },
  });
  return (data.rows || []).map((row: any): Metric => ({
    page: row.keys?.[0] || "",
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }));
}

async function queryMetrics(
  search: any,
  siteUrl: string,
  startDate: string,
  endDate: string,
) {
  const { data } = await search.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page", "query"],
      type: "web",
      dataState: "final",
      rowLimit: 25000,
    },
  });
  return (data.rows || []).slice(0, 300).map((row: any) => ({
    page: row.keys?.[0] || "",
    query: row.keys?.[1] || "",
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }));
}

async function publishedPosts(
  blogger: any,
  blogId: string,
): Promise<BlogPost[]> {
  const posts: BlogPost[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await blogger.posts.list({
      blogId,
      status: ["live"],
      maxResults: 500,
      pageToken,
      fields: "items(title,url,published,updated),nextPageToken",
    });
    posts.push(
      ...(data.items || []).map((post: any) => ({
        title: post.title || "제목 없음",
        url: post.url || "",
        published: post.published || undefined,
        updated: post.updated || undefined,
      })),
    );
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  return posts.filter((post) => post.url);
}

function ageInDays(value?: string) {
  if (!value) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}

async function inspectIndex(
  search: any,
  siteUrl: string,
  inspectionUrl: string,
) {
  try {
    const { data } = await search.urlInspection.index.inspect({
      requestBody: { inspectionUrl, siteUrl, languageCode: "ko-KR" },
    });
    const index = data.inspectionResult?.indexStatusResult;
    return {
      checked: true,
      verdict: index?.verdict || "VERDICT_UNSPECIFIED",
      coverageState: index?.coverageState || "",
      robotsTxtState: index?.robotsTxtState || "",
      indexingState: index?.indexingState || "",
      pageFetchState: index?.pageFetchState || "",
      lastCrawlTime: index?.lastCrawlTime || null,
      googleCanonical: index?.googleCanonical || null,
      userCanonical: index?.userCanonical || null,
      sitemap: index?.sitemap || [],
    };
  } catch (error: any) {
    return {
      checked: false,
      error: error.message || "색인 상태 확인 실패",
    };
  }
}

function lowExposureSignals(item: any, minAgeDays: number) {
  if (item.ageDays !== null && item.ageDays < minAgeDays)
    return ["신규 글 관찰 기간"];
  const signals: string[] = [];
  if (item.index?.checked && item.index.verdict !== "PASS")
    signals.push("색인 상태 확인 필요");
  if (item.index?.robotsTxtState === "BLOCKED")
    signals.push("robots.txt 차단 가능성");
  if (item.index?.pageFetchState && item.index.pageFetchState !== "SUCCESSFUL")
    signals.push("Google 페이지 가져오기 문제");
  if (
    item.index?.googleCanonical &&
    item.index?.userCanonical &&
    item.index.googleCanonical !== item.index.userCanonical
  )
    signals.push("대표 URL 불일치");
  if (item.impressions === 0)
    signals.push("검색 노출 없음: 수요·주제 정합성·순위 점검");
  else if (item.position > 30) signals.push("매우 낮은 평균 검색 순위");
  else if (item.position > 15) signals.push("낮은 평균 검색 순위");
  else signals.push("노출 가능한 검색어 범위가 좁을 가능성");
  return signals;
}

function summaryOf(rows: Metric[]) {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const weightedPosition = impressions
    ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
      impressions
    : 0;
  return {
    pages: rows.length,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedPosition,
  };
}

async function analyzeWithOpenAI(input: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("성과 학습에는 OPENAI_API_KEY가 필요합니다.");
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      confidence: { type: "string", enum: ["높음", "중간", "낮음"] },
      patterns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            signal: { type: "string" },
            evidence: { type: "string" },
            hypothesis: { type: "string" },
            action: { type: "string" },
            confidence: { type: "string", enum: ["높음", "중간", "낮음"] },
          },
          required: [
            "signal",
            "evidence",
            "hypothesis",
            "action",
            "confidence",
          ],
        },
      },
      topicGuidance: { type: "array", items: { type: "string" } },
      titleGuidance: { type: "array", items: { type: "string" } },
      structureGuidance: { type: "array", items: { type: "string" } },
      avoid: { type: "array", items: { type: "string" } },
      lowExposureGuidance: { type: "array", items: { type: "string" } },
    },
    required: [
      "summary",
      "confidence",
      "patterns",
      "topicGuidance",
      "titleGuidance",
      "structureGuidance",
      "avoid",
      "lowExposureGuidance",
    ],
  };
  const response = await new OpenAI({ apiKey }).responses.create({
    model:
      process.env.PERFORMANCE_MODEL ||
      process.env.RESEARCH_MODEL ||
      "gpt-5.6-terra",
    reasoning: { effort: "medium" },
    tools: [{ type: "web_search" }],
    input: `Google Search Console의 최근 28일과 직전 28일 데이터, Blogger 발행일, URL 색인 상태를 분석해 다음 글 작성에 적용할 편집 학습을 만든다. 저노출 글의 제목·검색어에 대해서는 Google Trends, 자동완성·관련 검색, 공공·사업자 자료 등 공개 관심 신호를 웹에서 교차 확인한다.\n\n${JSON.stringify(input)}\n\n규칙:\n- 상관관계를 원인으로 단정하지 말고 가설이라고 표현한다.\n- 노출 ${input.minImpressions} 미만 페이지도 저노출 진단 대상으로 분석하되 품질 실패로 단정하지 않는다.\n- 발행 ${input.minAgeDays}일 미만 글은 관찰 대상으로만 표시하고 개선 학습에 사용하지 않는다.\n- 색인 실패, robots 차단, 가져오기 실패, 대표 URL 불일치는 콘텐츠 품질 문제와 분리한다.\n- 색인됐지만 노출이 적다면 검색 수요 부족, 주제·검색 의도 정합성, 낮은 순위, 좁은 검색어 범위를 서로 다른 가설로 다룬다.\n- 자동완성 순서를 검색량 순위로 간주하지 말고, 확인할 수 없는 검색량·경쟁률 수치를 만들지 않는다.\n- 제목 매력도는 주로 노출 이후 CTR 문제로 다루고, 저노출의 단독 원인으로 단정하지 않는다.\n- 한 페이지나 한 검색어만으로 블로그 전체에 일반화하지 않는다. 반복 신호가 없으면 페이지별 점검으로만 남긴다.\n- 높은 노출+낮은 CTR은 제목/설명/검색의도 정합성 가설, 충분한 노출+낮은 순위는 의도·범위·신뢰 근거 가설로 구분한다.\n- 검색량, 경쟁률, 독자 행동을 데이터에 없으면 만들지 않는다.\n- 잘된 글의 문장을 복제하거나 키워드 반복을 권하지 않는다. 구체적이고 재사용 가능한 한국어 지침만 출력한다.\n- 설명이나 Markdown 코드 블록 없이 아래 JSON 스키마를 만족하는 JSON 객체 하나만 출력한다.\nJSON 스키마: ${JSON.stringify(schema)}`,
  });
  return parseJson<any>(response.output_text);
}

export async function refreshPerformanceLearning(costRunId?: string) {
  const auth = await getAuthorizedClient();
  const blogger = google.blogger({ version: "v3", auth });
  const search = google.searchconsole({ version: "v1", auth });
  const [blogItems, { data: siteData }] = await Promise.all([
    listCurrentUserBlogs(auth),
    search.sites.list(),
  ]);
  const properties = (siteData.siteEntry || [])
    .map((entry: any) => entry.siteUrl)
    .filter(Boolean) as string[];
  const end = shift(new Date(), -3);
  const start = shift(end, -27);
  const previousEnd = shift(start, -1);
  const previousStart = shift(previousEnd, -27);
  const minImpressions = Number(process.env.PERFORMANCE_MIN_IMPRESSIONS || 100);
  const minAgeDays = Number(process.env.PERFORMANCE_MIN_AGE_DAYS || 14);
  const maxInspections = Number(
    process.env.PERFORMANCE_MAX_URL_INSPECTIONS || 20,
  );
  const results: any[] = [];
  const costConfig = costRunId ? await getAutomationConfig() : null;

  for (const blog of blogItems) {
    const base = {
      blogId: blog.id!,
      blogName: blog.name || "이름 없는 블로그",
      blogUrl: blog.url || "",
    };
    const siteUrl = matchProperty(base.blogUrl, properties);
    if (!siteUrl) {
      const report = {
        message:
          "이 Blogger 주소와 일치하는 Search Console 속성을 찾지 못했습니다.",
        availableProperties: properties.length,
      };
      await savePerformanceReport({
        ...base,
        status: "property_missing",
        report,
      });
      results.push({ ...base, status: "property_missing", ...report });
      continue;
    }
    try {
      const [current, previous, queries, posts] = await Promise.all([
        pageMetrics(search, siteUrl, isoDate(start), isoDate(end)),
        pageMetrics(
          search,
          siteUrl,
          isoDate(previousStart),
          isoDate(previousEnd),
        ),
        queryMetrics(search, siteUrl, isoDate(start), isoDate(end)),
        publishedPosts(blogger, blog.id!),
      ]);
      const summary = summaryOf(current);
      const previousSummary = summaryOf(previous);
      const eligible = current.filter(
        (row) => row.impressions >= minImpressions,
      );
      const currentByUrl = new Map(
        current.map((row) => [urlKey(row.page), row]),
      );
      const queriesByPage = new Map<string, any[]>();
      for (const query of queries) {
        const key = urlKey(query.page);
        const values = queriesByPage.get(key) || [];
        values.push(query);
        queriesByPage.set(key, values);
      }
      const lowExposureBase = posts
        .map((post) => ({
          ...post,
          ageDays: ageInDays(post.published),
          ...(currentByUrl.get(urlKey(post.url)) || {
            page: post.url,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            position: 0,
          }),
        }))
        .filter((post) => post.impressions < minImpressions)
        .sort((a, b) => a.impressions - b.impressions);
      const inspectTargets = lowExposureBase
        .filter((post) => post.ageDays === null || post.ageDays >= minAgeDays)
        .slice(0, maxInspections);
      const inspectionResults = await Promise.all(
        inspectTargets.map(async (post) => ({
          url: post.url,
          index: await inspectIndex(search, siteUrl, post.url),
        })),
      );
      const inspectionByUrl = new Map(
        inspectionResults.map((item) => [item.url, item.index]),
      );
      const lowExposurePages = lowExposureBase.slice(0, 50).map((post) => {
        const item = {
          ...post,
          index: inspectionByUrl.get(post.url) || {
            checked: false,
            reason:
              post.ageDays !== null && post.ageDays < minAgeDays
                ? "신규 글 관찰 기간"
                : "이번 분석의 색인 확인 한도 밖",
          },
        };
        return {
          ...item,
          queries: (queriesByPage.get(urlKey(post.url)) || []).slice(0, 10),
          signals: lowExposureSignals(item, minAgeDays),
        };
      });
      const matureLowExposure = lowExposurePages.filter(
        (page) => page.ageDays === null || page.ageDays >= minAgeDays,
      );
      const performanceSampleReady =
        eligible.length >= 3 && summary.impressions >= minImpressions * 5;
      const lowExposureSampleReady =
        matureLowExposure.length >= 2 ||
        matureLowExposure.some(
          (page) => page.index?.checked && page.index.verdict !== "PASS",
        );
      const queryPages = new Map<string, Set<string>>();
      for (const query of queries) {
        const pages = queryPages.get(query.query) || new Set<string>();
        pages.add(urlKey(query.page));
        queryPages.set(query.query, pages);
      }
      const cannibalizedQueries = [...queryPages.entries()]
        .filter(([, pages]) => pages.size > 1)
        .slice(0, 30)
        .map(([query, pages]) => ({ query, pages: [...pages] }));
      if (!performanceSampleReady && !lowExposureSampleReady) {
        const report = {
          summary,
          previousSummary,
          eligiblePages: eligible.length,
          excludedPages: current.length - eligible.length,
          minImpressions,
          minAgeDays,
          lowExposurePages,
          message:
            "성과 일반화 표본과 관찰 기간을 지난 저노출 글이 아직 부족합니다. 신규 글은 기다리고, 확인된 색인 문제는 별도로 표시합니다.",
        };
        await savePerformanceReport({
          ...base,
          siteUrl,
          status: "insufficient_data",
          report,
          periodStart: isoDate(start),
          periodEnd: isoDate(end),
        });
        results.push({
          ...base,
          siteUrl,
          status: "insufficient_data",
          ...report,
        });
        continue;
      }
      const ctrMedian = median(eligible.map((row) => row.ctr));
      const prior = new Map<string, Metric>(
        previous.map((row: Metric) => [row.page, row]),
      );
      const candidates = eligible
        .map((row) => ({
          ...row,
          previous: prior.get(row.page) || null,
          signals: [
            row.position <= 10 && row.ctr < Math.max(0.01, ctrMedian * 0.6)
              ? "상위권 대비 낮은 CTR"
              : null,
            row.position > 15 ? "충분한 노출 대비 낮은 평균 순위" : null,
            (prior.get(row.page)?.clicks || 0) >= 3 &&
            row.clicks < (prior.get(row.page)?.clicks || 0) * 0.7
              ? "직전 기간 대비 클릭 감소"
              : null,
          ].filter(Boolean),
        }))
        .filter((row) => row.signals.length)
        .slice(0, 30);
      if (costRunId && costConfig) {
        const reservation = await reserveEstimatedCost({
          jobId: `${costRunId}:${blog.id}`,
          blogId: blog.id,
          kind: "performance-analysis",
          amountWon: costConfig.estimatedAnalysisCostWon,
          detail: {
            basis: "user-configured-estimate",
            mode: costRunId.startsWith("manual") ? "manual" : "automatic",
          },
        });
        if (!reservation.allowed) {
          results.push({
            ...base,
            siteUrl,
            status: "budget_paused",
            message: "월 AI 예산 한도로 성과 AI 분석을 실행하지 않았습니다.",
          });
          continue;
        }
      }
      const learning = await analyzeWithOpenAI({
        blog: base,
        period: { start: isoDate(start), end: isoDate(end) },
        summary,
        previousSummary,
        minImpressions,
        eligiblePages: eligible.length,
        excludedPages: current.length - eligible.length,
        ctrMedian,
        candidates,
        topQueries: queries.slice(0, 40),
        minAgeDays,
        performanceSampleReady,
        lowExposureSampleReady,
        lowExposurePages: matureLowExposure.slice(0, 15),
        cannibalizedQueries,
      });
      const report = {
        summary,
        previousSummary,
        eligiblePages: eligible.length,
        excludedPages: current.length - eligible.length,
        minImpressions,
        minAgeDays,
        candidatePages: candidates.slice(0, 12),
        lowExposurePages,
        learning,
      };
      await savePerformanceReport({
        ...base,
        siteUrl,
        status: "ready",
        report,
        periodStart: isoDate(start),
        periodEnd: isoDate(end),
      });
      results.push({ ...base, siteUrl, status: "ready", ...report });
    } catch (error: any) {
      const report = { message: error.message || "성과 분석 실패" };
      await savePerformanceReport({
        ...base,
        siteUrl,
        status: "error",
        report,
        periodStart: isoDate(start),
        periodEnd: isoDate(end),
      });
      results.push({ ...base, siteUrl, status: "error", ...report });
    }
  }
  return results;
}
