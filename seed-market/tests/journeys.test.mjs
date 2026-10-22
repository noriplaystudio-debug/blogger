import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {TERMS_VERSION,SELLER_TERMS_VERSION} from "../server/policy.mjs";
import {createJourneyState,receiptHTML,temporaryUploadsHTML,accessHTML} from "../public/assets/journeys.js";
import {escapeHtml as h} from "../public/assets/format.js";
const db=createLocalDB(),objects=new Map(),evidence=[];
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator",BUCKET:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}}};
async function call(path,{user=null,method="GET",body,key,environment=env,clock}={}){
 const response=await handleAPI(new Request("https://seed.test"+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),environment,{identity:user?{id:user}:null,...(clock?{clock:()=>clock}:{})});
 return {status:response.status,data:response.headers.get("Content-Type")?.includes("json")?await response.json():await response.arrayBuffer()};
}
const post=(path,user,body,key)=>call(path,{user,method:"POST",body,key});
async function expect(path,options,status=200){const result=await call(path,options);assert.equal(result.status,status,JSON.stringify(result.data));return result.data;}
function pass(journey,step){evidence.push({journey,step,result:"passed"});console.log("PASS "+journey+" — "+step);}
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64"));
async function upload(kind="private",user="seller"){
 const response=await handleAPI(new Request("https://seed.test/api/uploads?kind="+kind,{method:"POST",headers:{"Content-Type":"image/png"},body:png}),env,{identity:{id:user}});assert.equal(response.status,201);return (await response.json()).id;
}
for(const [user,role] of [["seller","seller"],["seller-two","seller"],["buyer-a","buyer"],["buyer-b","buyer"]])await expect("/api/signup",{user,method:"POST",body:{role,name:user}},201);
const initialConfig=await expect("/api/config"),image=await upload(),cover=await upload("public");
const draft={title:"도시 산책을 위한 오디오 기획",summary:"동네의 문화와 장소를 짧은 오디오로 연결하고 방문자가 산책 경로를 선택하도록 돕는 기획입니다.",category:"service",topic:"service-local",domainIds:["local","culture"],maturity:"developed",tags:["산책","오디오"],viewPrice:5000,usePrice:99000,problem:"도시에서 숨은 문화와 장소를 찾기 어렵고 기존 안내 방식으로는 짧은 산책 동선을 파악하기 어렵다는 문제입니다.",solution:"PRIVATE-JOURNEY-DETAIL "+"직접 확인한 장소를 짧은 안내와 동선으로 묶고 사용자의 이용 시간을 기준으로 코스를 제안합니다. ".repeat(3),audience:"주말에 지역 문화를 체험하고 새로운 경로를 걷고 싶은 방문자입니다.",execution:"지역의 장소 세 곳을 직접 확인한 뒤 안내용 원고를 만들고 방문자 다섯 명과 코스를 걸으며 개선 의견을 기록합니다. ".repeat(3),deliverables:["기획서","실행 단계 안내"],imageIds:[image],coverId:cover,originality:"직접 만든 기획과 직접 제작한 참고 이미지로 구성했으며 외부 작품의 원문은 사용하지 않았습니다.",validationNote:"아직 실제 시장성과 수익성을 검증하지 않았으며 첫 사용자 실험을 준비하고 있습니다.",risks:"안내의 정확성과 실제 사용자 수요를 추가 확인해야 합니다.",sellerAgreement:true,sellerTermsVersion:SELLER_TERMS_VERSION,feeQuote:initialConfig.commerce};
const attempts=await Promise.all([post("/api/ideas","seller",draft,"seller-submit-first"),post("/api/ideas","seller",draft,"seller-submit-first")]);
assert.deepEqual(attempts.map(x=>x.status).sort(),[200,201]);
const id=attempts[0].data.id;assert.equal(id,attempts[1].data.id);
assert.equal((await db.prepare("SELECT count(*) AS n FROM ideas WHERE seller_id='seller'").first()).n,1);
await expect("/api/ideas/"+id,{},404);await expect("/api/images/"+image,{user:"buyer-a"},403);
assert.equal((await expect("/api/listing-requests/seller-submit-first",{user:"seller"})).id,id);
await expect("/api/listing-requests/seller-submit-first",{user:"seller-two"},404);
await expect("/api/listing-requests/seller-submit-first",{user:"buyer-a"},403);
assert.equal((await post("/api/ideas","seller",{...draft,title:"다르게 바뀐 도시 산책 기획"},"seller-submit-first")).status,409);
pass("판매자", "가입 → 비공개 등록 → 응답 유실 조회·동시 재시도, 중복 등록 0건");
const review=(status,expectedStatus,expectedVersion,environment=env)=>call("/api/admin/ideas/"+id+"/review",{user:"operator",method:"POST",body:{status,expectedStatus,expectedVersion,reason:"공개 소개와 상세 기획 및 참고 이미지의 구성과 권리 안내를 확인했습니다."},environment});
assert.equal((await review("rejected","pending",1)).status,200);
assert.equal((await expect("/api/account",{user:"seller"})).selling.find(idea=>idea.id===id).canEdit,true);
const edit=await expect("/api/ideas/"+id+"/edit",{user:"seller"});
assert.equal(edit.version,1);assert.equal(edit.input.solution,draft.solution.trim());assert.ok(edit.images.every(x=>x.retained));
await expect("/api/ideas/"+id+"/edit",{user:"seller-two"},404);
await expect("/api/ideas/"+id+"/edit",{user:"buyer-a"},403);
assert.equal((await post("/api/admin/settings","operator",{viewBps:2000,useBps:2500,holdDays:2,reason:"새 등록 건에 적용할 수수료와 대기 기간의 테스트 변경입니다."})).status,200);
const revisedImage=await upload(),revision={...draft,title:"보완한 도시 산책 오디오 기획",imageIds:[revisedImage],expectedVersion:1};
assert.equal((await post("/api/ideas/"+id+"/revise","seller",revision,"seller-revision-one")).status,201);
assert.equal((await post("/api/ideas/"+id+"/revise","seller",revision,"seller-revision-one")).status,200);
const revised=await expect("/api/ideas/"+id+"/edit",{user:"seller"});assert.equal(revised.version,2);assert.deepEqual(revised.commerce,initialConfig.commerce);
assert.equal((await review("approved","pending",1)).status,409);
const concurrent=await Promise.all([post("/api/ideas/"+id+"/revise","seller",{...revision,title:"첫 번째 동시 보완 산책 기획",expectedVersion:2},"seller-revision-two-a"),post("/api/ideas/"+id+"/revise","seller",{...revision,title:"두 번째 동시 보완 산책 기획",expectedVersion:2},"seller-revision-two-b")]);
assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
assert.equal((await review("approved","pending",2)).status,409);
assert.equal((await review("approved","pending",3)).status,200);
await expect("/api/ideas/"+id+"/edit",{user:"seller"},409);
assert.equal((await expect("/api/account",{user:"seller"})).selling.find(idea=>idea.id===id).canEdit,false);
assert.equal((await post("/api/ideas/"+id+"/revise","seller",{...revision,expectedVersion:3},"already-public-revise")).status,409);
// A saved revision replay cannot change the later approval back to pending.
assert.equal((await post("/api/ideas/"+id+"/revise","seller",revision,"seller-revision-one")).status,200);
assert.equal((await expect("/api/ideas/"+id)).idea.reviewStatus,"approved");
const privateData=await expect("/api/ideas/"+id+"/details",{user:"seller"});assert.deepEqual(privateData.details.images.map(x=>x.id),[revisedImage]);
pass("판매자", "반려 → 내용·기존 이미지 수정 → 버전 충돌 방지 → 재검토·공개, 최초 수수료 유지");

