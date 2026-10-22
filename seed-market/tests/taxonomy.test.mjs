import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {CATALOG,TOPICS,DOMAINS,KIND_GROUPS,TAXONOMY_VERSION,briefFor,classifyIdea} from "../public/assets/catalog.js";
import {TERMS_VERSION,SELLER_TERMS_VERSION} from "../server/policy.mjs";
import {parseStudioDraft} from "../public/assets/studio.js";
import {seedExamples,EXAMPLES} from "../server/seed.mjs";

const ids=Object.values(CATALOG).flatMap(data=>data.topics.map(x=>x[0]));
assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,Object.keys(TOPICS).length);
const html=await readFile("ui/index.html","utf8");
for(const [category,data] of Object.entries(CATALOG)){
  assert.ok(Object.hasOwn(KIND_GROUPS,data.group));assert.ok(html.includes('id="i-'+data.icon+'"'),"Missing icon: "+data.icon);
  assert.ok(data.topics.length>=2);assert.ok(data.topics.at(-1)[1].includes("그 밖")||category==="other");
  for(const [topic] of data.topics)assert.equal(TOPICS[topic].category,category);
}
assert.notEqual(briefFor("music").solution[0],briefFor("product").solution[0]);
assert.notEqual(briefFor("sports").execution[0],briefFor("writing").execution[0]);
assert.equal(classifyIdea({category:"life",title:"멜로디 앱의 작은 구상",summary:"두 가지 요소를 함께 제안합니다.",tags:[]}).classificationSource,"legacy-review");
assert.equal(classifyIdea({category:"life",title:"a small chair",summary:"a quiet proposal",tags:[]}).category,"other");
console.log("PASS complete kind/subtype hierarchy, grouped navigation icons and relevant registration prompts");

const db=createLocalDB(),files=new Map();
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator",BUCKET:{async put(id,data){files.set(id,data);},async delete(id){files.delete(id);}}};
async function call(path,{user,method="GET",body}={}){
  const response=await handleAPI(new Request("https://seed.test"+path,{method,...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})}),env,{identity:user?{id:user}:null});
  return {status:response.status,data:await response.json()};
}
for(const [user,role] of [["seller","seller"],["buyer","buyer"]])assert.equal((await call("/api/signup",{user,method:"POST",body:{role,name:user}})).status,201);
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64"));
async function image(){const response=await handleAPI(new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/png"},body:png}),env,{identity:{id:"seller"}});assert.equal(response.status,201);return (await response.json()).id;}
const base={title:"종류와 관련 분야를 구분한 구체적인 아이디어",summary:"아이디어의 중심 결과물과 활용 장면을 충분히 소개하는 공개 요약을 작성한 테스트 자료입니다.",maturity:"developed",viewPrice:5000,usePrice:99000,tags:["분류 확인"],problem:"이 구상의 의도와 배경을 구체적으로 설명하고 현재 상태와 해결하려는 과제를 함께 정리합니다. ".repeat(2),solution:"PRIVATE-TYPE-CONTENT "+"아이디어의 핵심 구성과 차별점, 제공할 결과물과 그 동작을 자세히 설명한 상세 자료입니다. ".repeat(3),audience:"구체적인 활용 장면과 대상 사용자를 검토하는 창작자와 실행자입니다.",execution:"실행을 위한 첫 단계와 필요한 자료를 구분하고 시범 진행으로 확인할 가설과 아직 검증하지 않은 부분을 기록합니다. ".repeat(2),deliverables:["구성 설명","실행 계획"],originality:"직접 작성한 기획과 직접 구성한 참고 이미지로 작성한 테스트 자료입니다.",validationNote:"아직 실제 사용성과 수요를 검증하지 않은 단계이며 첫 실험을 계획하고 있습니다.",risks:"실행 조건과 필요한 비용·권리를 추가로 확인해야 합니다.",sellerAgreement:true,sellerTermsVersion:SELLER_TERMS_VERSION,feeQuote:{viewBps:1000,useBps:1000,holdDays:7}};
const created={};
for(const [category,data] of Object.entries(CATALOG)){
  const topic=category==="product"?"product-sports":data.topics[0][0];
  const domainIds=["product","software","sports"].includes(category)?["health"]:data.group==="creative"?["culture"]:[];
  const result=await call("/api/ideas",{user:"seller",method:"POST",body:{...base,title:data.label+"에 관한 구체적인 기획 예시",category,topic,domainIds,imageIds:[await image()]}});
  assert.equal(result.status,201,category+": "+JSON.stringify(result.data));created[category]=result.data.id;
  assert.equal((await call("/api/admin/ideas/"+result.data.id+"/review",{user:"operator",method:"POST",body:{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"등록 종류와 공개 정보 및 상세 자료의 범위를 확인했습니다."}})).status,200);
  const publicData=(await call("/api/ideas/"+result.data.id)).data.idea;
  assert.equal(publicData.category,category);assert.equal(publicData.topic,topic);assert.equal(publicData.classificationSource,"seller");assert.deepEqual(publicData.domainIds,domainIds);
  const record=await db.prepare("SELECT kind,topic,domains,version FROM idea_classification WHERE idea_id=?").bind(result.data.id).first();
  assert.equal(record.version,TAXONOMY_VERSION);assert.equal(record.kind,category);
}
const health=(await call("/api/discovery?domain=health")).data;
assert.deepEqual(health.ideas.map(x=>x.category).sort(),["product","software","sports"].sort());
assert.equal((await call("/api/discovery?category=product&topic=product-sports&domain=health")).data.ideas[0].id,created.product);
assert.equal((await call("/api/discovery?category=music&maturity=developed")).data.ideas[0].id,created.music);
assert.equal((await call("/api/discovery?category=music&topic=product-sports")).status,400);
assert.equal((await call("/api/discovery?domain=not-a-domain")).status,400);
for(const bad of [{category:"tech",topic:"tech-ai"},{category:"professional",topic:"music-composition"},{category:"music",topic:"product-home"},{domainIds:["unknown"]},{domainIds:["health","health"]},{domainIds:Object.keys(DOMAINS).slice(0,4)}])assert.equal((await call("/api/ideas",{user:"seller",method:"POST",body:{...base,category:"music",topic:"music-composition",imageIds:["unused"],...bad}})).status,400);
assert.equal((await call("/api/ideas",{user:"buyer",method:"POST",body:base})).status,403);
console.log("PASS all 16 kinds registered through API; subtype/industry/maturity isolation and server validation");

// Emulate a v3 listing with an existing paid viewer. Reading the new taxonomy must not rewrite it.
const time=new Date().toISOString();
await db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,status,art,created_at) VALUES('legacy-paid','seller','기존 업무 도구의 협업 기획','작은 팀의 업무와 협업을 돕기 위한 서비스의 공개 요약입니다.','tech','developed',5000,99000,'[\"협업\"]','active','ai',?)").bind(time).run();
await db.prepare("INSERT INTO idea_taxonomy(idea_id,topic) VALUES('legacy-paid','tech-work')").run();
await db.prepare("INSERT INTO idea_details(idea_id,problem,solution,audience,execution,deliverables) VALUES('legacy-paid','원래 배경','PRIVATE-LEGACY-UNCHANGED','원래 대상','원래 실행안','[\"원래 자료\"]')").run();
await db.prepare("INSERT INTO orders(id,user_id,idea_id,kind,amount,mode,status,created_at) VALUES('legacy-order','buyer','legacy-paid','view',5000,'test','paid',?)").bind(time).run();
await db.prepare("INSERT INTO view_grants(idea_id,user_id,order_id,created_at) VALUES('legacy-paid','buyer','legacy-order',?)").bind(time).run();
const before=await db.prepare("SELECT * FROM ideas WHERE id='legacy-paid'").first();
const projection=(await call("/api/ideas/legacy-paid")).data.idea;
assert.equal(projection.category,"software");assert.equal(projection.topic,"software-work");assert.equal(projection.classificationSource,"legacy-mapped");
const oldURL=(await call("/api/discovery?category=tech&topic=tech-work")).data;
assert.ok(oldURL.ideas.some(x=>x.id==="legacy-paid"));
assert.equal((await call("/api/ideas/legacy-paid/details",{user:"buyer"})).data.details.solution,"PRIVATE-LEGACY-UNCHANGED");
assert.deepEqual(await db.prepare("SELECT * FROM ideas WHERE id='legacy-paid'").first(),before);
assert.equal((await db.prepare("SELECT amount FROM orders WHERE id='legacy-order'").first()).amount,5000);
assert.equal(await db.prepare("SELECT * FROM idea_classification WHERE idea_id='legacy-paid'").first(),null);
await db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,status,art,created_at) VALUES('legacy-unknown','seller','분류할 단서가 없는 구상','이름과 자세한 맥락을 밝히지 않은 짧은 공개 소개 문장입니다.','life','seed',1000,10000,'[]','active','notes',?)").bind(time).run();
const unknown=(await call("/api/discovery?q=단서가" )).data.ideas[0];assert.equal(unknown.category,"other");assert.equal(unknown.classificationSource,"legacy-review");
assert.equal((await call("/api/discovery?q=PRIVATE-LEGACY-UNCHANGED")).data.total,0);
console.log("PASS old category URLs and paid access survive non-destructive projection; ambiguous legacy ideas remain marked");

