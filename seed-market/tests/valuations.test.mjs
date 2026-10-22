import assert from "node:assert/strict";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {amountSummary,calibrationGroups,shareValueHash,valueSummaryCSV} from "../server/valuation-data.mjs";
import {VALUE_QUESTION_VERSION} from "../public/assets/valuation-policy.js";
import {SHARE_TERMS_VERSION} from "../public/assets/sharing-policy.js";
import {PRICE_LEVELS} from "../public/assets/pricing.js";
import {valueEntryHTML,valueFormHTML,valueResultsHTML,valueReportHTML} from "../public/assets/valuations.js";
import {escapeHtml as h} from "../public/assets/format.js";
import {createJourneyState} from "../public/assets/journeys.js";
import {mkdir,writeFile} from "node:fs/promises";

const stats=amountSummary([100000000,1000,0,3000,2000]);
assert.equal(stats.median,2000);assert.equal(stats.q1,1000);assert.equal(stats.q3,3000);assert.equal(stats.zeroCount,1);assert.equal(stats.outlierCount,1);assert.equal(stats.buckets.reduce((n,x)=>n+x.count,0),5);
assert.equal(amountSummary([]).median,null);assert.equal(amountSummary([1,2]).median,1.5);
const balanced=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>({share_id:"idea-"+i,user_id:"person-"+i+"-"+j,author_id:"author-"+Math.floor(i/2),category:"music",maturity:"developed",license:"discussion",view_amount:5000+i*1000,use_amount:null}))).flat();
let group=calibrationGroups(balanced)[0];assert.equal(group.view.balanced.ready,true);assert.equal(group.view.balanced.reviewP75,8000);assert.equal(group.use.balanced.ready,false);
const viral=Array.from({length:100},(_,i)=>({...balanced[0],share_id:"viral",user_id:"viral-"+i,author_id:"fourth-author",view_amount:1000000}));
group=calibrationGroups([...balanced,...viral])[0];assert.equal(group.view.median,1000000);assert.ok(group.view.balanced.reviewP75<10000);
assert.equal(calibrationGroups(balanced.map(row=>({...row,author_id:"one-author"})))[0].view.balanced.reviewP75,null);
assert.equal(calibrationGroups(balanced.map((row,i)=>({...row,user_id:"same-"+(i%5)})))[0].view.balanced.ready,false);
assert.equal(calibrationGroups(balanced.filter((_,i)=>i%5!==4))[0].view.balanced.eligibleIdeas,0);
assert.equal(calibrationGroups([...balanced,{...balanced[0],license:"attribution"},{...balanced[0],category:"business"}]).length,3);
assert.equal(calibrationGroups([...balanced,{...balanced[0],terms_version:"changed-terms"}]).length,2);
console.log("PASS median/IQR/zero amounts, outliers retained, equal idea weights and minimum participant/creator diversity");

