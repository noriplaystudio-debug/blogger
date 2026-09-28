#!/usr/bin/env node
import http from "node:http";

const port = Number(process.env.NAVER_BRIDGE_PORT || 3210);
const cdpPort = Number(process.env.CHROME_DEBUG_PORT || 9222);

function respond(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(value));
}

async function findNaverTab() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const tabs = await response.json();
  return tabs.find((tab) => tab.type === "page" && /blog\.naver\.com/i.test(tab.url || ""));
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
    if (resolver) { pending.delete(message.id); resolver(message); }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return {
    ready,
    call: async (method, params = {}) => {
      await ready;
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
        }, 20000);
      });
    },
    close: () => ws.close(),
  };
}

async function saveDraft(article) {
  const tab = await findNaverTab();
  if (!tab) throw new Error("로그인된 네이버 블로그 탭을 먼저 열어 주세요.");
  const client = connect(tab.webSocketDebuggerUrl);
  try {
    const expression = `(() => {
      const title = ${JSON.stringify(article.title)};
      const html = ${JSON.stringify(article.html)};
      const titleEl = [
        'input[placeholder*="제목"]',
        'input[name="subject"]',
        'textarea[placeholder*="제목"]'
      ].map((selector) => document.querySelector(selector)).find(Boolean);
      if (titleEl) {
        titleEl.value = title;
        titleEl.dispatchEvent(new Event('input', {bubbles:true}));
        titleEl.dispatchEvent(new Event('change', {bubbles:true}));
      }
      const editable = document.querySelector('[contenteditable="true"]');
      if (editable) {
        editable.innerHTML = html;
        editable.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText'}));
      } else {
        const frame = [...document.querySelectorAll('iframe')].find((item) => item.contentDocument?.body);
        if (!frame) return {ok:false, reason:'EDITOR_NOT_FOUND'};
        frame.contentDocument.body.innerHTML = html;
        frame.contentDocument.body.dispatchEvent(new Event('input', {bubbles:true}));
      }
      const save = [...document.querySelectorAll('button,a')].find((el) => /임시저장|저장/.test((el.textContent || '').trim()));
      if (!save) return {ok:false, reason:'SAVE_BUTTON_NOT_FOUND'};
      save.click();
      return {ok:true};
    })()`;
    const result = await client.call("Runtime.evaluate", { expression, returnByValue: true });
    const value = result?.result?.result?.value;
    if (!value?.ok) throw new Error(value?.reason || "네이버 편집기에 입력하지 못했습니다.");
    return value;
  } finally {
    client.close();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return respond(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return respond(res, 200, {ok:true, service:"naver-bridge", cdpPort});
  if (req.method !== "POST" || req.url !== "/draft") return respond(res, 404, {error:"Not found"});
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    const body = JSON.parse(raw);
    const result = await saveDraft(body.article || {});
    return respond(res, 200, {saved:true, ...result});
  } catch (error) {
    return respond(res, 409, {saved:false, error:error?.message || "네이버 임시저장 실패"});
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Naver bridge listening on http://127.0.0.1:${port} (Chrome CDP ${cdpPort})`);
});
