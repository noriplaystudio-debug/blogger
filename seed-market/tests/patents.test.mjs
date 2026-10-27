import {PLATFORM_NOTICE,PLATFORM_NOTICE_TEXT} from "../public/assets/platform-policy.js";
import {platformNoticeHTML} from "../public/assets/platform-notices.js";
import assert from "node:assert/strict";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {TERMS_VERSION,SELLER_TERMS_VERSION,sellerTermsText} from "../server/policy.mjs";
import {validatePatentDeclaration,officialPatentUrl,validatePatentReferences} from "../server/patents.mjs";
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
const publication={number:"US20070006557A1",title:"Filter system for respiratory mask and method of implementing the filter system",jurisdiction:"US",kind:"application",url:"https://patents.google.com/patent/US20070006557A1/en",checkedDate:"2026-10-27",note:"공개 공보의 예시이며 이 테스트에서 실제 기획과의 유사성은 판단하지 않습니다."};
const grant={number:"KR102302296B1",title:"필터 탈착형 마스크",jurisdiction:"KR",kind:"grant",url:"https://patents.google.com/patent/KR102302296B1/ko",checkedDate:"2026-10-27",note:"등록공보의 존재만 안내하며 현재 권리 존속과 침해 여부는 판단하지 않습니다."};
for(const patch of [{status:"certified"},{authority:""},{scope:"가".repeat(1001)},{status:"registered",number:"10-12"}])badDeclaration({...patentDraft,...patch});
assert.equal(validatePatentDeclaration(null).status,"unsure");assert.equal(validatePatentDeclaration(null).acknowledged,false);
assert.equal(validatePatentDeclaration({...patentDraft,ownershipNote:"",scope:"",acknowledged:false}).acknowledged,false);
assert.equal(validatePatentDeclaration({...patentDraft,status:"not_applicable",scope:"",nonApplicableReason:""}).status,"not_applicable");
assert.equal(patentFromValues(patentToValues(patentDraft)).acknowledged,false);
console.log("PASS optional patent information, safe defaults, input limits and no invented consent");

const optional=await listing(undefined); // Omit the declaration entirely in an actual API call too.
const image=await upload();const minimal=await post("/api/ideas","seller",{...base,imageIds:[image]});assert.equal(minimal.status,201);
assert.equal((await review(minimal.data.id,{patent:null})).status,200);
assert.equal((await checkout(minimal.data.id,{stamp:(await detail(minimal.data.id,"buyer")).patentDisclosure.stamp})).status,201);
assert.equal((await post("/api/ideas","seller",{...base,imageIds:[],sellerAgreement:false})).status,400);
console.log("PASS registration/publication/purchase without patent declaration or review");

for(const state of ["pending","recorded","needs_info","expert_required"]){
 const item=await listing(validatePatentDeclaration(null));
 assert.equal((await review(item.id,{patent:state==="pending"?null:{...patentReview,outcome:state,ownership:"needs_more",novelty:"expert_required",freedomToOperate:"expert_required"}})).status,200);
 const p=(await detail(item.id,"buyer")).patentDisclosure;assert.equal(p.state,state);assert.equal(p.blocking,false);
 assert.equal((await checkout(item.id,{stamp:p.stamp})).status,201);
 if(state==="expert_required"){assert.equal((await checkout(item.id,{stamp:p.stamp,body:{kind:"use"}})).status,201);assert.equal((await detail(item.id,"buyer")).idea.status,"sold");}
}
console.log("PASS all reference states including uncertainty/expert advice allow approval and both purchases");

const privateMarker="PRIVATE-RIGHTS-ONLY",filed=await listing({...patentDraft,status:"registered",number:"10-1234567",holder:privateMarker,scope:privateMarker+patentDraft.scope,visibility:"private"});
assert.equal((await review(filed.id,{patent:{...patentReview,outcome:"expert_required",references:[publication,{...grant,legalStatus:"active",cleared:true}]}})).status,200);
const publicData=await detail(filed.id,"buyer");assert.equal(publicData.patentPrivate,undefined);assert.equal(publicData.patentDisclosure.number,null);
assert.equal(publicData.patentDisclosure.references.length,2);assert.equal(publicData.patentDisclosure.references[0].kind,"application");assert.equal(publicData.patentDisclosure.references[1].legalStatus,"unverified");assert.equal(publicData.patentDisclosure.references[1].cleared,undefined);assert.ok(!JSON.stringify(publicData).includes(privateMarker));
assert.ok(patentDisclosureHTML(publicData.patentDisclosure).includes("등록공보 · 현재 권리 존속 미확인"));assert.ok(patentDisclosureHTML(publicData.patentDisclosure).includes("출원 공개 문헌"));
assert.ok(JSON.stringify((await detail(filed.id,"operator")).patentPrivate).includes(privateMarker));
assert.equal((await call("/api/admin/settings",{user:"buyer"})).status,403);
assert.equal((await post("/api/admin/ideas/"+filed.id+"/review","seller",{status:"approved"})).status,403);
console.log("PASS structured public references distinguish application/grant and never expose private proof or certify active rights");