const db=createLocalDB(),baseTime=Date.parse("2026-10-22T03:00:00.000Z"),policyBefore=JSON.stringify(PRICE_LEVELS),env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator"};
async function call(path,{user=null,method="GET",body,headers={},clock=baseTime}={}){
  const response=await handleAPI(new Request("https://seed.test"+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{identity:user?{id:user}:null,clock:()=>clock});
  return {status:response.status,data:response.headers.get("Content-Type")?.includes("application/json")?await response.json():await response.text()};
}
const post=(path,user,body,options={})=>call(path,{user,method:"POST",body,...options});
const good=async(promise,status=200)=>{const result=await promise;assert.equal(result.status,status,JSON.stringify(result.data));return result.data;};
for(const [user,role] of [["author","seller"],["author-two","seller"],["buyer-a","buyer"],["buyer-b","buyer"],["seller-voter","seller"],["quota-voter","buyer"]])await good(post("/api/signup",user,{role,name:user}),201);
const draft={title:"가치를 함께 살펴보는 음악 아이디어",summary:"생활 소리를 음악의 작은 소재로 연결하고 다른 사람들과 그 활용 가치를 살펴보는 무료 아이디어입니다.",body:"직접 만든 가상의 소리 구성과 짧은 리듬을 연결하는 기획을 공개합니다. 이 자료는 가격 의견의 저장과 공개·집계를 확인하기 위한 테스트이며 실제 외부 음악이나 타인의 자료를 포함하지 않습니다. ".repeat(2),category:"music",topic:"music-concept",license:"discussion",agree:true,termsVersion:SHARE_TERMS_VERSION};
async function share(user="author",input={}){
  const result=await good(post("/api/shares",user,{...draft,...input},{headers:{"Idempotency-Key":crypto.randomUUID()}}),201);
  await good(post("/api/admin/shares/"+result.id+"/review","operator",{status:"published",expectedStatus:"pending",expectedVersion:1,reason:"무료 공개 범위와 이용 조건을 확인한 테스트 승인입니다."}));return result.id;
}
const id=await share(),endpoint="/api/shares/"+id+"/value-opinions";
const context=await good(call(endpoint));assert.equal(context.summary.participants,0);assert.equal(context.sourceVersion,2);assert.equal(context.canSubmit,true);
const opinion={sourceHash:context.sourceHash,expectedShareVersion:context.sourceVersion,expectedRevision:0,questionVersion:VALUE_QUESTION_VERSION,maturity:"developed",viewAmount:3000,useAmount:20000,reason:"구체적인 구성안과 실행 순서가 있어 이 정도 금액을 제안합니다.",agree:true};
assert.equal((await post(endpoint,null,opinion)).status,401);assert.equal((await post(endpoint,"unregistered",opinion)).status,403);
assert.equal((await post(endpoint,"author",opinion)).status,403);assert.equal((await post(endpoint,"operator",opinion)).status,403);
for(const invalid of [{viewAmount:-1},{viewAmount:true},{viewAmount:"3000"},{viewAmount:1.5},{viewAmount:100000001},{viewAmount:null,useAmount:null},{maturity:"toString"},{agree:false},{questionVersion:"old"},{reason:"x".repeat(1001)}])assert.equal((await post(endpoint,"buyer-a",{...opinion,...invalid})).status,400);
assert.equal((await post(endpoint,"buyer-a",opinion,{headers:{Origin:"https://elsewhere.invalid"}})).status,403);
assert.equal((await post(endpoint,"buyer-a",{...opinion,sourceHash:"old"})).status,409);
const attempts=await Promise.all([post(endpoint,"buyer-a",opinion),post(endpoint,"buyer-a",opinion)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,201]);
const first=attempts[0].data.opinion;assert.equal(first.id,attempts[1].data.opinion.id);
assert.equal(first.sourceCategory,"music");assert.equal(first.sourceTermsVersion,SHARE_TERMS_VERSION);
assert.equal((await good(call(endpoint))).summary.participants,1);
const publicFirst=await good(call(endpoint));assert.equal(publicFirst.mine,null);assert.equal(Object.hasOwn(publicFirst.entries[0],"user_id"),false);assert.equal(Object.hasOwn(publicFirst.entries[0],"payload_hash"),false);assert.ok(!JSON.stringify(publicFirst).includes("buyer-a"));
const edited=await good(post(endpoint,"buyer-a",{...opinion,expectedRevision:1,viewAmount:0,useAmount:null,reason:"유료 구매보다는 무료 나눔이 적절하다고 생각합니다."}));
assert.equal(edited.opinion.revision,2);assert.equal((await good(call(endpoint))).summary.participants,1);assert.equal((await good(call(endpoint))).summary.view.zeroCount,1);assert.equal((await good(call(endpoint))).summary.use.count,0);
assert.equal((await post(endpoint,"buyer-a",{...opinion,expectedRevision:1,viewAmount:9999})).status,409);
await good(post(endpoint,"buyer-b",{...opinion,viewAmount:100000000,useAmount:0,reason:"다른 가격 의견을 확인하기 위한 극단값 테스트입니다."}),201);
await good(post(endpoint,"seller-voter",{...opinion,viewAmount:null,useAmount:30000}),201);
assert.equal((await good(call(endpoint))).summary.participants,3);
assert.equal((await good(call(endpoint))).summary.view.median,50000000);
console.log("PASS member/author/operator boundaries, one current opinion, replay/CAS edits, zero vs missing and private account data isolation");

assert.equal((await call("/api/admin/value-opinions/summary")).status,401);assert.equal((await call("/api/admin/value-opinions/summary",{user:"buyer-a"})).status,403);
const reportPath="/api/admin/value-opinions/summary?days=0";
let report=await good(call(reportPath,{user:"operator"}));assert.equal(report.totals.opinions,3);assert.equal(report.groups.length,1);assert.equal(report.groups[0].view.balanced.reviewP75,null);assert.equal(report.automaticPriceChange,false);
assert.equal((await good(call(reportPath+"&role=buyer",{user:"operator"}))).totals.opinions,2);assert.equal((await good(call(reportPath+"&role=seller",{user:"operator"}))).totals.opinions,1);
assert.equal((await good(call(reportPath+"&category=business",{user:"operator"}))).totals.opinions,0);
for(const query of ["days=-1","days=oops","role=operator","category=toString","maturity=unknown","category=music&topic=business-store"])assert.equal((await call("/api/admin/value-opinions/summary?"+query,{user:"operator"})).status,400);
const csv=await good(call("/api/admin/value-opinions/export?days=0&format=csv",{user:"operator"}));assert.match(csv,/중앙값/);assert.match(csv,/무료 나눔 가정 의견/);assert.ok(!csv.includes("buyer-a")&&!csv.includes(first.id)&&!csv.includes(opinion.reason));
const exported=await good(call("/api/admin/value-opinions/export?days=0&format=json",{user:"operator"}));assert.deepEqual(exported.groups,report.groups);
assert.equal((await call("/api/admin/value-opinions/export",{user:"buyer-a"})).status,403);
assert.equal((await call("/api/admin/value-opinions/export?format=html",{user:"operator"})).status,400);
assert.equal((await call("/api/admin/value-opinions/"+first.id,{user:"buyer-a"})).status,403);
assert.equal((await good(call("/api/admin/value-opinions/"+first.id,{user:"operator"}))).opinion.id,first.id);
assert.equal((await good(call("/api/value-opinions/mine",{user:"buyer-a"}))).opinions.length,1);assert.equal((await good(call("/api/value-opinions/mine",{user:"buyer-b"}))).opinions.length,1);
const moderation="/api/admin/value-opinions/"+first.id+"/moderate",why="다른 금액이라는 이유가 아닌 공개 의견 검토 절차를 확인하는 테스트입니다.";
assert.equal((await post(moderation,"buyer-b",{action:"exclude",expectedRevision:2,reason:why})).status,403);
await good(post(moderation,"operator",{action:"exclude",expectedRevision:2,reason:why}));
assert.equal((await good(call(endpoint))).summary.participants,2);assert.equal((await post(endpoint,"buyer-a",{...opinion,expectedRevision:3})).status,409);
assert.equal((await post("/api/value-opinions/"+first.id+"/withdraw","buyer-b",{expectedRevision:3})).status,404);
await good(post("/api/value-opinions/"+first.id+"/withdraw","buyer-a",{expectedRevision:3}));
await good(post(moderation,"operator",{action:"restore",expectedRevision:4,reason:"참여자가 철회한 의견은 복구해도 다시 집계되지 않아야 합니다."}));
assert.equal((await good(call(endpoint))).summary.participants,2);
assert.equal((await good(call("/api/value-opinions/mine",{user:"buyer-a"}))).opinions[0].counted,false);
await good(post(endpoint,"buyer-a",{...opinion,expectedRevision:5,viewAmount:5000}));assert.equal((await good(call(endpoint))).summary.participants,3);
console.log("PASS aggregate filters/export privacy, moderation, personal withdrawal and no resurrection of withdrawn votes");

const oldHash=context.sourceHash;
await good(post("/api/admin/shares/"+id+"/review","operator",{status:"rejected",expectedStatus:"published",expectedVersion:2,reason:"내용 보완 후 가격 의견을 새 자료와 분리하는 테스트입니다."}));
await good(post("/api/shares/"+id+"/revise","author",{...draft,body:draft.body+" 새로운 자료와 구성을 추가한 다른 버전입니다.",expectedVersion:3}));
await good(post("/api/admin/shares/"+id+"/review","operator",{status:"published",expectedStatus:"pending",expectedVersion:4,reason:"새 자료를 확인하고 공개를 승인하는 테스트입니다."}));
const revised=await good(call(endpoint));assert.notEqual(revised.sourceHash,oldHash);assert.equal(revised.summary.participants,0);assert.equal((await good(call(reportPath,{user:"operator"}))).totals.opinions,0);
assert.equal((await good(call("/api/value-opinions/mine",{user:"buyer-b"}))).opinions[0].counted,false);
assert.equal((await post(endpoint,"buyer-b",opinion)).status,409);
const second=(await good(post(endpoint,"buyer-b",{...opinion,sourceHash:revised.sourceHash,expectedShareVersion:5,viewAmount:1234,expectedRevision:0}),201)).opinion;
assert.equal((await good(call(reportPath,{user:"operator"}))).totals.opinions,1);
const future=baseTime+100*86400000;assert.equal((await good(call("/api/admin/value-opinions/summary?days=90",{user:"operator",clock:future}))).totals.opinions,0);
await good(post("/api/shares/"+id+"/hide","author",{expectedVersion:5}));assert.equal((await call(endpoint)).status,404);assert.equal((await good(call(reportPath,{user:"operator"}))).totals.opinions,0);
await good(post("/api/value-opinions/"+second.id+"/withdraw","buyer-b",{expectedRevision:1}));
assert.equal((await good(call("/api/value-opinions/mine",{user:"buyer-b"}))).opinions.find(row=>row.id===second.id).state,"withdrawn");
console.log("PASS source-content changes isolate old opinions, hidden posts leave calibration, period filtering and withdrawal after hiding");

const legacy=await share();await db.prepare("DELETE FROM share_value_sources WHERE share_id=?").bind(legacy).run();
const legacyContext=await good(call("/api/shares/"+legacy+"/value-opinions"));
await good(post("/api/shares/"+legacy+"/value-opinions","buyer-a",{...opinion,sourceHash:legacyContext.sourceHash,expectedShareVersion:2}),201);
assert.equal((await good(call(reportPath,{user:"operator"}))).totals.opinions,1);
const row=await db.prepare("SELECT * FROM shared_ideas WHERE id=?").bind(legacy).first();assert.equal(await shareValueHash(row),legacyContext.sourceHash);
const originalBatch=db.batch;let raced=false;
db.batch=async statements=>{if(!raced){raced=true;await db.prepare("UPDATE shared_ideas SET status='hidden',version=version+1 WHERE id=?").bind(legacy).run();}return originalBatch(statements);};
try{assert.equal((await post("/api/shares/"+legacy+"/value-opinions","buyer-b",{...opinion,sourceHash:legacyContext.sourceHash,expectedShareVersion:2})).status,409);}finally{db.batch=originalBatch;}
assert.equal((await db.prepare("SELECT count(*) AS n FROM share_value_opinions WHERE share_id=? AND user_id='buyer-b'").bind(legacy).first()).n,0);
assert.equal(JSON.stringify(PRICE_LEVELS),policyBefore);
assert.equal((await db.prepare("SELECT count(*) AS n FROM orders").first()).n,0);
assert.ok((await db.prepare("SELECT count(*) AS n FROM audit_events WHERE action LIKE 'value.%'").first()).n>=7);
assert.ok(!valueSummaryCSV(report).includes("user_id"));
const savedEvent=await db.prepare("SELECT detail FROM audit_events WHERE action='value.opinion' AND target_id=? ORDER BY created_at LIMIT 1").bind(first.id).first();assert.equal(typeof JSON.parse(savedEvent.detail).viewAmount,"number");
console.log("PASS legacy-source support, concurrent publication change, unchanged recommended caps, no orders and historical amount audits");

const attack='</textarea><img src=x onerror="window.PWNED=1">';
const button=(action,label,id="",cls="button")=>'<button type="button" class="'+h(cls)+'" data-action="'+h(action)+'" data-id="'+h(id)+'">'+h(label)+'</button>';
const templateData={...publicFirst,title:attack,sourcePreview:{summary:attack,body:attack,licenseText:attack},entries:[{...publicFirst.entries[0],reason:attack}],mine:null};
const templates={"value-entry":valueEntryHTML(attack),"value-form":valueFormHTML(templateData,{button}),"value-results":valueResultsHTML(templateData,{button}),"value-report":valueReportHTML({...report,groups:report.groups.map(g=>({...g,categoryLabel:attack}))},{button})};
assert.ok(templates['value-form'].includes('name="viewAmount" min="0"'));assert.equal(templates['value-form'].includes('value="3000"'),false);
assert.ok(!templates['value-form'].includes('data-action="value-results"'));assert.ok(!templates['value-form'].includes('checked'));
await mkdir('.sites-runtime/ui-qa',{recursive:true});
for(const [name,html] of Object.entries(templates)){assert.ok(!html.includes(attack));const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);await writeFile('.sites-runtime/ui-qa/'+name+'.html','<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Template verification</title></head><body>'+html+'</body></html>');}
const journey=createJourneyState(null);journey.remember({type:"value-opinion",id,role:null});assert.equal(journey.take('buyer').id,id);journey.remember({type:"value-opinion",id:'<script>',role:null});assert.equal(journey.take('buyer'),null);journey.remember({type:'value-mine',role:null});assert.equal(journey.take('seller').type,'value-mine');
console.log("PASS escaped opinion/statistics templates, no prefilled price anchors, unchecked consent and login continuation");