const scratch=await expect("/api/uploads",{user:"seller"});assert.ok(scratch.uploads.some(x=>x.id===image));assert.ok(!scratch.uploads.some(x=>x.id===revisedImage));assert.ok(!JSON.stringify(scratch).includes("object_key"));
await expect("/api/uploads/"+image,{user:"seller-two",method:"DELETE"},404);
await expect("/api/uploads/"+image,{user:"seller",method:"DELETE"});assert.ok(!objects.has("ideas/"+image));
await expect("/api/uploads/"+revisedImage,{user:"seller",method:"DELETE"},404);assert.ok(objects.has("ideas/"+revisedImage));
pass("판매자", "미사용 이미지 조회·정리, 다른 판매자·등록 자료 삭제 차단");
const cleanupImage=await upload(),originalError=console.error,cleanupErrors=[];console.error=(...values)=>cleanupErrors.push(values.join(" "));
try{await expect("/api/uploads/"+cleanupImage,{user:"seller",method:"DELETE",environment:{...env,BUCKET:{...env.BUCKET,async delete(){throw new Error("test storage failure");}}}});}finally{console.error=originalError;}
assert.ok(objects.has("ideas/"+cleanupImage));assert.equal((await db.prepare("SELECT count(*) AS n FROM upload_cleanup WHERE id=?").bind(cleanupImage).first()).n,1);assert.equal(cleanupErrors.length,1);
await expect("/api/images/"+cleanupImage,{user:"seller"},404);
await expect("/api/uploads",{user:"seller"});assert.ok(!objects.has("ideas/"+cleanupImage));assert.equal((await db.prepare("SELECT count(*) AS n FROM upload_cleanup").first()).n,0);
let partialKey;
console.error=()=>{};
try{
 const result=await handleAPI(new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/png"},body:png}),{...env,BUCKET:{...env.BUCKET,async put(key,value){partialKey=key;objects.set(key,value);throw new Error("test upload response failure");},async delete(){throw new Error("test cleanup failure");}}},{identity:{id:"seller"}});
 assert.equal(result.status,500);
}finally{console.error=originalError;}
assert.ok(objects.has(partialKey));assert.equal((await db.prepare("SELECT count(*) AS n FROM upload_cleanup").first()).n,1);
await expect("/api/uploads",{user:"seller"});assert.ok(!objects.has(partialKey));assert.equal((await db.prepare("SELECT count(*) AS n FROM upload_cleanup").first()).n,0);
pass("시스템", "이미지 저장소 삭제 실패는 작업 기록을 남기고 다음 조회에서 재시도");


const publicList=await expect("/api/discovery?category=service");assert.ok(publicList.ideas.some(x=>x.id===id));assert.ok(!JSON.stringify(publicList).includes("PRIVATE-JOURNEY-DETAIL"));
await expect("/api/ideas/"+id+"/bookmark",{user:"buyer-a",method:"POST",body:{}});
assert.ok((await expect("/api/account",{user:"buyer-a"})).favorites.includes(id));
const checkout=(user,kind,key)=>post("/api/ideas/"+id+"/checkout",user,{kind,agree:true,termsVersion:TERMS_VERSION},key);
assert.equal((await checkout("buyer-a","use","cannot-use-before-view")).status,403);
const aView=await checkout("buyer-a","view","buyer-a-view-first");assert.equal(aView.status,201);
const aReplay=await checkout("buyer-a","view","buyer-a-view-first");assert.equal(aReplay.status,200);assert.equal(aReplay.data.order.id,aView.data.order.id);
await expect("/api/ideas/"+id+"/details",{user:"buyer-a"});await expect("/api/images/"+revisedImage,{user:"buyer-a"});
assert.equal((await expect("/api/account",{user:"buyer-a"})).access[id].state,"view");
const bView=await checkout("buyer-b","view","buyer-b-view-first");assert.equal(bView.status,201);await expect("/api/ideas/"+id+"/details",{user:"buyer-b"});
const aUse=await checkout("buyer-a","use","buyer-a-use-first");assert.equal(aUse.status,201);
await expect("/api/ideas/"+id+"/details",{user:"buyer-b"},403);await expect("/api/images/"+revisedImage,{user:"buyer-b"},403);
assert.equal((await checkout("buyer-b","use","buyer-b-use-too-late")).status,409);
const bAccount=await expect("/api/account",{user:"buyer-b"});assert.equal(bAccount.access[id].state,"sold");assert.equal(bAccount.access[id].canView,false);
assert.equal((await expect("/api/account",{user:"buyer-a"})).access[id].state,"exclusive");
const bReceipt=await expect("/api/orders/"+bView.data.order.id,{user:"buyer-b"});assert.equal(bReceipt.access.state,"sold");assert.ok(bReceipt.firstAccessedAt);assert.equal(bReceipt.financials.commission_bps,1000);
await expect("/api/orders/"+bView.data.order.id,{user:"buyer-a"},404);
pass("구매자", "검색·찜 → 서약·열람 구매 → 응답 재시도 → 독점 구매 → 다른 열람자의 본문·이미지 차단과 권한 안내");

assert.equal((await review("suspended","approved",3)).status,200);
await expect("/api/ideas/"+id+"/details",{user:"buyer-a"},404);
assert.equal((await expect("/api/account",{user:"buyer-a"})).access[id].state,"suspended");
const support=await post("/api/cases","buyer-b",{ideaId:id,orderId:bView.data.order.id,kind:"refund",reason:"판매완료 후 재열람 안내",message:"판매완료 후 상세 열람이 종료된 거래의 결제 기록과 안내를 확인하고 테스트 환불을 문의합니다."});assert.equal(support.status,201);
const future=Date.now()+9*86400000;
assert.equal((await expect("/api/seller/finance",{user:"seller",clock:future})).available,0);
assert.equal((await post("/api/cases/"+support.data.id+"/reply","seller",{message:"재열람 종료 조건을 확인했으며 운영자의 테스트 환불 검토를 요청합니다."})).status,200);
assert.equal((await post("/api/admin/cases/"+support.data.id,"operator",{action:"refund",resolution:"거래 기록과 열람 종료 조건을 확인하고 테스트 환불을 승인했습니다."})).status,200);
const refunded=await expect("/api/orders/"+bView.data.order.id,{user:"buyer-b"});assert.ok(refunded.refund.reason);assert.equal(refunded.order.effective_status,"refunded");
assert.equal((await review("approved","suspended",3)).status,200);
const returnUse=await post("/api/cases","buyer-a",{ideaId:id,orderId:aUse.data.order.id,kind:"refund",reason:"테스트 사용권 반환",message:"실제 권리 이전이 없는 테스트 사용권을 반환하고 환불 처리 후 재판매가 자동으로 이뤄지지 않는지 확인합니다."});assert.equal(returnUse.status,201);
assert.equal((await post("/api/admin/cases/"+returnUse.data.id,"operator",{action:"refund",resolution:"사용권 테스트 반환을 승인하고 재판매는 별도로 검토합니다."})).status,200);
assert.equal((await expect("/api/ideas/"+id)).idea.status,"sold");
await expect("/api/ideas/"+id+"/details",{user:"buyer-a"},403);
const finances=await expect("/api/seller/finance",{user:"seller",clock:future});assert.equal(finances.available,4500);assert.equal(finances.netCommission,500);
const payout=await expect("/api/seller/payouts",{user:"seller",method:"POST",body:{},key:"journey-payout-first",clock:future},201);
assert.equal(payout.payout.amount,4500);
assert.equal((await expect("/api/seller/payouts",{user:"seller",method:"POST",body:{},key:"journey-payout-first",clock:future})).payout.id,payout.payout.id);
await expect("/api/admin/payouts/"+payout.payout.id,{user:"operator",method:"POST",body:{action:"pay",reason:"대기 기간과 환불 원장을 확인한 테스트 정산 완료 처리입니다."},clock:future});
assert.equal((await expect("/api/seller/finance",{user:"seller-two",clock:future})).gross,0);
pass("거래 후 처리", "게시 중단 → 주문 문의·판매자 답변 → 정산 보류·환불 → 권한 회수 → 수수료 반환 → 테스트 정산");

// Reproduce deletion obtaining a temporary row just before a listing claims it.
const raceImage=await upload();let injected=false,raceListing;
const deleteRaceDB={...db,prepare(sql){const original=db.prepare(sql);if(!sql.startsWith("SELECT * FROM uploads WHERE id=? AND owner_id=? AND idea_id IS NULL"))return original;return {bind(...args){const bound=original.bind(...args);return {...bound,async first(){const row=await bound.first();if(!injected){injected=true;raceListing=await post("/api/ideas","seller",{...draft,imageIds:[raceImage],coverId:null,feeQuote:(await expect("/api/config")).commerce},"upload-delete-race");assert.equal(raceListing.status,201);}return row;}};}};}};
await expect("/api/uploads/"+raceImage,{user:"seller",method:"DELETE",environment:{...env,DB:deleteRaceDB}},409);
assert.ok(objects.has("ideas/"+raceImage));assert.equal((await db.prepare("SELECT idea_id FROM uploads WHERE id=?").bind(raceImage).first()).idea_id,raceListing.data.id);
// Reproduce seller editing after an operator reads version 1 but before approval commits.
const raceId=raceListing.data.id;let changed=false;
const reviewRaceDB={...db,prepare(sql){const wrap=statement=>({...statement,_reviewWrite:sql.startsWith("INSERT INTO idea_reviews(idea_id,status,reason"),bind(...args){return wrap(statement.bind(...args));}});return wrap(db.prepare(sql));},async batch(statements){if(statements[0]._reviewWrite&&!changed){changed=true;assert.equal((await post("/api/ideas/"+raceId+"/revise","seller",{...draft,imageIds:[raceImage],coverId:null,feeQuote:(await expect("/api/config")).commerce,expectedVersion:1},"edit-during-review-write")).status,201);}return db.batch(statements);}};
await expect("/api/admin/ideas/"+raceId+"/review",{user:"operator",method:"POST",body:{status:"approved",expectedStatus:"pending",expectedVersion:1,reason:"운영자가 이전 버전을 보던 사이 수정된 자료의 승인 요청입니다."},environment:{...env,DB:reviewRaceDB}},409);
assert.equal((await expect("/api/ideas/"+raceId,{user:"seller"})).idea.reviewStatus,"pending");
pass("시스템", "업로드 삭제·등록 경쟁과 판매자 수정·운영 승인 경쟁을 DB 쓰기 직전 순서로 재현·차단");

const invalidImage=await upload(),currentQuote=(await expect("/api/config")).commerce;
for(const bad of [{tags:["하나","둘","셋","넷"]},{tags:["가".repeat(19)]},{deliverables:["가".repeat(81)]},{deliverables:Array(7).fill("기획서")}])assert.equal((await post("/api/ideas","seller",{...draft,...bad,imageIds:[invalidImage],coverId:null,feeQuote:currentQuote},crypto.randomUUID())).status,400);
pass("시스템", "태그·제공 자료의 개수·길이 초과는 자동 절단 없이 거절");

const stored=new Map(),storage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
let clock=1000,counter=0;const state=createJourneyState(storage,{now:()=>clock,uuid:()=>"request-"+(++counter)});
state.remember({type:"checkout",role:"buyer",id,kind:"view",privateText:draft.solution});assert.equal(state.take("buyer").id,id);assert.equal(state.take("buyer"),null);
state.remember({type:"create",role:"seller"});assert.equal(state.take("buyer"),null);
state.remember({type:"create",role:"seller"});clock+=31*60*1000;assert.equal(state.take("seller"),null);
state.remember({type:"checkout",role:"buyer",id:"../unsafe"});assert.equal(state.take("buyer"),null);
const key=state.request("buyer-a","checkout",id+":view");assert.equal(state.request("buyer-a","checkout",id+":view"),key);assert.notEqual(state.request("buyer-b","checkout",id+":view"),key);
assert.equal(createJourneyState(storage,{now:()=>clock}).peek("buyer-a","checkout",id+":view"),key);
state.clear("buyer-a","checkout",id+":view");assert.notEqual(state.request("buyer-a","checkout",id+":view"),key);
assert.ok(!JSON.stringify([...stored]).includes("PRIVATE-JOURNEY-DETAIL"));
storage.setItem("seed-continue-v5",JSON.stringify({type:"checkout",role:"buyer",id,at:clock,kind:'"><script>'}));assert.equal(state.take("buyer").kind,"view");
const blocked=createJourneyState({getItem(){throw Error("blocked");},setItem(){throw Error("blocked");},removeItem(){throw Error("blocked");}});const fallback=blocked.request("seller","listing","new");assert.equal(blocked.request("seller","listing","new"),fallback);
pass("화면 상태", "가입 후 작업 이어가기·역할/시간 제한·계정별 재시도 번호·저장소 차단 대체, 민감 본문 저장 없음");

const button=(action,label,id="",cls="button")=>'<button type="button" class="'+h(cls)+'" data-action="'+h(action)+'" data-id="'+h(id)+'">'+h(label)+'</button>',money=value=>new Intl.NumberFormat("ko-KR").format(value);
const attack='<img src=x onerror="alert(1)">';
const rendered={"buyer-access-ended":receiptHTML(bReceipt,{button,money}),"buyer-refund":receiptHTML({...refunded,refund:{...refunded.refund,reason:attack},order:{...refunded.order,title:attack}},{button,money}),"seller-temporary-uploads":temporaryUploadsHTML(await expect("/api/uploads",{user:"seller"}),{button,money})};
assert.ok(rendered["buyer-access-ended"].includes("재열람 종료"));assert.ok(rendered["buyer-refund"].includes("테스트 환불 완료"));assert.ok(!rendered["buyer-refund"].includes(attack));assert.ok(rendered["buyer-refund"].includes(h(attack)));
assert.ok(!accessHTML({label:attack,description:attack}).includes(attack));
await mkdir(".sites-runtime/ui-qa",{recursive:true});for(const [name,html] of Object.entries(rendered))await writeFile(".sites-runtime/ui-qa/"+name+".html",'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Journey template check</title></head><body>'+html+'</body></html>');
await writeFile(".sites-runtime/journey-results.json",JSON.stringify({scope:"actual Request → API → SQLite / object-store test double → response; browser not available",results:evidence},null,2));
db.close();console.log("ALL SELLER / BUYER JOURNEYS PASSED (API + DB + UI templates; browser not covered)");