for(const patch of [{kind:"grant"},{jurisdiction:"KR"},{url:"https://patents.google.com/patent/US4945907A/en"},{url:"https://example.com/patent"},{url:"https://patents.google.com/patent/US20070006557A1?serviceKey=secret"},{checkedDate:"2099-01-01"},{checkedDate:"2026-02-30"},{number:"not-a-patent"}])assert.throws(()=>validatePatentReferences([{...publication,...patch}]),e=>e.status===400);
assert.throws(()=>validatePatentReferences([grant,grant]),e=>e.status===400);assert.throws(()=>validatePatentReferences(Array(7).fill(grant)),e=>e.status===400);
for(const url of ["javascript:alert(1)","https://kipris.or.kr.evil.invalid/p","https://user:secret@www.kipris.or.kr/p","https://plus.kipris.or.kr/?serviceKey=secret","https://www.kipris.or.kr/?access_token=secret","https://www.kipris.or.kr/p#secret"]){assert.throws(()=>officialPatentUrl(url));assert.equal(patentSourceUrl(url),null);}
console.log("PASS reference numbering/document type consistency, source links, dates, duplication and key redaction");

assert.equal((await checkout(filed.id)).status,409);assert.equal((await checkout(filed.id,{stamp:"1:999"})).status,409);
const key="reference-snapshot-purchase",purchase=await checkout(filed.id,{stamp:publicData.patentDisclosure.stamp,key,body:{patentDisclosure:{references:[],legalStatus:"cleared"}}});assert.equal(purchase.status,201);
const receipt=await call("/api/orders/"+purchase.data.order.id,{user:"buyer"}),snapshot=receipt.data.patentDisclosure;assert.deepEqual(snapshot,publicData.patentDisclosure);assert.ok(!JSON.stringify(receipt.data).includes(privateMarker));
assert.ok(receipt.data.pledge.text.includes(PLATFORM_NOTICE_TEXT));assert.equal(receipt.data.pledge.version,TERMS_VERSION);
assert.ok(!JSON.stringify((await call("/api/ideas/"+filed.id+"/details",{user:"buyer"})).data).includes(privateMarker));
assert.equal((await checkout(filed.id,{key,stamp:"stale"})).status,200);
assert.equal((await review(filed.id,{patent:{...patentReview,outcome:"needs_info",references:[grant]}})).status,200);
assert.deepEqual((await call("/api/orders/"+purchase.data.order.id,{user:"buyer"})).data.patentDisclosure,snapshot);
const changed=(await detail(filed.id,"other-buyer")).patentDisclosure;assert.equal(changed.references.length,1);assert.equal((await checkout(filed.id,{user:"other-buyer",stamp:changed.stamp})).status,201);
console.log("PASS consent and immutable server-authored reference snapshots, repeat requests and latest-info reconfirmation");

const race=await listing();assert.equal((await review(race.id,{patent:null})).status,200);const before=(await detail(race.id,"other-buyer")).patentDisclosure;
const raceEnv=beforeBatch(sql=>sql.startsWith("INSERT OR IGNORE INTO orders"),async()=>{assert.equal((await review(race.id,{patent:{...patentReview,outcome:"expert_required",references:[publication]}})).status,200);});
assert.equal((await checkout(race.id,{user:"other-buyer",stamp:before.stamp,environment:raceEnv})).status,409);
assert.equal((await detail(race.id,"other-buyer")).idea.reviewStatus,"approved");
for(const table of ["orders","view_grants","licenses"])assert.equal((await db.prepare("SELECT count(*) AS n FROM "+table+" WHERE idea_id=?").bind(race.id).first()).n,0);
assert.equal((await checkout(race.id,{user:"other-buyer",stamp:(await detail(race.id,"other-buyer")).patentDisclosure.stamp})).status,201);
console.log("PASS simultaneous reference changes request fresh consent without legal-risk blocking or orphan orders");