const bulk=await share('author-two'),bulkContext=await good(call('/api/shares/'+bulk+'/value-opinions'));
await db.prepare("INSERT INTO users(id,role,name,created_at) WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<20000) SELECT 'bulk-user-'||x,'buyer','bulk',? FROM n").bind(new Date(baseTime).toISOString()).run();
await db.prepare("INSERT INTO share_value_opinions(id,share_id,user_id,source_hash,source_version,source_title,source_category,source_topic,source_license,source_license_text,source_terms_version,question_version,maturity,view_amount,use_amount,reason,role_snapshot,state,moderation,revision,payload_hash,write_token,created_at,updated_at) SELECT 'bulk-opinion-'||u.id,s.id,u.id,?,s.version,s.title,s.category,s.topic,s.license,s.license_text,s.terms_version,?,'developed',1000,NULL,'','buyer','active','normal',1,'fixture','fixture',?,? FROM users u CROSS JOIN shared_ideas s WHERE u.id LIKE 'bulk-user-%' AND s.id=?").bind(bulkContext.sourceHash,VALUE_QUESTION_VERSION,new Date(baseTime).toISOString(),new Date(baseTime).toISOString(),bulk).run();
assert.equal((await call('/api/shares/'+bulk+'/value-opinions')).status,422);
assert.equal((await call(reportPath,{user:'operator'})).status,422);
assert.equal((await call('/api/admin/value-opinions/export?days=0',{user:'operator'})).status,422);
assert.equal((await good(call(reportPath+'&category=business',{user:'operator'}))).totals.opinions,0);
db.close();console.log("PASS oversized reports fail explicitly instead of silently truncating calibration data");
