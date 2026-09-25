import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonrepair } from "jsonrepair";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const responseCalls = (source) =>
  [...source.matchAll(/responses\.create\(\{([\s\S]*?)\n\s*\}\);/g)].map(
    ([, call]) => call,
  );

const google = read("lib/google.ts");
const blogs = read("app/api/blogs/route.ts");
const performance = read("lib/performance.ts");
const strategy = read("lib/strategy.ts");
const planning = read("lib/planning.ts");
const production = read("lib/production.ts");
const models = read("lib/models.ts");

const joined = [google, blogs, performance, strategy].join("\n");

assert.match(
  google,
  /https:\/\/www\.googleapis\.com\/blogger\/v3\/users\/self\/blogs/,
  "Blogger 목록은 공식 users/self/blogs 엔드포인트를 사용해야 합니다.",
);
assert.doesNotMatch(
  joined,
  /blogs\.listByUser/,
  "발견 API 래퍼의 목록 인자 회귀를 막기 위해 직접 최소 요청을 유지해야 합니다.",
);
assert.doesNotMatch(joined, /posts\(totalItems\)/);
assert.doesNotMatch(joined, /status:\s*\[\s*["'](?:LIVE|DRAFT|SCHEDULED)["']/);
assert.match(performance, /status:\s*\["live"\]/);
assert.match(strategy, /status:\s*\["live"\]/);
assert.match(blogs, /range:\s*\["7DAYS", "30DAYS", "all"\]/);

for (const source of [planning, production]) {
  assert.match(source, /tools:\s*\[\{ type: "web_search" \}\]/);
  assert.equal(
    responseCalls(source).some(
      (call) =>
        call.includes('tools: [{ type: "web_search" }]') &&
        /text:\s*\{\s*format:\s*\{\s*type:\s*"json_object"/.test(call),
    ),
    false,
    "웹 검색 호출에는 JSON mode를 함께 보내면 안 됩니다.",
  );
}

const repairedObject = JSON.parse(
  jsonrepair('{"categories":[{"name":"생활" "keywords":[]}]}'),
);
assert.equal(repairedObject.categories[0].name, "생활");
const repairedArray = JSON.parse(
  jsonrepair('[{"keyword":"전기요금" "score":90}]'),
);
assert.equal(repairedArray[0].score, 90);
assert.match(models, /export function parseJsonArray/);

console.log("PASS  Blogger·OpenAI 외부 API 계약 회귀 검사");