const reviewRace=await listing();const concurrentEnv=beforeBatch(sql=>sql.startsWith("UPDATE idea_patents SET review_state"),async()=>{assert.equal((await review(reviewRace.id,{patent:{...patentReview,outcome:"expert_required",references:[grant]}})).status,200);});
const concurrent=await post("/api/admin/ideas/"+reviewRace.id+"/review","operator",{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"다른 운영자가 참고 정보를 수정한 직후 이전 화면을 저장하려는 검증입니다.",patentReview},{environment:concurrentEnv});assert.equal(concurrent.status,409);
assert.equal((await detail(reviewRace.id)).idea.reviewStatus,"approved");assert.equal((await detail(reviewRace.id)).patentDisclosure.state,"expert_required");
const versionRace=await listing();const versionEnv=beforeBatch(sql=>sql.startsWith("UPDATE idea_patents SET review_state"),async()=>{assert.equal((await post("/api/ideas/"+versionRace.id+"/revise","seller",{...versionRace.input,expectedVersion:1},{key:"reference-during-review"})).status,201);});
assert.equal((await post("/api/admin/ideas/"+versionRace.id+"/review","operator",{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"판매자가 설명을 수정한 직후 이전 자료를 승인하려는 검증입니다.",patentReview},{environment:versionEnv})).status,409);assert.equal((await detail(versionRace.id)).idea.reviewStatus,"pending");
console.log("PASS concurrent reference writes and seller edits retain publication/version guards");

const legacy=await listing();await db.prepare("DELETE FROM idea_patents WHERE idea_id=?").bind(legacy.id).run();await db.prepare("DELETE FROM idea_quality WHERE idea_id=?").bind(legacy.id).run();
assert.equal((await review(legacy.id,{patent:{...patentReview,references:[grant]},expectedRevision:0})).status,200);
assert.equal((await detail(legacy.id,"buyer")).patentDisclosure.references.length,1);
const old=await checkout(legacy.id,{stamp:(await detail(legacy.id,"buyer")).patentDisclosure.stamp});assert.equal(old.status,201);
await db.prepare("DELETE FROM order_patent_disclosures WHERE order_id=?").bind(old.data.order.id).run();assert.equal((await call("/api/orders/"+old.data.order.id,{user:"buyer"})).data.patentDisclosure,null);assert.ok(patentDisclosureHTML(null,{receipt:true}).includes("소급"));
console.log("PASS legacy zero-version listings can receive references; old receipts never invent past information");

const secret="NEVER-EXPOSE-API-KEY",settings=await call("/api/admin/settings",{user:"operator",environment:{...env,KIPRIS_PLUS_API_KEY:secret,KIPRIS_PLUS_PRODUCT_APPROVED:"true"}});assert.equal(settings.data.patent.blocking,false);assert.equal(settings.data.patent.automaticLookupEnabled,false);assert.ok(!JSON.stringify(settings.data).includes(secret));
const config=(await call("/api/config")).data;assert.equal(config.platformNotice.version,PLATFORM_NOTICE.version);assert.ok(config.sellerTerms.text.includes(PLATFORM_NOTICE_TEXT));assert.ok(config.viewPledge.includes(PLATFORM_NOTICE.limits));assert.ok(config.usePledge.includes("이 사이트"));
assert.ok(sellerTermsText(config.commerce).includes("제공할 권한"));assert.ok(platformNoticeHTML().includes("법정 청약철회·환불"));assert.ok(platformNoticeHTML().includes("고의·중과실"));
const attack='<img src=x onerror="alert(1)">';assert.ok(!patentDisclosureHTML({statusLabel:attack,references:[{...grant,title:attack,note:attack,url:"javascript:alert(1)"}]}).includes(attack));assert.ok(!patentReviewHTML({revision:0,declaration:{...patentDraft,scope:attack},review:{references:[{...grant,title:attack}]}}).includes(attack));
db.close();console.log("ALL NONBLOCKING PATENT REFERENCES / IDEA SHARING NOTICES CHECKS PASSED");
