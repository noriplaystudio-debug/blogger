import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";

export type Provider = "openai" | "anthropic" | "google";

export const MODEL_OPTIONS = [
  {
    id: "gpt-5.6-terra",
    provider: "openai" as Provider,
    label: "GPT-5.6 Terra",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic" as Provider,
    label: "Claude Sonnet 5",
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "google" as Provider,
    label: "Gemini 3.1 Pro Preview",
  },
];

export function providerFor(model: string): Provider {
  const found = MODEL_OPTIONS.find((x) => x.id === model);
  if (!found) throw new Error(`지원하지 않는 모델입니다: ${model}`);
  return found.provider;
}

function requireKey(
  keys: Record<string, string | undefined>,
  provider: Provider,
) {
  const key = keys[provider];
  if (!key) throw new Error(`${provider} API 키가 연결되지 않았습니다.`);
  return key;
}

export async function generateWithModel(args: {
  model: string;
  keys: Record<string, string | undefined>;
  system: string;
  prompt: string;
  json?: boolean;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
}) {
  const provider = providerFor(args.model);
  const apiKey = requireKey(args.keys, provider);
  const maxTokens = args.maxTokens || 7000;

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: args.model,
      instructions: args.system,
      input: args.prompt,
      max_output_tokens: maxTokens,
      ...(args.jsonSchema
        ? {
            text: {
              format: {
                type: "json_schema" as const,
                name: args.schemaName || "structured_response",
                schema: args.jsonSchema,
                strict: true,
              },
            },
          }
        : args.json
          ? { text: { format: { type: "json_object" as const } } }
          : {}),
    });
    return response.output_text;
  }

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: args.model,
      max_tokens: maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
      ...(args.jsonSchema
        ? {
            tools: [
              {
                name: "emit_structured_response",
                description:
                  "Return the complete structured response in the required schema.",
                input_schema: args.jsonSchema as any,
              },
            ],
            tool_choice: {
              type: "tool" as const,
              name: "emit_structured_response",
            },
          }
        : {}),
    });
    const toolResult = response.content.find(
      (item: any) =>
        item.type === "tool_use" && item.name === "emit_structured_response",
    ) as any;
    if (toolResult?.input) return JSON.stringify(toolResult.input);
    return response.content
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("\n");
  }

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: args.model,
    contents: args.prompt,
    config: {
      systemInstruction: args.system,
      maxOutputTokens: maxTokens,
      ...(args.json ? { responseMimeType: "application/json" } : {}),
      ...(args.jsonSchema
        ? {
            responseMimeType: "application/json",
            responseJsonSchema: args.jsonSchema,
          }
        : {}),
    },
  });
  return response.text || "";
}

export function parseJson<T>(raw: string): T {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0) throw new Error("모델 응답에서 JSON 결과를 찾지 못했습니다.");
  const candidate = cleaned.slice(start, end > start ? end + 1 : undefined);
  try {
    return JSON.parse(candidate) as T;
  } catch (originalError) {
    try {
      return JSON.parse(jsonrepair(candidate)) as T;
    } catch {
      const detail =
        originalError instanceof Error ? `: ${originalError.message}` : "";
      throw new Error(
        `AI 응답의 JSON 형식을 자동 복구하지 못했습니다${detail}`,
      );
    }
  }
}

export function parseJsonArray<T>(raw: string): T[] {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0)
    throw new Error("모델 응답에서 JSON 배열 결과를 찾지 못했습니다.");
  const candidate = cleaned.slice(start, end > start ? end + 1 : undefined);
  try {
    const value = JSON.parse(candidate);
    if (!Array.isArray(value)) throw new Error("JSON 결과가 배열이 아닙니다.");
    return value as T[];
  } catch (originalError) {
    try {
      const value = JSON.parse(jsonrepair(candidate));
      if (!Array.isArray(value))
        throw new Error("JSON 결과가 배열이 아닙니다.");
      return value as T[];
    } catch {
      const detail =
        originalError instanceof Error ? `: ${originalError.message}` : "";
      throw new Error(
        `AI 응답의 JSON 배열 형식을 자동 복구하지 못했습니다${detail}`,
      );
    }
  }
}
