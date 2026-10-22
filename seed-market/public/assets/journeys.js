import {escapeHtml as h} from "./format.js";
import {priceGuideHTML} from "./pricing.js";

// Only action identifiers are stored. Idea text, images and consent never enter
// these session records. In-memory fallback supports browsers blocking storage.
export function createJourneyState(storage,{now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}){
  const memory=new Map();
  const read=key=>{let raw;try{raw=storage?.getItem(key);}catch{}try{return JSON.parse(raw||memory.get(key)||"null");}catch{return null;}};
  const write=(key,value)=>{memory.set(key,JSON.stringify(value));try{storage?.setItem(key,JSON.stringify(value));}catch{}};
  const remove=key=>{memory.delete(key);try{storage?.removeItem(key);}catch{}};
  const validId=value=>typeof value==="string"&&/^[a-zA-Z0-9-]{1,128}$/.test(value);
  const validIntent=intent=>["create","edit","checkout","favorite","account","share-create","value-opinion","value-mine"].includes(intent?.type)&&["seller","buyer",null].includes(intent.role??null)&&(!["edit","checkout","favorite","value-opinion"].includes(intent.type)||validId(intent.id));
  const requestName=(owner,type,resource)=>"seed-request-v5:"+owner+":"+type+":"+resource;
  return {
    remember(intent){
      if(!validIntent(intent))return;
      write("seed-continue-v5",{type:intent.type,role:intent.role||null,id:intent.id||null,kind:intent.kind==="use"?"use":"view",at:now()});
    },
    take(role){const value=read("seed-continue-v5");remove("seed-continue-v5");if(!validIntent(value)||!Number.isFinite(value.at)||now()-value.at>30*60*1000||now()<value.at||value.role&&value.role!==role)return null;return {type:value.type,role:value.role||null,id:value.id||null,kind:value.kind==="use"?"use":"view",at:value.at};},
    peek(owner,type,resource){const value=read(requestName(owner,type,resource));return value&&Number.isFinite(value.at)&&validId(value.key)&&now()-value.at<86400000&&now()>=value.at?value.key:null;},
    request(owner,type,resource){const existing=this.peek(owner,type,resource);if(existing)return existing;const key=uuid();write(requestName(owner,type,resource),{key,at:now()});return key;},
    clear(owner,type,resource){remove(requestName(owner,type,resource));}
  };
}

export function accessHTML(access){
  if(!access)return "";
  return '<div class="access-state '+(access.canView?"available":"unavailable")+'"><strong>'+h(access.label)+'</strong><p>'+h(access.description)+'</p></div>';
}
export function receiptHTML(data,{button,money}){
  const {order,pledge,refund,access,firstAccessedAt}=data,date=value=>value?new Date(value).toLocaleString("ko-KR"):"아직 없음";
  const line=(label,value)=>'<div><dt>'+h(label)+'</dt><dd>'+h(value)+'</dd></div>';
  return '<div class="dialog-content"><div class="receipt-heading"><span class="soft-badge">'+(refund?"테스트 환불 완료":"테스트 구매 완료")+'</span><h3>'+h(order.title||"아이디어 거래")+'</h3><p>'+(order.kind==="view"?"상세 열람권":"독점 사용권")+' · 실제 청구 0원</p></div>'+accessHTML(access)+'<dl class="receipt-facts">'+line("주문 번호",order.id)+line("표시 가격",money(order.amount)+"원")+line("구매 시각",date(order.created_at))+line("이 아이디어 최초 열람",date(firstAccessedAt))+(refund?line("환불 처리 시각",date(refund.created_at))+line("테스트 환불 가격",money(refund.gross_reversal)+"원")+line("환불 사유",refund.reason):"")+line("서약 동의 시각",date(pledge?.agreed_at))+line("동의 문구 버전",pledge?.version||"기록 없음")+'</dl>'+priceGuideHTML(data.priceGuide,{kind:order.kind})+'<details class="receipt-pledge"><summary>동의한 서약 전문 확인</summary><div class="pledge-text">'+h(pledge?.text||"")+'</div></details><p class="mini-note">현재는 실제 청구·환급이나 법적 권리 이전이 없는 테스트입니다.</p><div class="journey-actions">'+(access?.canView?button("detail","상세 자료 열기",order.idea_id):"")+button("ops-order-case","이 거래 문의",order.id,"button button-outline")+button("account-orders","결제 내역으로","","text-button")+'</div></div>';
}
export function temporaryUploadsHTML(data,{button,money}){
  return '<div class="dialog-content"><p class="prose">판매 등록에 사용하지 않은 이미지 '+data.uploads.length+' / '+data.limit+'개예요. 등록에 사용 중인 자료는 여기에 표시하지 않아요.</p>'+(data.uploads.length?'<div class="temporary-uploads">'+data.uploads.map(img=>'<article><img src="'+h(img.url)+'" alt="미사용 '+(img.kind==="public"?"공개":"상세")+' 이미지"><div><strong>'+(img.kind==="public"?"공개 커버":"상세 참고 이미지")+'</strong><p>'+money(Math.ceil(img.size/1024))+'KB · '+h(new Date(img.created_at).toLocaleString("ko-KR"))+'</p></div>'+button("upload-delete","삭제",img.id,"button button-outline button-small")+'</article>').join("")+'</div>':'<div class="empty-state"><h3>미사용 업로드가 없어요.</h3><p>새 아이디어를 등록할 준비가 됐어요.</p></div>')+'<div class="journey-actions">'+button("create","아이디어 등록","","button button-dark")+button("account","내 계정으로","","text-button")+'</div></div>';
}