const oldDraft=parseStudioDraft(JSON.stringify({version:3,owner:"seller",savedAt:Date.now(),values:{category:"life",topic:"life-local",solution:"작성 중인 원래 상세 자료",title:"작성 중인 제목"}}),"seller");
assert.equal(oldDraft.values.solution,"작성 중인 원래 상세 자료");assert.equal(oldDraft.values.category,"");assert.equal(oldDraft.values.topic,"");assert.equal(oldDraft.needsClassification,true);
const newDraft=parseStudioDraft(JSON.stringify({version:4,taxonomyVersion:TAXONOMY_VERSION,owner:"seller",savedAt:Date.now(),values:{category:"music",topic:"music-lyrics",solution:"가사 기획"},domainIds:["culture"],ownership:true}),"seller");
assert.equal(newDraft.needsClassification,false);assert.deepEqual(newDraft.domainIds,["culture"]);assert.equal(newDraft.values.category,"music");assert.ok(!Object.hasOwn(newDraft.values,"ownership"));
console.log("PASS old draft content preserved with explicit re-selection, new draft domains and consent exclusion");
db.close();
const sampleDB=createLocalDB();await seedExamples(sampleDB);assert.equal((await sampleDB.prepare("SELECT count(*) AS n FROM ideas").first()).n,EXAMPLES.length);
await sampleDB.prepare("UPDATE ideas SET summary='기존 샘플에 남아 있는 내용' WHERE id='seed-1'").run();await seedExamples(sampleDB);
assert.equal((await sampleDB.prepare("SELECT summary FROM ideas WHERE id='seed-1'").first()).summary,"기존 샘플에 남아 있는 내용");
const represented=await sampleDB.prepare("SELECT DISTINCT kind FROM idea_classification").all();assert.deepEqual(represented.results.map(x=>x.kind).sort(),Object.keys(CATALOG).sort());sampleDB.close();
console.log("PASS all types represented by clearly fictional samples without overwriting existing local data");
console.log("ALL TAXONOMY CHECKS PASSED");
