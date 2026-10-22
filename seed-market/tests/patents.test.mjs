import assert from "node:assert/strict";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {TERMS_VERSION,SELLER_TERMS_VERSION} from "../server/policy.mjs";
import {validatePatentDeclaration,officialPatentUrl} from "../server/patents.mjs";
import {patentFromValues,patentToValues,patentSourceUrl} from "../public/assets/patent-policy.js";
import {patentDisclosureHTML,patentReviewHTML} from "../public/assets/patents.js";
import {patentDraft,patentReview} from "./patent-fixtures.mjs";

const db=createLocalDB(),objects=new Map();
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator",BUCKET:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}}};
async function call(path,{user,method="GET",body,key,environment=env}={}){
 const response=await handleAPI(new Request("https://seed.test"+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),environment,{identity:user?{id:user}:null});
 return {status:response.status,data:await response.json()};
}
const post=(path,user,body,extra={})=>call(path,{user,method:"POST",body,...extra});
for(const [user,role] of [["seller","seller"],["other-seller","seller"],["buyer","buyer"],["other-buyer","buyer"]])assert.equal((await post("/api/signup",user,{name:user,role})).status,201);
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64"));
async function upload(){const res=await handleAPI(new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/png"},body:png}),env,{identity:{id:"seller"}});assert.equal(res.status,201);return (await res.json()).id;}
const base={title:"특허 권리 검토의 전체 거래 흐름 검증",summary:"검토 자료를 판매자가 신고하고 구매자가 확인된 범위를 구분해서 읽을 수 있도록 하는 구체적인 테스트 기획입니다.",category:"product",topic:"product-home",maturity:"developed",viewPrice:5000,usePrice:99000,tags:[],problem:"사용자가 작은 공간에서 물건을 보관하기 어려운 문제를 해결하기 위해 직접 구성한 가상의 검증 기획입니다. ".repeat(2),solution:"구조와 사용 순서를 구체적으로 설명하고 접을 수 있는 모형을 제작해 보관 효율을 확인하는 테스트 기획입니다. ".repeat(3),audience:"작은 공간에서 효율적인 보관 방법을 찾는 성인 사용자입니다.",execution:"기본 모형을 만들고 사용자 다섯 명의 의견을 받아 사용 순서와 비용을 비교하며 가정을 검증할 계획입니다. ".repeat(3),deliverables:["구조 기획서"],originality:"직접 작성한 테스트 기획으로 실제 제품이나 타인의 원문을 포함하지 않았습니다.",validationNote:"실제 특허성과 사업성은 아직 검증하지 않았으며 별도 전문가 확인이 필요합니다.",risks:"제작 비용과 권리관계 및 안전성을 추가로 확인해야 합니다.",sellerAgreement:true,sellerTermsVersion:SELLER_TERMS_VERSION,feeQuote:{viewBps:1000,useBps:1000,holdDays:7}};
async function listing(patent=patentDraft){const input={...base,patent,imageIds:[await upload()]},r=await post("/api/ideas","seller",input);assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.id,input};}
async function detail(id,user="seller"){return (await call("/api/ideas/"+id,{user})).data;}
async function review(id,{status="approved",patent=patentReview,...extra}={}){
 const current=await detail(id),p=current.patentPrivate;
 return post("/api/admin/ideas/"+id+"/review","operator",{status,expectedStatus:current.idea.reviewStatus,expectedVersion:current.registrationVersion,reason:"판매자의 권리 신고 자료와 운영자가 확인한 범위를 구분해서 기록하는 검증입니다.",patentReview:patent?{...patent,expectedRevision:p?.revision,...extra}:undefined});
}
async function checkout(id,{user="buyer",stamp,key=crypto.randomUUID(),body={},environment=env}={}){return post("/api/ideas/"+id+"/checkout",user,{kind:"view",agree:true,termsVersion:TERMS_VERSION,patentStamp:stamp,...body},{key,environment});}
function beforeBatch(match,action){let injected=false;return {...env,DB:{...db,prepare(sql){const wrap=statement=>({...statement,_sql:sql,bind(...args){return wrap(statement.bind(...args));}});return wrap(db.prepare(sql));},async batch(statements){if(!injected&&statements.some(s=>match(s._sql))){injected=true;await action();}return db.batch(statements);}}};}
function badDeclaration(value){assert.throws(()=>validatePatentDeclaration(value),e=>e.status===400);}

for(const patch of [{status:"certified"},{authority:""},{ownershipNote:"짧음"},{acknowledged:false},{policyVersion:"old"},{status:"not_applicable",scope:"",nonApplicableReason:""},{priorArt:"self_searched",priorArtNote:""},{status:"registered",number:"10-12",holder:"신고자"},{status:"unfiled",number:"10-2026-0123456"}])badDeclaration({...patentDraft,...patch});
assert.equal(validatePatentDeclaration({...patentDraft,status:"not_applicable",scope:"",nonApplicableReason:"음악의 창작 콘셉트를 제공하며 기술적 발명에 대한 검토는 별도로 요청하지 않는 테스트입니다."}).status,"not_applicable");
assert.equal(patentFromValues(patentToValues(patentDraft)).acknowledged,false);
const missingImage=await upload();assert.equal((await post("/api/ideas","seller",{...base,imageIds:[missingImage]})).status,400);
console.log("PASS mandatory patent declaration, conditional evidence, number formats and renewed consent");

const privateMarker="PRIVATE-RIGHTS-ONLY",first=await listing({...patentDraft,scope:privateMarker+patentDraft.scope,ownershipNote:privateMarker+patentDraft.ownershipNote});
assert.equal((await review(first.id,{patent:null})).status,400);
assert.equal((await review(first.id,{outcome:"expert_required"})).status,400);
assert.equal((await review(first.id,{ownership:"needs_more"})).status,400);
assert.equal((await review(first.id,{status:"rejected",outcome:"needs_info",ownership:"needs_more"})).status,200);
const revise={...first.input,expectedVersion:1};assert.equal((await post("/api/ideas/"+first.id+"/revise","seller",revise,{key:"patent-revise-one"})).status,201);
assert.equal((await detail(first.id)).patentPrivate.revision,0);
assert.equal((await detail(first.id)).patentDisclosure.state,"pending");
assert.equal((await review(first.id,{expectedRevision:1})).status,409);
assert.equal((await review(first.id)).status,200);
assert.equal((await call("/api/ideas/"+first.id+"/edit",{user:"other-seller"})).status,404);
const publicData=await detail(first.id,"buyer");assert.equal(publicData.patentPrivate,undefined);assert.ok(!JSON.stringify(publicData).includes(privateMarker));
const operatorData=await detail(first.id,"operator");assert.ok(JSON.stringify(operatorData.patentPrivate).includes(privateMarker));
console.log("PASS publication gate, resubmission resets rights review and private seller/operator evidence");

assert.equal((await checkout(first.id)).status,409);
assert.equal((await checkout(first.id,{stamp:"1:999"})).status,409);
const key="patent-snapshot-purchase",purchase=await checkout(first.id,{stamp:publicData.patentDisclosure.stamp,key,body:{patentDisclosure:{statusLabel:"특허 보장"}}});assert.equal(purchase.status,201);
const receipt=await call("/api/orders/"+purchase.data.order.id,{user:"buyer"}),snapshot=receipt.data.patentDisclosure;
assert.deepEqual(snapshot,publicData.patentDisclosure);assert.ok(!JSON.stringify(receipt.data).includes(privateMarker));
assert.ok(!JSON.stringify((await call("/api/ideas/"+first.id+"/details",{user:"buyer"})).data).includes(privateMarker));
assert.equal((await call("/api/orders/"+purchase.data.order.id,{user:"other-buyer"})).status,404);
assert.equal((await review(first.id,{status:"suspended",outcome:"expert_required",freedomToOperate:"expert_required"})).status,200);
assert.deepEqual((await call("/api/orders/"+purchase.data.order.id,{user:"buyer"})).data.patentDisclosure,snapshot);
console.log("PASS current disclosure required, server snapshot ignores client claims and survives later review");

const registered={...patentDraft,status:"registered",number:"10-1234567",holder:"PRIVATE-HOLDER",visibility:"private"},filed=await listing(registered);
assert.equal((await review(filed.id)).status,400);
assert.equal((await review(filed.id,{ownership:"source_compared",sourceUrl:"https://example.com/patent",checkedDate:"2026-10-22"})).status,400);
for(const url of ["javascript:alert(1)","https://kipris.or.kr.evil.invalid/p","https://user:secret@www.kipris.or.kr/p","https://plus.kipris.or.kr/openapi?serviceKey=secret","https://www.kipris.or.kr/?access_token=secret","https://www.kipris.or.kr/p#secret"]){assert.throws(()=>officialPatentUrl(url));assert.equal(patentSourceUrl(url),null);}
assert.equal((await review(filed.id,{ownership:"source_compared",sourceUrl:"https://www.kipris.or.kr/",checkedDate:"2099-01-01"})).status,400);
assert.equal((await review(filed.id,{ownership:"source_compared",sourceUrl:"https://www.kipris.or.kr/",checkedDate:"2026-02-30"})).status,400);
assert.equal((await review(filed.id,{ownership:"source_compared",sourceUrl:"https://www.kipris.or.kr/",checkedDate:"2026-10-22"})).status,200);
const hidden=(await detail(filed.id,"buyer")).patentDisclosure;assert.equal(hidden.number,null);assert.equal(hidden.sourceUrl,null);assert.ok(!JSON.stringify(hidden).includes("PRIVATE-HOLDER"));
const published=await listing({...registered,visibility:"public"});assert.equal((await review(published.id,{ownership:"source_compared",sourceUrl:"https://www.kipris.or.kr/",checkedDate:"2026-10-22"})).status,200);
assert.equal((await detail(published.id,"buyer")).patentDisclosure.number,registered.number);
console.log("PASS filed/registered official evidence, dates, secret-free links and explicit number visibility");

for(const authority of ["authorized","shared","unsure"]){const item=await listing({...patentDraft,authority});assert.equal((await review(item.id)).status,400);if(authority!=="unsure")assert.equal((await review(item.id,{ownership:"source_compared"})).status,200);else assert.equal((await review(item.id,{ownership:"source_compared"})).status,400);}
console.log("PASS delegated/co-owned rights require evidence comparison; unresolved authority cannot publish");

const race=await listing();assert.equal((await review(race.id)).status,200);const before=(await detail(race.id,"other-buyer")).patentDisclosure;
const raceEnv=beforeBatch(sql=>sql.startsWith("INSERT OR IGNORE INTO orders"),async()=>{assert.equal((await review(race.id,{status:"suspended",outcome:"expert_required",freedomToOperate:"expert_required"})).status,200);});
const raced=await checkout(race.id,{user:"other-buyer",stamp:before.stamp,environment:raceEnv});assert.equal(raced.status,409);
for(const table of ["orders","view_grants","licenses"])assert.equal((await db.prepare("SELECT count(*) AS n FROM "+table+" WHERE idea_id=?").bind(race.id).first()).n,0);
assert.equal((await db.prepare("SELECT count(*) AS n FROM order_patent_disclosures d JOIN orders o ON o.id=d.order_id WHERE o.idea_id=?").bind(race.id).first()).n,0);
assert.equal((await db.prepare("SELECT count(*) AS n FROM order_financials f JOIN orders o ON o.id=f.order_id WHERE o.idea_id=?").bind(race.id).first()).n,0);
console.log("PASS rights changed at transaction write prevents orders, grants, financials and disclosure records");

const reviewRace=await listing();const concurrentEnv=beforeBatch(sql=>sql.startsWith("UPDATE idea_patents SET review_state"),async()=>{assert.equal((await review(reviewRace.id,{status:"rejected",outcome:"needs_info",ownership:"needs_more"})).status,200);});
const concurrent=await post("/api/admin/ideas/"+reviewRace.id+"/review","operator",{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"동시에 보완 요청이 기록되는 동안 이전 자료를 승인하려는 검증입니다.",patentReview},{environment:concurrentEnv});assert.equal(concurrent.status,409);
assert.equal((await detail(reviewRace.id)).idea.reviewStatus,"rejected");assert.equal((await detail(reviewRace.id)).patentDisclosure.state,"needs_info");
const versionRace=await listing();const versionEnv=beforeBatch(sql=>sql.startsWith("UPDATE idea_patents SET review_state"),async()=>{assert.equal((await post("/api/ideas/"+versionRace.id+"/revise","seller",{...versionRace.input,expectedVersion:1},{key:"patent-during-review"})).status,201);});
assert.equal((await post("/api/admin/ideas/"+versionRace.id+"/review","operator",{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"판매자가 신고 내용을 변경한 직후 이전 자료를 승인하려는 검증입니다.",patentReview},{environment:versionEnv})).status,409);
assert.equal((await detail(versionRace.id)).patentDisclosure.state,"pending");assert.equal((await detail(versionRace.id)).patentPrivate.listingVersion,2);
console.log("PASS concurrent operator review and seller revision cannot approve stale rights evidence");

const legacy=await listing();await db.prepare("DELETE FROM idea_patents WHERE idea_id=?").bind(legacy.id).run();assert.equal((await review(legacy.id,{patent:null})).status,200);
assert.equal((await detail(legacy.id,"buyer")).patentDisclosure.state,"unreported");
const old=await checkout(legacy.id);assert.equal(old.status,201);
await db.prepare("DELETE FROM order_patent_disclosures WHERE order_id=?").bind(old.data.order.id).run();assert.equal((await call("/api/orders/"+old.data.order.id,{user:"buyer"})).data.patentDisclosure,null);
assert.ok(patentDisclosureHTML(null,{receipt:true}).includes("소급"));
console.log("PASS legacy listings remain explicitly unreported and old receipts never invent historic review");

const secret="NEVER-EXPOSE-API-KEY",settings=await call("/api/admin/settings",{user:"operator",environment:{...env,KIPRIS_PLUS_API_KEY:secret,KIPRIS_PLUS_PRODUCT_APPROVED:"true"}});assert.equal(settings.status,200);assert.equal(settings.data.patent.keyConfigured,true);assert.equal(settings.data.patent.automaticLookupEnabled,false);assert.ok(!JSON.stringify(settings.data).includes(secret));
assert.equal((await call("/api/admin/settings",{user:"buyer"})).status,403);
const attack='<img src=x onerror="alert(1)">';assert.ok(!patentDisclosureHTML({statusLabel:attack,sourceUrl:"javascript:alert(1)"}).includes(attack));assert.ok(!patentReviewHTML({revision:0,declaration:{...patentDraft,scope:attack}}).includes(attack));
db.close();console.log("ALL PATENT DECLARATION / REVIEW / PURCHASE CHECKS PASSED");
