import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {createLocalDB} from "../server/sqlite.mjs";
import {seedExamples,EXAMPLES} from "../server/seed.mjs";
import {handleAPI} from "../server/api.mjs";
import {parseStudioDraft,studioHTML} from "../public/assets/studio.js";
import {escapeHtml as h} from "../public/assets/format.js";
const db=createLocalDB(),env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator"};
await seedExamples(db);
async function get(path,params={},identity=null){
  const response=await handleAPI(new Request("https://seed.test"+path+"?"+new URLSearchParams(params)),env,{identity});
  return {status:response.status,data:await response.json()};
}
async function search(params={}){const result=await get("/api/discovery",params);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;}
assert.equal((await search()).total,EXAMPLES.length);
assert.equal((await search({q:"인공지능"})).ideas[0].id,"seed-1");
assert.equal((await search({q:"ＡＩ"})).ideas[0].id,"seed-1");
assert.equal((await search({q:"회의메모"})).ideas[0].id,"seed-1");
assert.equal((await search({q:"ㄱㄹ ㄹㅌ"})).ideas[0].id,"seed-6");
assert.ok((await search({q:"로컬"})).ideas.some(idea=>idea.id==="seed-2"));
assert.equal((await search({q:"없는단어qwertyasdf"})).total,0);
console.log("PASS ranked public search, Korean spacing/initials, full-width input and synonyms");

const life=await search({category:"service",maturity:"developed",min:"5000",max:"7000"});
assert.ok(life.total>0);assert.ok(life.ideas.every(x=>x.category==="service"&&x.maturity==="developed"&&x.viewPrice>=5000&&x.viewPrice<=7000));
assert.ok((await search({topic:"service-local"})).ideas.every(x=>x.category==="service"&&x.topic==="service-local"));
assert.ok((await search({topic:"service-local"})).facets.topics["service-local"]>0);
const lowUse=await search({priceType:"use",sort:"price-low",max:"70000"});
assert.ok(lowUse.ideas.length>0);assert.ok(lowUse.ideas.every(x=>x.usePrice<=70000));assert.deepEqual(lowUse.ideas.map(x=>x.usePrice),lowUse.ideas.map(x=>x.usePrice).toSorted((a,b)=>a-b));
const page1=await search({limit:"2",page:"1"}),page2=await search({limit:"2",page:"2"});
assert.equal(page1.total,EXAMPLES.length);assert.equal(page1.pages,Math.ceil(EXAMPLES.length/2));assert.equal(page1.ideas.length,2);assert.ok(!page1.ideas.some(a=>page2.ideas.some(b=>a.id===b.id)));
assert.deepEqual((await search({limit:"2",page:"2"})).ideas.map(x=>x.id),page2.ideas.map(x=>x.id));
assert.equal((await search({limit:"2",page:"999"})).page,Math.ceil(EXAMPLES.length/2));
for(const bad of [{min:"NaN"},{min:"9000",max:"1000"},{category:"__proto__"},{category:"music",topic:"software-ai"},{status:"pending"},{limit:"100"},{page:"0"},{q:"x".repeat(101)}])assert.equal((await get("/api/discovery",bad)).status,400);
assert.equal((await search({q:"' OR 1=1--"})).total,0);
console.log("PASS combined topic/maturity/price filters, price basis, stable pagination and input validation");

