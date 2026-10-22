import {priceGuideFor,priceGuideHTML} from "./pricing.js";

export function createOperationsUI(ctx){
  const {api,post,show,header,button,icon,h,money,toast,member}=ctx;
  const $=(s,root=document)=>root.querySelector(s);
  const statusNames={pending:"검토 대기",approved:"공개 승인",rejected:"반려",suspended:"게시 중단",open:"접수",reviewing:"검토 중",resolved:"처리 완료",requested:"정산 요청",paid:"테스트 처리 완료",cancelled:"취소",refunded:"테스트 환불"};
  const kindNames={report:"신고",refund:"환불 문의",dispute:"거래 분쟁"};
  const badge=(status)=>'<span class="ops-badge status-'+h(status)+'">'+h(statusNames[status]||status)+'</span>';
  const date=(value)=>value?new Date(value).toLocaleString("ko-KR"):"—";
  const notice=(text)=>'<div class="notice-box">'+icon("info")+'<span>'+h(text)+'</span></div>';
  const textarea=(name,label,min,max,value="")=>'<div class="field"><label for="ops-'+name+'">'+h(label)+'</label><textarea id="ops-'+name+'" name="'+name+'" required minlength="'+min+'" maxlength="'+max+'">'+h(value)+'</textarea></div>';
  const errorBox=()=>'<p class="form-message" role="alert" hidden></p>';
  const submit=(label)=>'<button type="submit" class="button button-dark">'+h(label)+icon("arrow")+'</button>';
  async function load(title,work){
    const token=crypto.randomUUID();
    show(header(title)+'<div class="dialog-content"><p class="prose">내용을 불러오는 중이에요.</p></div>',{type:"ops-loading",token});
    try{const value=await work();return ctx.getCurrent()?.token===token?value:null;}
    catch(error){if(ctx.getCurrent()?.token===token)show(header("내용을 불러올 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("close","닫기","","button button-outline")+'</div>',{type:"ops-error"});return null;}
  }
  function nav(){
    const profile=ctx.getAuth()?.profile;
    if(!profile)return "";
    return '<div class="account-tools">'+(profile.role==="seller"?button("create","새 아이디어 등록","","button button-dark","plus")+button("ops-finance","매출 · 정산","","button button-outline","file")+button("uploads","미사용 업로드","","button button-outline","grid"):"")+button("ops-cases","문의 · 신고 내역","","button button-outline","info")+(ctx.getAuth()?.isAdmin?button("ops-admin","운영 관리","","button button-dark","grid"):"")+'</div>';
  }
  function socialButtons(){
    const info=ctx.getAuth()?.auth||ctx.getConfig()?.auth;
    if(!info)return "";
    const buttons=info.providers.map(p=>'<button type="button" class="social-button social-'+h(p.id)+'" data-action="ops-social" data-provider="'+h(p.id)+'" '+(!p.available?'disabled aria-disabled="true"':"")+'><span class="social-letter">'+({naver:"N",kakao:"●",google:"G"}[p.id])+'</span><span>'+h(p.label)+'로 계속</span>'+(!p.available?'<small>연결 준비중</small>':icon("arrow"))+'</button>').join("");
    return '<div class="social-logins">'+buttons+(info.emailEnabled?button("ops-email","이메일로 가입 · 로그인","","button button-outline full-width","file"):"")+'</div>';
  }
  function enhanceListingForm(form){
    const config=ctx.getConfig();
    form.dataset.feeQuote=JSON.stringify(config.commerce);
    form.dataset.sellerTermsVersion=config.sellerTerms.version;
    const quality='<section class="listing-quality"><h3>구체성과 창작 근거</h3><p class="form-hint">검토할 수 있는 사실을 적어주세요. 기획 수준은 판매자가 선택하며 사업성 보증을 의미하지 않습니다.</p>'+textarea("originality","직접 창작한 근거 · 참고 자료 출처 *",20,4000)+textarea("validationNote","검증한 내용과 아직 검증하지 않은 부분 *",20,4000)+textarea("risks","실행의 한계와 위험 *",10,2000)+'</section>';
    $(".upload-section",form).insertAdjacentHTML("beforebegin",quality);
    $(".form-footer",form).insertAdjacentHTML("beforebegin",'<section class="seller-policy"><h3>판매 수수료와 정산 조건</h3><div class="policy-rates"><span>열람권 <strong>'+config.commerce.viewBps/100+'%</strong></span><span>독점 사용권 <strong>'+config.commerce.useBps/100+'%</strong></span><span>정산 대기 <strong>'+config.commerce.holdDays+'일</strong></span></div><details><summary>판매 정책 전문 확인</summary><p>'+h(config.sellerTerms.text)+'</p></details><label class="checkbox-label"><input type="checkbox" name="sellerAgreement" required><span>위 수수료와 정산 조건에 동의하며 운영 검토 후 공개되는 절차를 확인했습니다.</span></label></section>');
  }
  function refreshListingPolicy(form){
    const config=ctx.getConfig(),section=$(".seller-policy",form);
    form.dataset.feeQuote=JSON.stringify(config.commerce);
    form.dataset.sellerTermsVersion=config.sellerTerms.version;
    if(!section)return;
    const rates=section.querySelectorAll(".policy-rates strong");
    rates[0].textContent=config.commerce.viewBps/100+"%";
    rates[1].textContent=config.commerce.useBps/100+"%";
    rates[2].textContent=config.commerce.holdDays+"일";
    $("details p",section).textContent=config.sellerTerms.text;
    $("input",section).checked=false;
  }
  function detailTools(id,data){
    return '<div class="detail-ops">'+(data.own&&data.idea.reviewStatus!=="approved"?notice((statusNames[data.idea.reviewStatus]||"검토 중")+" · "+(data.idea.reviewReason||"운영 검토가 끝나면 공개됩니다.")):"")+(data.canEdit?button("edit","수정 후 재검토 요청",id,"button button-outline","pen"):"")+button("ops-case-new","신고 · 거래 문의",id,"text-button","info")+(ctx.getAuth()?.isAdmin?button("ops-review","운영 검토 결정",id,"text-button","pen"):"")+'</div>';
  }
  function qualityHTML(quality){
    if(!quality)return "";
    return '<div class="quality-record"><h3>'+icon("file")+'창작 근거와 검증 현황</h3>'+[["창작 근거 · 출처",quality.originality],["검증 현황",quality.validation_note],["한계와 위험",quality.risks]].map(([label,text])=>'<section class="private-section"><h4>'+h(label)+'</h4><p class="plan-text">'+h(text)+'</p></section>').join("")+'<details class="registration-proof"><summary>등록 버전 기록</summary><p>버전 '+quality.version+' · '+h(date(quality.created_at))+'</p><code>'+h(quality.content_hash)+'</code><p>등록 내용과 이미지 식별자의 해시 기록입니다. 외부 공증이나 법적 독점권 증명은 아닙니다.</p></details></div>';
  }
  async function finance(){
    if(!member("seller"))return;
    const data=await load("매출과 정산",()=>api("/api/seller/finance"));if(!data)return;
    const cards=[["테스트 거래액",data.gross],["환불 제외 수수료",data.netCommission],["테스트 환불액",data.refundedGross],["현재 정산 가능",data.available]];
    const ledger=data.items.map(item=>{
      const payout=data.payouts.find(p=>p.id===item.payout_id);
      const state=item.voided_at?"테스트 환불":payout?(statusNames[payout.status]||payout.status):"대기 · "+date(item.hold_until);
      return '<article class="finance-row"><div><strong>'+h(item.title)+'</strong><p>'+(item.kind==="view"?"상세 열람권":"독점 사용권")+' · '+h(date(item.created_at))+'</p><small>'+h(state)+'</small></div><div class="fee-breakdown"><span>판매 '+money(item.gross)+'원</span><span>수수료 '+item.commission_bps/100+'% · −'+money(item.platform_fee)+'원</span><strong>예상 정산 '+money(item.seller_amount)+'원</strong></div></article>';
    }).join("");
    const payouts=data.payouts.map(item=>'<div class="payout-history"><div><strong>'+money(item.amount)+'원</strong><p>'+h(date(item.created_at))+'</p></div>'+badge(item.status)+'</div>').join("");
    show(header("매출과 정산","SELLER FINANCE")+'<div class="dialog-content">'+notice(data.note+" 신고·분쟁이 진행 중인 거래와 대기 기간이 남은 거래는 정산 가능액에서 제외됩니다.")+'<div class="ops-metrics">'+cards.map(([label,value])=>'<div><span>'+h(label)+'</span><strong>'+money(value)+'<small>원</small></strong></div>').join("")+'</div><div class="finance-request"><p>실제 송금 없는 테스트 정산 요청입니다.</p><button type="button" class="button button-dark" data-action="ops-payout-request" '+(data.available<=0?"disabled":"")+'>정산 요청 접수'+icon("arrow")+'</button></div><h3 class="ops-heading">거래별 수수료 원장</h3>'+(ledger||'<p class="prose">아직 거래 내역이 없어요.</p>')+'<h3 class="ops-heading">정산 요청 이력</h3>'+(payouts||'<p class="prose">아직 정산을 요청하지 않았어요.</p>')+'</div>',{type:"ops-finance"});
  }
  async function cases(){
    if(!member())return;
    const data=await load("문의와 신고",()=>api("/api/cases"));if(!data)return;
    const seller=ctx.getAuth().profile.role==="seller";
    const rows=data.cases.map(item=>'<article class="case-card"><div class="case-heading"><span>'+h(kindNames[item.kind])+'</span>'+badge(item.status)+'</div><h3>'+h(item.title)+'</h3><p class="case-reason">'+h(item.reason)+'</p>'+(item.first_accessed_at?'<p class="access-date">최초 상세·이미지 접근 '+h(date(item.first_accessed_at))+'</p>':'<p class="access-date">상세·이미지 최초 접근 기록 없음</p>')+'<p class="case-message">'+h(item.message)+'</p>'+(item.seller_response?'<div class="case-response"><b>판매자 답변</b><p>'+h(item.seller_response)+'</p></div>':"")+(item.resolution?'<div class="case-response"><b>운영 검토 내용</b><p>'+h(item.resolution)+'</p></div>':"")+'<div class="case-bottom"><small>'+h(date(item.created_at))+'</small>'+(seller&&item.user_id!==ctx.getAuth().profile.id&&["open","reviewing"].includes(item.status)?button("ops-case-reply","판매자 답변",item.id,"text-button","pen"):"")+'</div></article>').join("");
    show(header("문의 · 신고 내역","CUSTOMER CARE")+'<div class="dialog-content">'+notice("진행 중인 신고·분쟁이 있으면 관련 아이디어의 거래 정산을 보류합니다. 실제 환불은 운영 검토와 결제 서비스 처리가 필요합니다.")+(rows||'<div class="empty-state"><h3>아직 접수한 문의가 없어요.</h3><p>아이디어 상세 또는 결제 내역에서 문의를 접수할 수 있어요.</p></div>')+'</div>',{type:"ops-cases"});
  }
  async function newCase(id,orderId=""){
    if(!member())return;
    const data=await load("신고와 거래 문의",()=>api("/api/account"));if(!data)return;
    const orders=data.orders.filter(o=>o.idea_id===id&&o.effective_status!=="refunded");
    const title=orders[0]?.title||"아이디어에 관한 문의";
    const options=orders.map(o=>'<option value="'+h(o.id)+'" '+(o.id===orderId?"selected":"")+'>'+(o.kind==="view"?"열람권":"독점 사용권")+' · '+money(o.amount)+'원 · '+h(date(o.created_at))+'</option>').join("");
    show(header("신고 · 거래 문의","MAKE IT CLEAR")+'<div class="dialog-content">'+notice("거래와 자료에 관한 사실을 구체적으로 적어주세요. 같은 유형의 진행 중 문의는 한 번만 접수할 수 있어요.")+'<p class="checkout-lead">'+h(title)+'</p><form id="ops-case-form" class="idea-form" data-id="'+h(id)+'"><div class="field"><label for="ops-kind">문의 유형</label><select id="ops-kind" name="kind"><option value="report">아이디어 신고</option>'+(orders.length?'<option value="refund" '+(orderId?"selected":"")+'>환불 검토 요청</option><option value="dispute">거래 분쟁</option>':"")+'</select></div>'+(orders.length?'<div class="field"><label for="ops-orderId">관련 주문 · 환불/분쟁 시 필수</label><select id="ops-orderId" name="orderId">'+options+'</select></div>':"")+'<div class="field"><label for="ops-reason">문의 사유</label><input id="ops-reason" name="reason" required minlength="2" maxlength="120" placeholder="예: 공개 요약과 실제 자료의 차이"></div>'+textarea("message","구체적인 내용 · 20자 이상",20,4000)+errorBox()+'<div class="form-footer">'+submit("검토 요청 접수")+'</div></form></div>',{type:"ops-case-new",id});
  }
  async function orderCase(orderId){
    if(!member("buyer"))return;
    const data=await api("/api/account"),order=data.orders.find(o=>o.id===orderId);
    if(!order){toast("내 결제 내역을 찾을 수 없어요.");return;}
    await newCase(order.idea_id,orderId);
  }
  function reply(id){
    show(header("판매자 답변")+'<div class="dialog-content"><form id="ops-reply-form" class="idea-form" data-id="'+h(id)+'">'+textarea("message","자료와 거래 사실에 관한 설명 · 10자 이상",10,4000)+errorBox()+submit("답변 남기기")+'</form></div>',{type:"ops-reply",id});
  }
  async function admin(tab="reviews"){
    if(!ctx.getAuth()?.isAdmin){toast("운영자만 이용할 수 있어요.");return;}
    const data=await load("운영 관리",async()=>{const [overview,settings]=await Promise.all([api("/api/admin/overview"),api("/api/admin/settings")]);return {overview,settings};});if(!data)return;
    const {overview,settings}=data,tabs=[["reviews","아이디어 심사"],["cases","신고 · 분쟁"],["payouts","정산"],["settings","설정 · 로그인"],["audit","변경 이력"]];
    if(!tabs.some(x=>x[0]===tab))tab="reviews";
    let body="";
    if(tab==="reviews"){
      body=overview.reviews.map(item=>'<article class="ops-review-row"><div><div class="case-heading">'+badge(item.status)+'<span>'+h(item.seller)+'</span></div><h3>'+h(item.title)+'</h3><p>'+h(item.reason||"제공 자료와 공개 범위, 권리 고지를 확인해 주세요.")+'</p></div><div class="ops-row-actions">'+button("detail","상세 기획",item.id,"text-button","file")+button("ops-review","검토 결정",item.id,"text-button","pen")+'</div></article>').join("")||'<p class="prose">검토할 아이디어가 없어요.</p>';
    }else if(tab==="cases"){
      body=overview.cases.map(item=>'<article class="case-card"><div class="case-heading"><span>'+h(kindNames[item.kind])+' · '+h(item.requester_name)+'</span>'+badge(item.status)+'</div><h3>'+h(item.title)+'</h3><p class="case-reason">'+h(item.reason)+'</p>'+(item.first_accessed_at?'<p class="access-date">최초 상세·이미지 접근 '+h(date(item.first_accessed_at))+'</p>':'<p class="access-date">상세·이미지 최초 접근 기록 없음</p>')+'<p class="case-message">'+h(item.message)+'</p>'+(item.seller_response?'<div class="case-response"><b>판매자 답변</b><p>'+h(item.seller_response)+'</p></div>':"")+(item.resolution?'<div class="case-response"><b>운영 처리</b><p>'+h(item.resolution)+'</p></div>':"")+(["open","reviewing"].includes(item.status)?button("ops-case-decision","검토 · 처리",item.id,"text-button","pen"):"")+'</article>').join("")||'<p class="prose">접수된 문의가 없어요.</p>';
    }else if(tab==="payouts"){
      body=notice("이 화면의 완료 처리는 테스트 상태 기록입니다. 실제 송금은 연결하지 않았습니다. 진행 중인 신고·분쟁이 있으면 완료할 수 없습니다.")+overview.payouts.map(item=>'<article class="ops-review-row"><div><h3>'+h(item.seller_name)+' · '+money(item.amount)+'원</h3><p>'+h(date(item.created_at))+'</p>'+badge(item.status)+'</div><div class="ops-row-actions">'+(item.status==="requested"?button("ops-payout-decision","테스트 처리 · 취소",item.id,"text-button","pen"):"")+'</div></article>').join("");
    }else if(tab==="settings"){
      const c=settings.commerce,a=settings.auth;
      body='<h3 class="ops-heading">새 등록 아이디어의 수수료 정책</h3>'+notice("변경 후 새로 등록하는 아이디어에만 적용됩니다. 기존 아이디어의 합의 조건과 과거 주문의 수수료는 유지됩니다.")+'<form id="ops-settings-form" class="idea-form"><div class="form-row"><div class="field"><label for="ops-viewBps">열람권 수수료 (%)</label><input id="ops-viewBps" name="viewPercent" type="number" min="0" max="50" step="0.01" required value="'+c.viewBps/100+'"></div><div class="field"><label for="ops-useBps">독점 사용권 수수료 (%)</label><input id="ops-useBps" name="usePercent" type="number" min="0" max="50" step="0.01" required value="'+c.useBps/100+'"></div></div><div class="field"><label for="ops-holdDays">정산 대기 (일)</label><input id="ops-holdDays" name="holdDays" type="number" min="1" max="30" step="1" required value="'+c.holdDays+'"></div>'+textarea("reason","정책 변경 사유",10,500)+errorBox()+submit("새 등록 건의 정책 저장")+'</form><h3 class="ops-heading">소셜 로그인 연결 준비</h3>'+notice(a.backend==="sites"?"현재 Sites 호스팅은 ChatGPT 인증을 사용합니다. 아래 외부 소셜 로그인은 독립 Node 인증 모드에서 활성화됩니다.":"독립 인증 모드입니다. 키 등록 여부와 실제 서비스의 앱 승인·동작 검증은 별개입니다.")+'<div class="auth-status-line"><span>서비스 주소: '+h(a.baseURL||"미설정")+'</span><span>서버 인증 비밀값: '+(a.secretReady?"설정됨":"미설정")+'</span><span>인증 메일: '+(a.mailReady?"연결 설정 있음":"미설정 · 이메일 가입 비활성")+'</span></div>'+a.providers.map(p=>'<article class="provider-setup"><div class="case-heading"><h3>'+h(p.label)+'</h3><span class="ops-badge">'+(p.available?"연결 설정 준비됨":p.configured?"키 등록됨 · 현재 모드 미활성":"키 등록 대기")+'</span></div><p>서버 환경변수</p><code>'+h(p.clientKey)+'</code><code>'+h(p.secretKey)+'</code><p>등록할 콜백 URL</p><code class="callback-url">'+h(p.callbackURL||"BETTER_AUTH_URL 설정 후 표시됩니다.")+'</code><a class="text-button" href="'+h(p.portal)+'" target="_blank" rel="noopener noreferrer">개발자 앱 등록'+icon("up")+'</a></article>').join("")+'<p class="form-hint">비밀키는 서버 환경설정에만 입력합니다. 이 화면은 실제 값이나 토큰을 조회·저장하지 않습니다. 카카오는 이메일 제공 동의 항목의 사용 조건과 앱 승인을 별도로 확인해 주세요.</p>';
    }else{
      body=overview.events.map(item=>'<article class="audit-row"><div><strong>'+h(item.action)+'</strong><small>'+h(date(item.created_at))+'</small></div><p>실행 계정 '+h(item.actor_id)+'</p><p>대상 '+h(item.target_id)+'</p><pre>'+h(JSON.stringify(JSON.parse(item.detail),null,2))+'</pre></article>').join("")||'<p class="prose">아직 변경 기록이 없어요.</p>';
    }
    show(header("운영 관리","SEED OPERATIONS")+'<div class="dialog-content">'+notice("테스트 운영 데이터입니다. 심사, 수수료, 환불과 정산의 변경 내역을 서버에 기록합니다.")+'<div class="ops-metrics"><div><span>테스트 거래액</span><strong>'+money(overview.totals.gross)+'<small>원</small></strong></div><div><span>환불 제외 테스트 수수료</span><strong>'+money(overview.totals.netCommission)+'<small>원</small></strong></div><div><span>테스트 환불액</span><strong>'+money(overview.totals.refunds)+'<small>원</small></strong></div><div><span>검토 대기 아이디어</span><strong>'+overview.reviews.filter(x=>x.status==="pending").length+'<small>건</small></strong></div></div><div class="ops-tabs" role="tablist" aria-label="운영 관리 메뉴">'+tabs.map(([key,label])=>'<button type="button" class="ops-tab '+(key===tab?"active":"")+'" id="ops-tab-'+key+'" role="tab" aria-controls="ops-panel" tabindex="'+(key===tab?"0":"-1")+'" aria-selected="'+(key===tab)+'" data-action="ops-admin-tab" data-tab="'+key+'">'+label+'</button>').join("")+'</div><div class="ops-panel" id="ops-panel" role="tabpanel" aria-labelledby="ops-tab-'+tab+'">'+body+'</div></div>',{type:"ops-admin",tab});
  }
  async function review(id){
    const data=await load("아이디어 검토",()=>api("/api/ideas/"+id));if(!data)return;
    show(header("아이디어 공개 검토")+'<div class="dialog-content"><p class="checkout-lead">'+h(data.idea.title)+'</p>'+notice("선택한 기획 수준에 맞는 자료와 출처·제공 범위를 확인하세요. 권장액 초과만으로 반려하지 않으며, 승인으로 사업성이나 법적 독점권을 보증하지 않습니다.")+priceGuideHTML(data.idea.priceGuide||priceGuideFor(data.idea))+'<form id="ops-review-form" class="idea-form" data-id="'+h(id)+'" data-expected="'+h(data.idea.reviewStatus)+'" data-version="'+Number(data.registrationVersion||0)+'"><div class="field"><label for="ops-review-status">검토 결과</label><select id="ops-review-status" name="status"><option value="approved">공개 승인</option><option value="rejected">반려 · 보완 필요</option><option value="suspended">게시 및 열람 중단</option></select></div>'+textarea("reason","구체적인 검토 사유",10,1000)+errorBox()+submit("검토 결과 기록")+'</form></div>',{type:"ops-review",id});
  }
  async function caseDecision(id){
    const data=await load("문의 검토",()=>api("/api/admin/overview"));if(!data)return;
    const item=data.cases.find(x=>x.id===id);if(!item){toast("문의 내역을 찾을 수 없어요.");return;}
    show(header("신고 · 분쟁 처리")+'<div class="dialog-content"><p class="checkout-lead">'+h(item.title)+'</p><p class="case-message">'+h(item.message)+'</p>'+notice("독점 사용권을 환불해도 아이디어를 자동 재판매하지 않습니다. 정산에 포함된 주문은 먼저 해당 정산을 취소하거나 수동 조정해야 합니다.")+'<form id="ops-case-decision-form" class="idea-form" data-id="'+h(id)+'"><div class="field"><label for="ops-case-action">처리</label><select id="ops-case-action" name="action"><option value="reviewing">검토 중으로 전환</option><option value="resolve">검토 완료 · 종결</option><option value="reject">사유를 남기고 반려</option>'+(item.order_id?'<option value="refund">테스트 전액 환불</option>':"")+'</select></div>'+textarea("resolution","검토 내용과 처리 근거",10,2000)+errorBox()+submit("처리 결과 기록")+'</form></div>',{type:"ops-case-decision",id});
  }
  function payoutDecision(id){
    show(header("정산 요청 처리")+'<div class="dialog-content">'+notice("실제 송금이 발생하지 않는 테스트 처리입니다. 분쟁 중인 거래는 완료할 수 없습니다.")+'<form id="ops-payout-form" class="idea-form" data-id="'+h(id)+'"><div class="field"><label for="ops-payout-action">처리</label><select id="ops-payout-action" name="action"><option value="pay">테스트 정산 완료</option><option value="cancel">요청 취소 · 거래를 정산 가능 상태로 반환</option></select></div>'+textarea("reason","처리 사유",10,1000)+errorBox()+submit("테스트 처리 기록")+'</form></div>',{type:"ops-payout-decision",id});
  }
  function email(){
    if(!ctx.getAuth()?.auth.emailEnabled){toast("이메일 인증과 메일 전송을 먼저 연결해 주세요.");return;}
    show(header("이메일 가입 · 로그인")+'<div class="dialog-content"><form id="ops-email-form" class="idea-form"><div class="field"><label for="ops-email-action">진행 방식</label><select id="ops-email-action" name="action"><option value="login">로그인</option><option value="signup">새 이메일 계정 가입</option><option value="reset">비밀번호 재설정 메일</option></select></div><div class="field"><label for="ops-email-address">이메일</label><input id="ops-email-address" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="ops-password">비밀번호 · 가입 시 12자 이상</label><input id="ops-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="current-password"></div><div class="field"><label for="ops-email-name">활동 이름 · 새 가입 시 입력</label><input id="ops-email-name" name="name" maxlength="24" autocomplete="nickname"></div>'+errorBox()+submit("계속")+'</form><p class="form-hint">가입 확인 메일을 인증한 뒤 로그인하세요. 로그인 후 판매자·구매자 역할을 선택합니다.</p></div>',{type:"ops-email"});
  }
  function resetPassword(){
    const token=new URL(window.location.href).searchParams.get("token");
    if(!ctx.getAuth()?.auth.emailEnabled||!token){toast("유효한 비밀번호 재설정 링크를 확인해 주세요.");return;}
    show(header("새 비밀번호 설정")+'<div class="dialog-content"><form id="ops-reset-password-form" class="idea-form"><div class="field"><label for="ops-new-password">새 비밀번호 · 12자 이상</label><input id="ops-new-password" name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></div><div class="field"><label for="ops-confirm-password">새 비밀번호 확인</label><input id="ops-confirm-password" name="confirmation" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></div>'+errorBox()+submit("새 비밀번호 저장")+'</form></div>',{type:"ops-reset-password"});
  }
  const actions=new Set(["ops-finance","ops-cases","ops-case-new","ops-order-case","ops-case-reply","ops-payout-request","ops-admin","ops-admin-tab","ops-review","ops-case-decision","ops-payout-decision","ops-social","ops-email","ops-logout"]);
  const forms=new Set(["ops-case-form","ops-reply-form","ops-settings-form","ops-review-form","ops-case-decision-form","ops-payout-form","ops-email-form","ops-reset-password-form"]);
  async function action(name,id,el){
    if(name==="ops-finance")return finance();
    if(name==="ops-cases")return cases();
    if(name==="ops-case-new")return newCase(id);
    if(name==="ops-order-case")return orderCase(id);
    if(name==="ops-case-reply")return reply(id);
    if(name==="ops-admin")return admin();
    if(name==="ops-admin-tab")return admin(el.dataset.tab);
    if(name==="ops-review")return review(id);
    if(name==="ops-case-decision")return caseDecision(id);
    if(name==="ops-payout-decision")return payoutDecision(id);
    if(name==="ops-email")return email();
    if(name==="ops-payout-request"){
      el.disabled=true;
      try{await post("/api/seller/payouts",{},{"Idempotency-Key":crypto.randomUUID()});toast("테스트 정산 요청을 접수했어요. 실제 송금은 발생하지 않습니다.");await finance();}finally{if(el.isConnected)el.disabled=false;}
    }
    if(name==="ops-social"){
      const provider=ctx.getAuth()?.auth.providers.find(p=>p.id===el.dataset.provider&&p.available);
      if(!provider){toast("이 소셜 로그인 연결은 아직 준비 중이에요.");return;}
      el.disabled=true;
      try{const response=await post("/api/auth/sign-in/social",{provider:provider.id,callbackURL:"/#join"});if(!response.url)throw new Error("로그인 이동 주소를 확인할 수 없어요.");const url=new URL(response.url);if(url.protocol!=="https:")throw new Error("안전한 로그인 주소를 확인할 수 없어요.");window.location.assign(url.href);}finally{if(el.isConnected)el.disabled=false;}
    }
    if(name==="ops-logout"){await post("/api/auth/sign-out",{});window.location.assign("/");}
  }
  async function submitForm(form){
    const value=Object.fromEntries(new FormData(form)),submitButton=$('button[type="submit"]',form);
    submitButton.disabled=true;
    try{
      if(form.id==="ops-case-form"){await post("/api/cases",{...value,ideaId:form.dataset.id});if(form.isConnected)await cases();toast("문의가 접수됐어요. 관련 정산은 검토 중 보류됩니다.");}
      if(form.id==="ops-reply-form"){await post("/api/cases/"+form.dataset.id+"/reply",value);if(form.isConnected)await cases();toast("판매자 답변을 기록했어요.");}
      if(form.id==="ops-settings-form"){await post("/api/admin/settings",{viewBps:Math.round(Number(value.viewPercent)*100),useBps:Math.round(Number(value.usePercent)*100),holdDays:Number(value.holdDays),reason:value.reason});await ctx.refreshConfig();if(form.isConnected)await admin("settings");toast("새 등록 건의 수수료 정책을 저장했어요.");}
      if(form.id==="ops-review-form"){await post("/api/admin/ideas/"+form.dataset.id+"/review",{status:value.status,reason:value.reason,expectedStatus:form.dataset.expected,expectedVersion:Number(form.dataset.version)});await ctx.refresh();if(form.isConnected)await admin("reviews");toast("검토 결과를 기록했어요.");}
      if(form.id==="ops-case-decision-form"){await post("/api/admin/cases/"+form.dataset.id,value);await ctx.refresh();if(form.isConnected)await admin("cases");toast(value.action==="refund"?"테스트 환불과 수수료 반환을 기록했어요.":"문의 검토 결과를 기록했어요.");}
      if(form.id==="ops-payout-form"){await post("/api/admin/payouts/"+form.dataset.id,value);if(form.isConnected)await admin("payouts");toast("실제 송금 없는 테스트 처리 결과를 기록했어요.");}
      if(form.id==="ops-email-form"){
        if(value.action==="signup"){
          if(!value.password||value.password.length<12||!value.name||value.name.trim().length<2)throw new Error("활동 이름과 12자 이상의 비밀번호를 입력해 주세요.");
          await post("/api/auth/sign-up/email",{email:value.email,password:value.password,name:value.name,callbackURL:"/#join"});toast("가입 확인 메일을 보냈어요. 인증 후 로그인해 주세요.");
        }else if(value.action==="reset"){
          await post("/api/auth/request-password-reset",{email:value.email,redirectTo:"/#reset-password"});toast("해당 계정이 있다면 재설정 안내 메일이 발송됩니다.");
        }else{
          if(!value.password)throw new Error("비밀번호를 입력해 주세요.");
          await post("/api/auth/sign-in/email",{email:value.email,password:value.password,callbackURL:"/#join"});window.location.assign("/#join");window.location.reload();
        }
      }
      if(form.id==="ops-reset-password-form"){
        if(value.newPassword!==value.confirmation)throw new Error("비밀번호 확인이 일치하지 않아요.");
        const token=new URL(window.location.href).searchParams.get("token");
        if(!token)throw new Error("비밀번호 재설정 링크를 다시 열어주세요.");
        await post("/api/auth/reset-password",{newPassword:value.newPassword,token});
        window.history.replaceState(null,"",window.location.pathname+"#join");
        toast("비밀번호를 변경했어요. 새 비밀번호로 로그인하세요.");
        email();
      }
    }catch(error){const errorElement=$(".form-message",form);if(errorElement&&form.isConnected){errorElement.textContent=error.message;errorElement.hidden=false;errorElement.scrollIntoView({block:"nearest"});}else toast(error.message);}
    finally{if(submitButton.isConnected)submitButton.disabled=false;}
  }
  document.addEventListener("keydown",async event=>{
    if(!event.target.classList?.contains("ops-tab")||!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
    event.preventDefault();
    const tabs=Array.from(document.querySelectorAll(".ops-tab")),at=tabs.indexOf(event.target);
    const index=event.key==="Home"?0:event.key==="End"?tabs.length-1:(at+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
    const tab=tabs[index].dataset.tab;await admin(tab);document.querySelector('.ops-tab[data-tab="'+tab+'"]')?.focus();
  });
  return {nav,socialButtons,enhanceListingForm,refreshListingPolicy,detailTools,qualityHTML,resetPassword,handles:(name)=>actions.has(name),hasForm:(id)=>forms.has(id),action,submitForm};
}
