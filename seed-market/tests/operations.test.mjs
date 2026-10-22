import {patentDraft,patentReview} from "./patent-fixtures.mjs";
import assert from "node:assert/strict";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {TERMS_VERSION,SELLER_TERMS_VERSION} from "../server/policy.mjs";
import {authSettings,publicAuthSettings,adminAuthSettings,betterAuthOptions} from "../auth/settings.mjs";
import {amounts} from "../server/commerce.mjs";
const db=createLocalDB(),files=new Map(),baseTime=Date.now();
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"operator",BUCKET:{async put(k,v){files.set(k,v);},async get(k){return files.has(k)?{body:files.get(k)}:null;},async delete(k){files.delete(k);}}};
async function call(path,{user=null,method="GET",body,key,clock,settings=env}={}){
 const request=new Request("https://seed.test"+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const response=await handleAPI(request,settings,{identity:user?{id:user,email:"test@example.invalid"}:null,...(clock?{clock:()=>clock}:{})});
 const data=response.headers.get("Content-Type")?.includes("json")?await response.json():null;return {status:response.status,data};
}
async function signup(user,role){assert.equal((await call("/api/signup",{user,method:"POST",body:{role,name:user}})).status,201);}
for(const [user,role] of [["seller","seller"],["seller-two","seller"],["buyer","buyer"],["other-buyer","buyer"]])await signup(user,role);
const png=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64"));
async function listing({approve=true,title="아이디어 등록과 운영 정책 검증",viewPrice=5000,usePrice=99000,quote}={}){
 const response=await handleAPI(new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/png"},body:png}),env,{identity:{id:"seller"}});
 const image=await response.json();assert.equal(response.status,201);
 const config=(await call("/api/config")).data;
 const body={title,summary:"새로운 서비스의 구체적인 동작 방식과 대상 사용자를 충분히 설명하는 공개 요약입니다.",category:"software",topic:"software-work",maturity:"professional",viewPrice,usePrice,tags:["테스트"],problem:"많은 사람이 반복 업무에 시간을 쓰고 현재 도구로는 이 과정을 충분히 줄이기 어렵다는 문제를 해결합니다.",solution:"구체적인 기획과 핵심 화면을 구성하고 사용자 입력을 단계별로 정리하는 방식으로 문제를 해결합니다. ".repeat(3),audience:"매일 반복되는 업무의 효율을 높이고 싶은 작은 팀과 프로젝트 담당자입니다.",execution:"첫 단계에서는 실제 사용자 다섯 명에게 프로토타입을 보여주고 반복되는 어려움과 개선 의견을 기록합니다. ".repeat(3),deliverables:["상세 기획서"],imageIds:[image.id],sellerAgreement:true,sellerTermsVersion:SELLER_TERMS_VERSION,patent:patentDraft,feeQuote:quote||config.commerce,originality:"직접 작성한 구체적인 서비스 기획과 직접 제작한 참고 이미지입니다.",validationNote:"아직 실제 시장성을 검증하지 않았으며 첫 사용자 실험을 준비하는 단계입니다.",risks:"실제 수요와 도구의 제작 비용을 추가로 확인해야 합니다."};
 const result=await call("/api/ideas",{user:"seller",method:"POST",body});
 if(result.status!==201)return result;
 const id=result.data.id;
 if(approve)assert.equal((await call("/api/admin/ideas/"+id+"/review",{user:"operator",method:"POST",body:{status:"approved",patentReview,expectedStatus:"pending",expectedVersion:1,reason:"공개 요약과 상세 자료 및 권한 고지 항목을 확인했습니다."}})).status,200);
 return {id,status:201};
}
const checkout=async(id,user,kind)=>call("/api/ideas/"+id+"/checkout",{user,method:"POST",key:crypto.randomUUID(),body:{kind,agree:true,termsVersion:TERMS_VERSION,patentStamp:(await call("/api/ideas/"+id,{user})).data.patentDisclosure?.stamp}});
assert.equal((await call("/api/admin/overview")).status,401);
assert.equal((await call("/api/admin/overview",{user:"buyer"})).status,403);
assert.equal((await call("/api/admin/settings",{user:"buyer",method:"POST",body:{viewBps:0,useBps:0,holdDays:1,reason:"모든 수수료를 임의로 바꾸려는 요청입니다."}})).status,403);
const pending=await listing({approve:false});
assert.equal((await call("/api/ideas/"+pending.id)).status,404);
assert.equal((await call("/api/ideas/"+pending.id,{user:"seller"})).status,200);
assert.equal((await call("/api/ideas/"+pending.id+"/details",{user:"operator"})).status,200);
console.log("PASS operator authorization and review-before-publication");

const first=await listing(),payment=await checkout(first.id,"buyer","view");
assert.equal(payment.status,201);
let financial=(await call("/api/orders/"+payment.data.order.id,{user:"buyer"})).data.financials;
assert.equal(financial.platform_fee,500);assert.equal(financial.seller_amount,4500);assert.equal(financial.gross,financial.platform_fee+financial.seller_amount);
assert.equal((await call("/api/admin/settings",{user:"operator",method:"POST",body:{viewBps:1500,useBps:2000,holdDays:3,reason:"새 등록 건에 적용할 테스트 수수료 정책을 변경합니다."}})).status,200);
const oldListingLaterOrder=await checkout(first.id,"other-buyer","view");
assert.equal((await call("/api/orders/"+oldListingLaterOrder.data.order.id,{user:"other-buyer"})).data.financials.commission_bps,1000);
assert.equal((await call("/api/orders/"+payment.data.order.id,{user:"buyer"})).data.financials.platform_fee,500);
const fresh=await listing(),freshPay=await checkout(fresh.id,"buyer","view");
assert.equal((await call("/api/orders/"+freshPay.data.order.id,{user:"buyer"})).data.financials.platform_fee,750);
assert.equal((await listing({quote:{viewBps:1000,useBps:1000,holdDays:7}})).status,409);
assert.equal((await call("/api/seller/finance",{user:"seller-two"})).data.items.length,0);
assert.deepEqual(amounts(1001,333),{gross:1001,commissionBps:333,platformFee:33,sellerAmount:968});
console.log("PASS immutable listing/order commission, won rounding and seller isolation");

const refundCase=await call("/api/cases",{user:"buyer",method:"POST",body:{kind:"refund",ideaId:fresh.id,orderId:freshPay.data.order.id,reason:"제공 자료 불일치",message:"공개 요약에서 기대한 내용과 실제 제공된 참고 자료의 구성에 차이가 있어 확인을 요청합니다."}});
assert.equal(refundCase.status,201);
assert.equal((await call("/api/cases",{user:"buyer",method:"POST",body:{kind:"refund",ideaId:fresh.id,orderId:freshPay.data.order.id,reason:"중복 요청",message:"이미 진행 중인 같은 아이디어의 환불 요청을 중복해서 생성하려는 테스트입니다."}})).status,409);
assert.equal((await call("/api/cases/"+refundCase.data.id+"/reply",{user:"seller-two",method:"POST",body:{message:"다른 판매자가 임의로 남기는 답변입니다."}})).status,404);
assert.equal((await call("/api/cases/"+refundCase.data.id+"/reply",{user:"seller",method:"POST",body:{message:"판매자가 제공 자료를 확인하고 실제 제공 범위를 설명하는 답변입니다."}})).status,200);
assert.equal((await call("/api/admin/cases/"+refundCase.data.id,{user:"operator",method:"POST",body:{action:"refund",resolution:"테스트에서 제공 자료 불일치를 확인하고 전액 환불 처리합니다."}})).status,200);
assert.equal((await call("/api/ideas/"+fresh.id+"/details",{user:"buyer"})).status,403);
const receipt=(await call("/api/orders/"+freshPay.data.order.id,{user:"buyer"})).data;
assert.equal(receipt.refund.gross_reversal,5000);
const reversal=await db.prepare("SELECT * FROM refunds WHERE order_id=?").bind(freshPay.data.order.id).first();
assert.equal(reversal.fee_reversal,750);assert.equal(reversal.seller_reversal,4250);
assert.equal((await call("/api/admin/cases/"+refundCase.data.id,{user:"operator",method:"POST",body:{action:"refund",resolution:"중복 환불을 시도해도 거래 원장이 바뀌지 않아야 합니다."}})).status,409);
assert.equal((await checkout(fresh.id,"buyer","view")).status,201);
console.log("PASS refund review, fee reversal, revoked access and re-purchase");

const report=await call("/api/cases",{user:"other-buyer",method:"POST",body:{kind:"report",ideaId:first.id,reason:"권리 관계 확인",message:"등록된 자료의 출처에 관한 확인이 필요하여 운영 검토와 판매자의 설명을 요청합니다."}});
assert.equal(report.status,201);
const later=baseTime+9*86400000;
assert.equal((await call("/api/seller/finance",{user:"seller",clock:later})).data.available,4250);
assert.equal((await call("/api/seller/payouts",{user:"seller",method:"POST",key:"early-payout-key",body:{}})).status,409);
const requests=await Promise.all([
 call("/api/seller/payouts",{user:"seller",method:"POST",key:"payout-one-unique",clock:later,body:{}}),
 call("/api/seller/payouts",{user:"seller",method:"POST",key:"payout-two-unique",clock:later,body:{}})
]);
assert.deepEqual(requests.map(x=>x.status).sort(),[201,409]);
const payout=requests.find(x=>x.status===201).data.payout;
assert.equal(payout.amount,4250);
const repeatKey=requests[0].status===201?"payout-one-unique":"payout-two-unique";
assert.equal((await call("/api/seller/payouts",{user:"seller",method:"POST",key:repeatKey,clock:later,body:{}})).data.payout.id,payout.id);
assert.equal((await call("/api/admin/payouts/"+payout.id,{user:"operator",method:"POST",body:{action:"pay",reason:"테스트 정산 상태와 진행 중 문의를 확인했습니다."},clock:later})).status,200);
assert.equal((await call("/api/admin/cases/"+report.data.id,{user:"operator",method:"POST",body:{action:"resolve",resolution:"판매자의 설명과 등록 자료를 확인하여 해당 신고의 검토를 종료합니다."}})).status,200);
assert.equal((await call("/api/seller/finance",{user:"seller",clock:later})).data.available,9000);
console.log("PASS holding period, dispute freeze and concurrent payout claims");

const exclusiveIdea=await listing();await checkout(exclusiveIdea.id,"buyer","view");const use=await checkout(exclusiveIdea.id,"buyer","use");
const useCase=await call("/api/cases",{user:"buyer",method:"POST",body:{kind:"refund",ideaId:exclusiveIdea.id,orderId:use.data.order.id,reason:"독점 권리 반환 검토",message:"독점 사용권의 반환 조건과 제공 자료 이용 여부를 확인한 후 테스트 환불 검토를 요청합니다."}});
assert.equal(useCase.status,201);
assert.equal((await call("/api/admin/cases/"+useCase.data.id,{user:"operator",method:"POST",body:{action:"refund",resolution:"독점 권리 반환 조건을 검토한 테스트 전액 환불입니다."}})).status,200);
assert.equal((await call("/api/ideas/"+exclusiveIdea.id)).data.idea.status,"sold");
assert.equal((await call("/api/ideas/"+exclusiveIdea.id+"/details",{user:"buyer"})).status,403);
assert.equal((await checkout(exclusiveIdea.id,"other-buyer","view")).status,409);
console.log("PASS exclusive refund never silently relists or restores buyer access");

const lateIdea=await listing(),lateOrder=await checkout(lateIdea.id,"buyer","view");
const latePayout=await call("/api/seller/payouts",{user:"seller",method:"POST",key:"late-payout-check",clock:later,body:{}});
assert.equal(latePayout.status,201);
const lateCase=await call("/api/cases",{user:"buyer",method:"POST",body:{kind:"refund",ideaId:lateIdea.id,orderId:lateOrder.data.order.id,reason:"정산 요청 후 확인",message:"정산 요청이 접수된 후 제공 자료를 다시 확인하여 추가 검토를 요청하는 테스트입니다."}});
assert.equal(lateCase.status,201);
assert.equal((await call("/api/admin/payouts/"+latePayout.data.payout.id,{user:"operator",method:"POST",body:{action:"pay",reason:"정산 요청 후 분쟁이 생겼으므로 완료되면 안 되는 테스트입니다."}})).status,409);
assert.equal((await call("/api/admin/cases/"+lateCase.data.id,{user:"operator",method:"POST",body:{action:"refund",resolution:"진행 중 정산이 취소되기 전에는 환불을 확정하면 안 됩니다."}})).status,409);
assert.equal((await call("/api/admin/payouts/"+latePayout.data.payout.id,{user:"operator",method:"POST",body:{action:"cancel",reason:"분쟁 검토를 위해 아직 완료하지 않은 정산 요청을 취소합니다."}})).status,200);
assert.equal((await call("/api/admin/cases/"+lateCase.data.id,{user:"operator",method:"POST",body:{action:"refund",resolution:"정산 요청 취소 후 제공 자료를 확인하고 테스트 환불을 완료합니다."}})).status,200);
console.log("PASS disputes after payout request prevent completion until cancellation");

await signup("quota-seller","seller");
const uploads=await Promise.all(Array.from({length:18},async()=>{
 const response=await handleAPI(new Request("https://seed.test/api/uploads?kind=private",{method:"POST",headers:{"Content-Type":"image/png"},body:png}),env,{identity:{id:"quota-seller"}});
 return response.status;
}));
assert.equal(uploads.filter(status=>status===201).length,15);
assert.equal(uploads.filter(status=>status===429).length,3);
assert.equal((await db.prepare("SELECT count(*) AS n FROM uploads WHERE owner_id='quota-seller'").first()).n,15);
console.log("PASS concurrent private upload reservations respect account limits");

const secretEnv={BETTER_AUTH_URL:"https://seed.example",BETTER_AUTH_SECRET:"server-only-super-secret-123456789012345678",NAVER_CLIENT_ID:"private-client-id",NAVER_CLIENT_SECRET:"private-client-secret"};
assert.equal(authSettings(secretEnv,"sites").providers[0].available,false);
assert.equal(authSettings(secretEnv,"better-auth").providers[0].available,true);
assert.equal(authSettings(secretEnv,"better-auth").providers[1].available,false);
assert.equal(adminAuthSettings(secretEnv,"better-auth").providers[0].callbackURL,"https://seed.example/api/auth/callback/naver");
assert.ok(!JSON.stringify(publicAuthSettings(secretEnv,"better-auth")).includes("private-client"));
assert.ok(!JSON.stringify(adminAuthSettings(secretEnv,"better-auth")).includes("private-client"));
assert.throws(()=>betterAuthOptions({...secretEnv,BETTER_AUTH_URL:"http://insecure.example"},null));
assert.equal(betterAuthOptions(secretEnv,null).account.accountLinking.enabled,false);
assert.equal(betterAuthOptions(secretEnv,null).emailAndPassword.enabled,false);
assert.equal((await call("/api/admin/overview",{user:"operator"})).data.events.some(x=>x.action==="case.refund"),true);
db.close();console.log("PASS social auth preparation, secret redaction and audit events");
console.log("ALL OPERATIONS CHECKS PASSED");
