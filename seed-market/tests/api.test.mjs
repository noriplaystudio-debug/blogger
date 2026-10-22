import assert from "node:assert/strict";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {TERMS_VERSION,VIEW_PLEDGE,SELLER_TERMS_VERSION} from "../server/policy.mjs";
const db=createLocalDB(),files=new Map();
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator",BUCKET:{async put(k,v){files.set(k,v);},async get(k){return files.has(k)?{body:files.get(k)}:null;},async delete(k){files.delete(k);}}};
async function call(path,{user=null,method="GET",body,key,headers={},environment=env}={}){
 const request=new Request("https://seed.test"+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const response=await handleAPI(request,environment,{identity:user?{id:user,email:user+"@test.invalid"}:null});
 const data=response.headers.get("Content-Type")?.includes("json")?await response.json():await response.arrayBuffer();return {status:response.status,data};
}
async function signup(id,role){assert.equal((await call("/api/signup",{user:id,method:"POST",body:{name:id,role}})).status,201);}
await signup("seller","seller");await signup("buyer-a","buyer");await signup("buyer-b","buyer");await signup("other-seller","seller");
assert.equal((await call("/api/signup",{user:"buyer-a",method:"POST",body:{name:"change",role:"seller"}})).status,409);
assert.equal((await call("/api/signup",{method:"POST",body:{name:"anonymous",role:"buyer"}})).status,401);
assert.equal((await call("/api/ideas",{user:"buyer-a",method:"POST",body:{}})).status,403);
console.log("PASS role signup and server-side role checks");

const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64"));
async function upload(kind="private",user="seller"){
 const req=new Request("https://seed.test/api/uploads?kind="+kind,{method:"POST",headers:{"Content-Type":"image/png"},body:png});
 const res=await handleAPI(req,env,{identity:{id:user,email:"s@test.invalid"}});assert.equal(res.status,201);return (await res.json()).id;
}
const privateImage=await upload(),publicImage=await upload("public");
const invalidReq=new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/svg+xml"},body:"<svg></svg>"});
assert.equal((await handleAPI(invalidReq,env,{identity:{id:"seller"}})).status,400);
const draft={title:"구체적인 지역 오디오 지도 기획",summary:"지역의 숨은 공간을 발견하고 산책 경로를 기록하는 구체적인 오디오 가이드 서비스입니다.",category:"service",topic:"service-local",maturity:"professional",viewPrice:5000,usePrice:99000,tags:["로컬"],problem:"동네의 이야기를 발견하기 어렵고 산책을 하더라도 늘 같은 곳만 걷게 되는 문제를 해결하려고 합니다.",solution:"SECRET-SOLUTION "+ "검증한 장소 정보를 바탕으로 짧은 산책 오디오를 제작하고 동선별로 연결해 제공합니다. ".repeat(3),audience:"동네의 역사와 공간을 새롭게 경험하고 싶은 산책자입니다.",execution:"각 장소의 정보를 먼저 확인하고 주말 코스 하나를 제작해 사용자 다섯 명에게 체험을 제공합니다. ".repeat(3),deliverables:["서비스 기획서","실행 계획"],imageIds:[privateImage],coverId:publicImage,sellerAgreement:true,sellerTermsVersion:SELLER_TERMS_VERSION,feeQuote:{viewBps:1000,useBps:1000,holdDays:7},originality:"직접 작성한 기획과 직접 제작한 자료이며 별도의 외부 원문을 사용하지 않았습니다.",validationNote:"아직 수익이나 시장성을 검증하지 않았으며 소규모 사용자 실험을 계획하고 있습니다.",risks:"오디오 콘텐츠의 품질과 실제 사용자 수요를 검증해야 합니다."};
let created=await call("/api/ideas",{user:"seller",method:"POST",body:draft});assert.equal(created.status,201);
const id=created.data.id;
assert.equal((await call("/api/ideas/"+id)).status,404);
assert.equal((await call("/api/images/"+publicImage)).status,403);
assert.equal((await call("/api/admin/ideas/"+id+"/review",{user:"seller",method:"POST",body:{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"샘플 정책 검토를 완료했습니다."}})).status,403);
assert.equal((await call("/api/admin/ideas/"+id+"/review",{user:"operator",method:"POST",body:{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"테스트용 아이디어와 제공 자료를 확인했습니다."}})).status,200);
assert.equal((await call("/api/ideas",{user:"other-seller",method:"POST",body:{...draft}})).status,400);
assert.equal((await call("/api/ideas",{user:"seller",method:"POST",body:{...draft,imageIds:[]}})).status,400);
const list=await call("/api/ideas");assert.equal(list.status,200);
assert.ok(!JSON.stringify(list.data).includes("SECRET-SOLUTION"));assert.ok(!JSON.stringify(list.data).includes(privateImage));
assert.equal((await call("/api/ideas/"+id+"/details")).status,401);
assert.equal((await call("/api/ideas/"+id+"/details",{user:"buyer-a"})).status,403);
assert.equal((await call("/api/images/"+privateImage,{user:"buyer-a"})).status,403);
assert.equal((await db.prepare("SELECT count(*) AS n FROM access_records WHERE user_id='buyer-a'").first()).n,0);
assert.equal((await call("/api/images/"+publicImage)).status,200);
console.log("PASS image uploads and summary-only public access");

const checkout=(idea,user,kind,key,extra={})=>call("/api/ideas/"+idea+"/checkout",{user,method:"POST",key,body:{kind,agree:true,termsVersion:TERMS_VERSION,amount:1,...extra}});
assert.equal((await checkout(id,"buyer-b","use","before-view-key")).status,403);
assert.equal((await checkout(id,"buyer-a","view","no-consent-key",{agree:false})).status,400);
assert.equal((await checkout(id,"buyer-a","view","old-consent-key",{termsVersion:"old"})).status,400);
const payment=await checkout(id,"buyer-a","view","view-buyer-a-1");assert.equal(payment.status,201);assert.equal(payment.data.order.amount,5000);
const repeat=await checkout(id,"buyer-a","view","view-buyer-a-1");assert.equal(repeat.status,200);assert.equal(repeat.data.order.id,payment.data.order.id);
assert.equal((await call("/api/ideas/"+id+"/details",{user:"buyer-a"})).status,200);
assert.equal((await call("/api/images/"+privateImage,{user:"buyer-a"})).status,200);
await call("/api/ideas/"+id+"/details",{user:"buyer-a"});
assert.equal((await db.prepare("SELECT count(*) AS n FROM access_records WHERE user_id='buyer-a' AND idea_id=?").bind(id).first()).n,2);
const pledge=await db.prepare("SELECT * FROM pledges WHERE order_id=?").bind(payment.data.order.id).first();
assert.equal(pledge.text,VIEW_PLEDGE);assert.equal(pledge.user_id,"buyer-a");assert.equal(pledge.version,TERMS_VERSION);assert.ok(pledge.agreed_at);
assert.equal((await call("/api/orders/"+payment.data.order.id,{user:"buyer-a"})).status,200);
assert.equal((await call("/api/orders/"+payment.data.order.id,{user:"buyer-b"})).status,404);
console.log("PASS paid view, server prices, idempotency and timestamped pledge");

await checkout(id,"buyer-b","view","view-buyer-b-1");
const exclusive=await checkout(id,"buyer-a","use","use-buyer-a-1");assert.equal(exclusive.status,201);assert.equal(exclusive.data.order.amount,99000);
assert.equal((await call("/api/ideas/"+id+"/details",{user:"buyer-a"})).status,200);
assert.equal((await call("/api/ideas/"+id+"/details",{user:"buyer-b"})).status,403);
assert.equal((await call("/api/images/"+privateImage,{user:"buyer-b"})).status,403);
assert.equal((await call("/api/ideas/"+id+"/details",{user:"seller"})).status,200);
assert.equal((await checkout(id,"buyer-b","use","use-buyer-b-late")).status,409);
assert.equal((await call("/api/ideas/"+id)).data.idea.status,"sold");
console.log("PASS sold status and revoked detail/image access for other paid viewers");

async function newIdea(){
 const image=await upload();
 const res=await call("/api/ideas",{user:"seller",method:"POST",body:{...draft,imageIds:[image],coverId:null}});assert.equal(res.status,201);
 assert.equal((await call("/api/admin/ideas/"+res.data.id+"/review",{user:"operator",method:"POST",body:{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"테스트용 자료와 공개 요약을 확인했습니다."}})).status,200);
 return res.data.id;
}
const concurrent=await newIdea();
await checkout(concurrent,"buyer-a","view","a-view-concurrent");await checkout(concurrent,"buyer-b","view","b-view-concurrent");
const attempts=await Promise.all([checkout(concurrent,"buyer-a","use","a-use-concurrent"),checkout(concurrent,"buyer-b","use","b-use-concurrent")]);
assert.deepEqual(attempts.map(x=>x.status).sort(),[201,409]);
assert.equal((await db.prepare("SELECT count(*) AS n FROM licenses WHERE idea_id=?").bind(concurrent).first()).n,1);
assert.equal((await db.prepare("SELECT count(*) AS n FROM orders WHERE idea_id=? AND kind='use'").bind(concurrent).first()).n,1);
const repeated=await newIdea();
await Promise.all([checkout(repeated,"buyer-a","view","repeat-view-one"),checkout(repeated,"buyer-a","view","repeat-view-two")]);
assert.equal((await db.prepare("SELECT count(*) AS n FROM orders WHERE idea_id=? AND kind='view'").bind(repeated).first()).n,1);
const sameKey=await newIdea();
const retries=await Promise.all([checkout(sameKey,"buyer-a","view","same-key-request"),checkout(sameKey,"buyer-a","view","same-key-request")]);
assert.ok(retries.every(x=>[200,201].includes(x.status)));
assert.equal((await db.prepare("SELECT count(*) AS n FROM orders WHERE idea_id=? AND kind='view'").bind(sameKey).first()).n,1);
console.log("PASS concurrent exclusive sale and duplicate payment prevention");

const sharedImage=await upload();
const simultaneousListings=await Promise.all([
 call("/api/ideas",{user:"seller",method:"POST",body:{...draft,imageIds:[sharedImage],coverId:null}}),
 call("/api/ideas",{user:"seller",method:"POST",body:{...draft,imageIds:[sharedImage],coverId:null}})
]);
assert.equal(simultaneousListings.filter(x=>x.status===201).length,1);
assert.equal((await db.prepare("SELECT count(*) AS n FROM idea_details d WHERE NOT EXISTS(SELECT 1 FROM uploads u WHERE u.idea_id=d.idea_id AND u.kind='private')").first()).n,0);
console.log("PASS concurrent image attachment cannot create incomplete listings");

const locked=await newIdea();
const disabled=await call("/api/ideas/"+locked+"/checkout",{user:"buyer-a",method:"POST",key:"disabled-mode",body:{kind:"view",agree:true,termsVersion:TERMS_VERSION},environment:{...env,PAYMENTS_MODE:"live"}});
assert.equal(disabled.status,503);
assert.equal((await call("/api/ideas/"+locked+"/checkout",{user:"buyer-a",method:"POST",key:"csrf-key-check",headers:{Origin:"https://evil.test"},body:{kind:"view",agree:true,termsVersion:TERMS_VERSION}})).status,403);
console.log("PASS disabled live payments and cross-origin request rejection");
assert.equal((await call("/api/ideas",{user:"seller",method:"POST",body:{...draft,topic:"software-ai"}})).status,400);
const maxImage=await upload();
const large={...draft,imageIds:[maxImage],coverId:null,problem:"문".repeat(6000),solution:"해".repeat(10000),audience:"대".repeat(2000),execution:"실".repeat(10000),originality:"창".repeat(4000),validationNote:"검".repeat(4000),risks:"위".repeat(2000)};
assert.ok(new TextEncoder().encode(JSON.stringify(large)).length>80000);
assert.equal((await call("/api/ideas",{user:"seller",method:"POST",body:large})).status,201);
console.log("PASS category/topic validation and full-length Korean planning materials");
db.close();
console.log("ALL MARKETPLACE API CHECKS PASSED");
