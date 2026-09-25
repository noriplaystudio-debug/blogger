import OpenAI from "openai";

export function openaiClient() {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

export function extractCitations(response: any) {
  const found = new Map<string, string>();
  for (const item of response.output || []) {
    if (item.type === "web_search_call")
      for (const source of item.action?.sources || [])
        if (source.type === "url" && source.url)
          found.set(source.url, source.title || source.url);
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      for (const a of content.annotations || []) {
        if (a.type === "url_citation" && a.url)
          found.set(a.url, a.title || a.url);
      }
    }
  }
  return [...found].map(([url, title]) => ({ title, url }));
}