await db.prepare("UPDATE idea_details SET solution='PRIVATE-UNIQUE-NEVER-INDEX-THIS' WHERE idea_id='seed-1'").run();
for(const [id,state] of [["hidden-pending","pending"],["hidden-rejected","rejected"],["hidden-suspended","suspended"]]){
  await db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,status,art,created_at) VALUES(?,'sample-creator',?,'숨긴검색어 전용 공개 요약','tech','seed',1000,10000,'[\"숨긴검색어\"]','active','ai','2026-10-20T00:00:00.000Z')").bind(id,"숨긴검색어 "+id).run();
  await db.prepare("INSERT INTO idea_reviews(idea_id,status,reason,created_at) VALUES(?,?,?,?)").bind(id,state,"PRIVATE-REVIEW-REASON",new Date().toISOString()).run();
}
assert.equal((await search({q:"PRIVATE-UNIQUE-NEVER-INDEX-THIS"})).total,0);
assert.equal((await search({q:"숨긴검색어",status:"all"})).total,0);
assert.equal((await get("/api/discovery",{q:"숨긴검색어"},{id:"operator"})).data.total,0);
assert.deepEqual((await get("/api/discovery/suggest",{q:"숨긴검색어"})).data.suggestions,[]);
const suggestions=(await get("/api/discovery/suggest",{q:"AI"})).data.suggestions;
assert.ok(suggestions.length>0);assert.ok(suggestions.length<=6);assert.ok(suggestions.every(x=>Object.keys(x).sort().join(",")==="kind,label,q"));
assert.deepEqual((await get("/api/discovery/suggest",{q:"AI",category:"product"})).data.suggestions,[]);
const publicResult=JSON.stringify(await search({status:"all"}));
for(const key of ["PRIVATE-UNIQUE","PRIVATE-REVIEW","solution","content_hash","imageIds","seller_id"])assert.ok(!publicResult.includes(key));
await db.prepare("UPDATE ideas SET status='sold' WHERE id='seed-2'").run();
assert.ok(!(await search()).ideas.some(x=>x.id==="seed-2"));
assert.ok((await search({status:"sold"})).ideas.some(x=>x.id==="seed-2"));
assert.ok(!(await get("/api/discovery/suggest",{q:"동네 오디오"})).data.suggestions.some(x=>x.q.includes("동네 오디오")));
console.log("PASS search/suggestion privacy boundaries, hidden review states and sold visibility");

// Existing accounts must retain access to saved metadata beyond the current result page.
await db.prepare("INSERT INTO users(id,role,name,created_at) VALUES('bookmark-buyer','buyer','저장한 구매자',?)").bind(new Date().toISOString()).run();
await db.prepare("INSERT INTO bookmarks(user_id,idea_id) VALUES('bookmark-buyer','seed-9')").run();
const account=(await get("/api/account",{},{id:"bookmark-buyer"})).data;
assert.equal(account.bookmarkedIdeas[0].id,"seed-9");assert.ok(!JSON.stringify(account.bookmarkedIdeas).includes("solution"));
for(let i=0;i<310;i++)await db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,status,art,created_at) VALUES(?,'sample-creator',?,'공개 요약을 사용하는 페이지 경계 검증 자료','tech','seed',1000,10000,'[]','active','ai',?)").bind("page-test-"+String(i).padStart(3,"0"),i===0?"오래된단독검색어":"페이지 경계 샘플 "+i,"2025-01-01T00:00:00.000Z").run();
assert.equal((await search({q:"오래된단독검색어"})).ideas[0].id,"page-test-000");
assert.equal((await search({status:"all"})).total,EXAMPLES.length+310);
console.log("PASS complete catalog search beyond 300 listings and saved-account metadata across pagination");

const raw=JSON.stringify({version:3,owner:"seller-a",savedAt:Date.now(),values:{title:"저장할 제목",solution:"비공개 작성 내용",sellerAgreement:"on",ownership:"on",privateImages:"never-store-files",unexpected:"ignored"}});
const draft=parseStudioDraft(raw,"seller-a");assert.equal(draft.values.solution,"비공개 작성 내용");
for(const key of ["sellerAgreement","ownership","privateImages","unexpected"])assert.ok(!Object.hasOwn(draft.values,key));
assert.equal(parseStudioDraft(raw,"seller-b"),null);assert.equal(parseStudioDraft("broken-json","seller-a"),null);assert.equal(parseStudioDraft("x".repeat(80001),"seller-a"),null);
const config=(await get("/api/config")).data,attack='<img src=x onerror="alert(1)">';
const html=studioHTML({config:{...config,sellerTerms:{...config.sellerTerms,text:attack}},header:()=>'<header><h2 id="dialog-title">판매 등록</h2></header>',icon:()=>'<svg aria-hidden="true"></svg>'});
assert.ok(!html.includes(attack));assert.ok(html.includes(h(attack)));
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);
for(const match of html.matchAll(/(?:aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g))for(const id of match[1].split(" "))assert.ok(ids.includes(id),"Missing ARIA target: "+id);
for(let i=0;i<4;i++)assert.ok(ids.includes("studio-panel-"+i));
assert.ok(html.includes('name="topic" required'));assert.ok(html.includes('name="sellerAgreement" required'));
await mkdir(".sites-runtime/ui-qa",{recursive:true});await writeFile(".sites-runtime/ui-qa/seller-studio.html","<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>Studio structure check</title></head><body>"+html+"</body></html>");
console.log("PASS account-scoped text-only drafts, untrusted policy escaping and four-step registration structure");
db.close();
console.log("ALL DISCOVERY AND STUDIO CHECKS PASSED (browser interaction is not covered)");
