import {platformNoticeHTML} from "./platform-notices.js";
import {cardArt,ideaCard} from "./cards.js";
import {createOperationsUI} from "./operations.js";
import {escapeHtml as h} from "./format.js";
import {createDiscoveryUI} from "./discovery.js";
import {createSellerStudio} from "./studio.js";
import {createJourneyState,accessHTML,receiptHTML,temporaryUploadsHTML} from "./journeys.js";
import {TOPICS,DOMAINS,briefFor} from "./catalog.js";
import {priceGuideFor,priceGuideHTML} from "./pricing.js";
import {createSharingUI} from "./sharing.js";
import {createValuationsUI} from "./valuations.js";
import {patentFromValues} from "./patent-policy.js";
import {patentDisclosureHTML} from "./patents.js";
const $=(s,root=document)=>root.querySelector(s);
const icon=(s)=>'<svg class="icon" aria-hidden="true"><use href="#i-'+s+'"/></svg>';
const money=(v)=>new Intl.NumberFormat("ko-KR").format(v);
const button=(action,label,id="",cls="button button-dark",symbol="")=>'<button type="button" class="'+cls+'" data-action="'+action+'" data-id="'+h(id)+'">'+h(label)+(symbol?icon(symbol):"")+'</button>';
let config=null,auth=null,account=null,ideas=[],current=null,opener=null,toastTimer,modalSequence=0,uploaded=[];
const dialog=$("#app-dialog"),content=$("#dialog-content"),busyForms=new WeakSet();
let sessionStore;try{sessionStore=sessionStorage;}catch{}
const journey=createJourneyState(sessionStore);
async function api(path,options={}){
 const response=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(30000),...options,headers:{...(options.body&&typeof options.body==="string"?{"Content-Type":"application/json"}:{}),...options.headers}});
 const data=await response.json();
 if(!response.ok){const err=new Error(data.error||data.message||"요청을 처리하지 못했어요.");err.status=response.status;if(err.status===401&&auth?.profile){auth={...auth,authenticated:false,profile:null};account=null;renderHeader();}throw err;}
 return data;
}
const post=(path,body,headers={})=>api(path,{method:"POST",body:JSON.stringify(body),headers});
function toast(text){clearTimeout(toastTimer);const el=$("#toast"),target=dialog.open?dialog:document.body;if(el.parentElement!==target)target.append(el);el.innerHTML=icon("info")+"<span>"+h(text)+"</span>";el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,4500);}
const header=(title,kicker="IDEAS INTO POSSIBILITIES")=>'<div class="dialog-header"><div><span class="dialog-eyebrow">'+h(kicker)+'</span><h2 id="dialog-title" tabindex="-1">'+h(title)+'</h2></div>'+button("close","", "", "icon-button close-dialog","close").replace('type="button"','type="button" aria-label="창 닫기"')+'</div>';
function cleanupUploaded(){const unused=uploaded;uploaded=[];if(unused.length)void Promise.allSettled(unused.map(item=>api("/api/uploads/"+item.id,{method:"DELETE"})));}
function show(html,view,focus="#dialog-title"){
 if(current?.type==="share-create")sharing.captureDraft();
 if(current?.type==="value-compose")valuations.captureDraft();
 if(current?.type==="create"&&view?.type!=="create"){studio.suspend();cleanupUploaded();}
 if(!dialog.open)opener=document.activeElement;
 current=view;modalSequence++;dialog.classList.toggle("is-studio",view?.type==="create");content.innerHTML=html;
 if(!dialog.open)dialog.showModal();dialog.scrollTop=0;$(focus,dialog)?.focus({preventScroll:true});
}
function close(){
 const form=$("form",dialog);
 if(form&&busyForms.has(form)){toast("요청을 처리하고 있어요. 결과를 확인한 뒤 닫아주세요.");return;}
 if(current?.type==="share-create")sharing.captureDraft();
 if(current?.type==="value-compose")valuations.captureDraft();
 if(current?.type==="create"){studio.suspend();cleanupUploaded();}
 modalSequence++;current=null;dialog.close();dialog.classList.remove("is-studio");document.body.append($("#toast"));
 if(location.hash.startsWith("#share/"))history.replaceState(null,"",location.pathname+location.search+"#sharing");
 else if(location.hash.startsWith("#idea/")||location.hash==="#join")history.replaceState(null,"",location.pathname+location.search+"#marketplace");
 opener?.isConnected&&opener.focus({preventScroll:true});
}
function empty(title,description,action="",label=""){return '<div class="empty-state">'+icon("sprout")+"<h3>"+h(title)+"</h3><p>"+h(description)+"</p>"+(action?button(action,label,"","text-button","arrow"):"")+"</div>";}
function member(role,intent={type:"account"}){
 if(!auth?.profile){journey.remember({...intent,role:role||null});renderJoin(role);return false;}
 if(role&&auth.profile.role!==role){show(header("가입한 역할을 확인해 주세요")+'<div class="dialog-content prose"><p>현재 계정은 <strong>'+(auth.profile.role==="seller"?"판매자":"구매자")+'</strong>입니다. '+(role==="seller"?"아이디어 등록은 판매자 계정에서":"열람권과 사용권 구매는 구매자 계정에서")+' 이용할 수 있어요.</p>'+button("account","내 계정 보기","","button button-outline")+"</div>",{type:"role"});return false;}
 return true;
}
function card(idea){return ideaCard(idea,{config,account,icon,money,button,compareControl:discovery.compareControl});}
function renderHeader(){
 const profile=auth?.profile,el=$(".library-button");
 el.setAttribute("aria-label",profile?"내 계정 · "+profile.name:"회원가입 및 로그인");
 $("span",el).textContent=profile?profile.name:"회원가입 · 로그인";
 $(".beta-label").textContent=config?.paymentMode==="test"?"테스트 결제":"결제 준비중";
 let entry=$("#ops-admin-entry");
 if(auth?.isAdmin&&!entry){el.insertAdjacentHTML("afterend",button("ops-admin","운영","","button button-outline button-small","grid").replace('type="button"','type="button" id="ops-admin-entry"'));entry=$("#ops-admin-entry");}
 if(entry)entry.hidden=!auth?.isAdmin;
 const count=account?.favorites.length??0;document.querySelectorAll(".saved-count").forEach(el=>{el.hidden=!count;el.textContent=count;});
}
async function refresh(){
 account=auth?.profile?await api("/api/account"):null;
 await discovery.refresh();renderHeader();
}
function reset(){return discovery.reset();}
function devAccounts(){return config?.devMode?'<div class="dev-accounts"><p>로컬 테스트 계정 · 실제 계정이 아닙니다</p><a href="/__dev/login?account=dev-seller">판매자</a><a href="/__dev/login?account=dev-buyer-a">구매자 A</a><a href="/__dev/login?account=dev-buyer-b">구매자 B</a><a href="/__dev/login?account=dev-operator">운영자</a><a href="/__dev/login?account=dev-new">새 회원가입</a><a href="/__dev/login?account=dev-new-seller">새 판매자 가입</a><a href="/__dev/login?account=dev-new-buyer">새 구매자 가입</a></div>':"";}
function loginChoices(){
 const social=ops.socialButtons();
 const current=auth?.auth?.backend!=="better-auth"?'<a class="button button-dark full-width" id="signin-anchor" href="'+h(config.devMode?"/__dev/login?account=dev-new":auth?.signInUrl||"/signin-with-chatgpt?return_to=%2F%23join")+'" target="_top">'+(config.devMode?"테스트 계정으로 가입 계속":"ChatGPT로 로그인하고 가입 계속")+icon("arrow")+'</a>':"";
 return social+current+'<p class="form-hint">활성화된 로그인으로 인증한 뒤 역할 선택을 완료하세요. 연결 준비 중인 소셜 로그인은 아직 사용할 수 없어요.</p>';
}
function renderJoin(preferred=null){
 if(auth?.profile){renderAccount();return;}
 let saved={};try{saved=JSON.parse(sessionStorage.getItem("seed-signup-preference")||"{}");}catch{}
 const role=["seller","buyer"].includes(preferred)?preferred:(["seller","buyer"].includes(saved.role)?saved.role:"buyer");
 try{sessionStorage.setItem("seed-signup-preference",JSON.stringify({role,name:saved.name||""}));}catch{}
 const roles=[["buyer","아이디어를 찾고 있어요","구매자", "유료로 상세 내용을 열람하고, 마음에 드는 아이디어의 단독 이용권을 구매해요.","search"],["seller","아이디어를 소개하고 싶어요","판매자","구체적인 기획과 이미지를 등록하고 열람료와 단독 이용료를 각각 정해요.","light"]];
 const fields='<div class="role-picker">'+roles.map(([value,lead,title,description,symbol])=>'<label class="role-choice"><input type="radio" name="role" value="'+value+'" '+(value===role?"checked":"")+' required><span class="role-card">'+icon(symbol)+'<small>'+lead+'</small><strong>'+title+'</strong><span>'+description+'</span></span></label>').join("")+'</div><div class="field"><label for="join-name">활동 이름</label><input id="join-name" name="name" required minlength="2" maxlength="24" value="'+h(saved.name??"")+'" placeholder="2~24자의 이름이나 별명"><span class="hint">가입한 역할은 계정에 저장되며 가입 후 바꿀 수 없어요.</span></div>';
 show(header("어떤 가능성으로 시작할까요?","JOIN SEED")+'<div class="dialog-content"><p class="checkout-lead">판매자와 구매자 중 하나를 선택해 시작하세요.</p><form id="signup-form" class="idea-form">'+fields+'<p class="form-message" id="signup-error" role="alert" hidden></p>'+(auth?.authenticated?'<button class="button button-dark" type="submit">선택한 역할로 회원가입'+icon("arrow")+'</button>':loginChoices())+'</form>'+devAccounts()+'</div>',{type:"join"},"#join-name");
}
async function resume(){
 const intent=journey.take(auth?.profile?.role);
 if(!intent){renderAccount();return;}
 if(intent.type==="create")renderCreate();
 else if(intent.type==="edit")await renderEdit(intent.id);
 else if(intent.type==="checkout")await renderCheckout(intent.id,intent.kind);
 else if(intent.type==="favorite"){await favorite(intent.id);await renderDetail(intent.id);}
 else if(intent.type==="share-create")sharing.compose();
 else if(intent.type==="value-opinion")await valuations.compose(intent.id);
 else if(intent.type==="value-mine")await valuations.mine();
 else renderAccount();
}
function formError(el,error){
 if(!el)return;
 el.textContent=error.message;el.hidden=false;
 if(error.status===401)el.insertAdjacentHTML("beforeend",button("reauth","로그인하고 이어서 작성","","text-button"));
 if(error.status===429)el.insertAdjacentHTML("beforeend",button("uploads","미사용 업로드 정리","","text-button"));
}
function recoveredListing(form,saved){
 const el=$("#idea-error",form);
 el.innerHTML='이전 요청은 이미 접수됐어요. 중복 제출하지 않았습니다. 현재 작성창에서 바꾼 내용은 추가 반영되지 않았으니 확인해 주세요.<br>'+button("listing-recovered","접수된 글 확인 · 작성창 닫기",saved.id,"button button-outline");
 el.hidden=false;el.scrollIntoView({block:"nearest"});
}
async function submitSignup(form){
 const data=Object.fromEntries(new FormData(form));
 try{
  const result=await post("/api/signup",data);auth={...auth,profile:result.profile};
  try{auth=await api("/api/me");await refresh();}catch{toast("가입은 완료됐어요. 계정 목록은 잠시 후 다시 확인해 주세요.");}
  try{sessionStorage.removeItem("seed-signup-preference");}catch{}
  await resume();toast("회원가입을 완료했어요. 선택한 작업을 이어가세요.");
 }catch(error){formError($("#signup-error",form),error);}
}
async function favorite(id){
 if(!member(null,{type:"favorite",id}))return;
 const saved=account?.favorites.includes(id);
 try{await api("/api/ideas/"+id+"/bookmark",{method:saved?"DELETE":"POST"});await refresh();if(current?.type==="account")renderAccount(current.tab);else if(current?.type==="detail"){const el=$('[data-action="favorite"]',dialog);if(el){el.setAttribute("aria-pressed",String(!saved));el.innerHTML=icon("bookmark")+(saved?"찜하기":"찜했어요");}}toast(saved?"찜을 해제했어요.":"내 보관함에 담았어요.");}
 catch(error){toast(error.message);}
}
async function renderDetail(id){
 show(header("아이디어 살펴보기")+'<div class="dialog-content"><p class="prose">아이디어를 불러오는 중이에요.</p></div>',{type:"detail",id});
 const sequence=modalSequence;
 try{
  const data=await api("/api/ideas/"+id);
  const details=data.canView?(await api("/api/ideas/"+id+"/details")).details:null;
  if(current?.id!==id||sequence!==modalSequence)return;
  const idea=data.idea,sold=idea.status==="sold",saved=Boolean(account?.favorites.includes(id));
  let action,actionNote="";
  if(data.own){action=button("account","내 판매 아이디어 관리","","button button-outline full-width","file");actionNote="판매자는 자신의 상세 자료를 항상 확인할 수 있어요.";}
  else if(data.exclusive){action='<div class="owned-license">'+icon("check")+"내 단독 이용권</div>";actionNote="단독 이용권의 테스트 구매를 완료했어요.";}
  else if(sold){action='<button class="button button-dark full-width" disabled>단독 이용권 판매완료</button>';actionNote="기존 열람권 보유자도 상세 재열람이 중단됩니다.";}
  else if(data.canView){action=button("checkout-use","이 아이디어 사용하기",id,"button button-dark full-width","sprout");actionNote="추가 단독 이용료 "+money(idea.usePrice)+"원 · 사용권 구매 후 판매완료";}
  else{action=button("checkout-view","결제하고 상세 열람",id,"button button-dark full-width","lock");actionNote="열람료는 사용권을 포함하지 않아요.";}
  const plan=details?'<div class="unlocked-content"><h3>'+icon("file")+'상세 아이디어 자료</h3>'+Object.entries(briefFor(idea.category)).map(([key,labels])=>[labels[0],details[key]]).map(([title,text])=>'<section class="private-section"><h4>'+h(title)+'</h4><p class="plan-text">'+h(text)+'</p></section>').join("")+'<div class="private-images">'+details.images.map((img,i)=>'<a href="'+h(img.url)+'" target="_blank" rel="noopener"><img src="'+h(img.url)+'" alt="판매자가 등록한 상세 참고 이미지 '+(i+1)+'" loading="lazy"></a>').join("")+'</div></div>':'<div class="locked-panel">'+icon("lock")+'<h3>'+(sold?"단독 이용권이 판매된 아이디어예요.":"상세 기획은 결제 후 열려요.")+'</h3><p>'+(sold?"다른 구매자의 상세 내용과 참고 이미지 접근이 차단됐습니다.":"아이디어 종류에 맞는 상세 구성과 제작·실행 계획, 참고 이미지를 확인할 수 있어요.")+'</p></div>';
  const detailHtml=header("아이디어 살펴보기",data.own?"MY IDEA":data.exclusive?"YOUR EXCLUSIVE IDEA":"A SEED OF POSSIBILITY")+'<div class="dialog-content"><div class="detail-layout"><div><div class="detail-cover">'+cardArt(idea)+'</div><div class="detail-badges"><span class="soft-badge">'+h(config.categories[idea.category])+'</span><span class="soft-badge">'+h(config.maturities[idea.maturity])+'</span><span class="soft-badge">'+h(TOPICS[idea.topic]?.label||"")+'</span>'+(idea.sample?'<span class="soft-badge example">창작 샘플</span>':"")+(idea.classificationSource!=="seller"?'<span class="soft-badge legacy-classification">'+h(idea.classificationSource==="legacy-review"?"기존 글 · 분류 확인 필요":"기존 글 · 분류 제안")+'</span>':"")+'</div><div class="detail-domains">'+(idea.domainIds||[]).map(id=>'<span>'+h(DOMAINS[id]?.label||"")+'</span>').join("")+'</div><h3 class="detail-title">'+h(idea.title)+'</h3><p class="detail-summary">'+h(idea.summary)+'</p>'+patentDisclosureHTML(data.patentDisclosure)+'<div class="detail-section"><h3>제공 자료</h3><ul>'+data.deliverables.map(x=>"<li>"+h(x)+"</li>").join("")+'</ul></div>'+plan+ops.qualityHTML(details?.quality)+ops.detailTools(id,data)+'</div><aside><div class="price-box"><span class="price-label">1단계 · 상세 열람료</span><p class="detail-price">'+money(idea.viewPrice)+'<small>원</small></p><div class="use-price"><span>2단계 · 단독 이용료</span><strong>'+money(idea.usePrice)+'원</strong></div><p class="license">열람과 사용은 별도 결제 · 사용권은 한 명에게 판매</p>'+priceGuideHTML(idea.priceGuide||priceGuideFor(idea)) + action+'<p class="mini-note">'+h(actionNote)+'</p><button type="button" class="button button-outline full-width" data-action="favorite" data-id="'+h(id)+'" aria-pressed="'+saved+'">'+icon("bookmark")+(saved?"찜했어요":"찜하기")+'</button><p class="mini-note payment-note">'+h(config.testNotice)+'</p><div class="detail-seller"><span class="seller-avatar">'+h(idea.seller.slice(0,1))+'</span><div><p>'+h(idea.seller)+'</p><span>아이디어 판매자</span></div></div></div></aside></div></div>';
  show(detailHtml,{type:"detail",id,canView:data.canView,status:idea.status});
  history.replaceState(null,"",location.pathname+location.search+"#idea/"+encodeURIComponent(id));
 }catch(error){if(sequence===modalSequence)show(header("아이디어를 열 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("close","닫기","","button button-outline")+'</div>',{type:"error"});}
}
async function renderCheckout(id,kind){
 if(!member("buyer",{type:"checkout",id,kind}))return;
 show(header("구매 조건 확인")+'<div class="dialog-content prose"><p>현재 판매 상태를 확인하고 있어요.</p></div>',{type:"checkout-loading",id});
 const sequence=modalSequence;
 try{
  const data=await api("/api/ideas/"+id),idea=data.idea;
  if(sequence!==modalSequence)return;
  if(idea.status==="sold"||kind==="view"&&data.canView){await renderDetail(id);return;}
  if(kind==="use"&&!data.canView){await renderDetail(id);toast("상세 열람권을 먼저 구매해 주세요.");return;}
  const amount=kind==="view"?idea.viewPrice:idea.usePrice,disabled=config.paymentMode!=="test",pledge=kind==="view"?config.viewPledge:config.usePledge;
  show(header(kind==="view"?"상세 열람권 결제":"단독 이용권 추가 결제","TWO STEPS, ONE POSSIBILITY")+'<div class="dialog-content"><div class="checkout-box"><div class="notice-box">'+icon("info")+'<span>'+h(disabled?"실제 결제 서비스가 연결되지 않았습니다. 결제 계정 연결 후 이용할 수 있어요.":config.testNotice)+'</span></div><div class="checkout-product"><div class="checkout-art">'+cardArt(idea)+'</div><div><span class="category-tag">'+(kind==="view"?"상세 열람권":"단독 이용권")+'</span><h3>'+h(idea.title)+'</h3></div></div><div class="order-breakdown"><div class="order-row"><span>'+(kind==="view"?"상세 열람료":"추가 단독 이용료")+'</span><span>'+money(amount)+'원</span></div>'+'<div class="order-row"><span>열람부터 단독 이용까지 합계</span><span>'+money(idea.viewPrice+idea.usePrice)+'원</span></div>'+ (kind==="use"?'<div class="order-row"><span>이미 구매한 열람권</span><span>사용료와 별도</span></div>':"")+'<div class="order-row total"><span>테스트 실제 청구 금액</span><strong>0원</strong></div></div>'+priceGuideHTML(idea.priceGuide||priceGuideFor(idea),{kind})+patentDisclosureHTML(data.patentDisclosure)+platformNoticeHTML({compact:true})+'<form id="checkout-form" data-patent-stamp="'+h(data.patentDisclosure?.stamp||'unreported')+'" data-id="'+h(id)+'" data-kind="'+kind+'" data-key="'+journey.request(auth.profile.id,"checkout",id+":"+kind)+'" data-owner="'+h(auth.profile.id)+'"><h3 class="pledge-heading">'+(kind==="view"?"열람 목적과 거래 조건 확인":"단독 이용 조건 확인")+'</h3><div class="pledge-text">'+h(pledge)+'</div><p class="terms-version">동의 문구 '+h(config.termsVersion)+' · 법률 검토 전 초안</p><label class="checkbox-label"><input type="checkbox" name="agree" required><span>제공 자료·열람 목적·단독 이용 조건·권리와 성과의 미보증·법정 권리 보존 안내를 읽었습니다. 테스트 결제임을 확인하고 동의합니다.</span></label><p class="form-message" id="checkout-error" role="alert" hidden></p><button type="submit" class="button button-dark full-width" '+(disabled?"disabled":"")+'>'+(kind==="view"?"열람권 테스트 결제 (0원)":"단독 이용권 테스트 결제 (0원)")+icon("arrow")+'</button></form><button class="text-button full-width" type="button" data-action="detail" data-id="'+h(id)+'">'+icon("back")+'아이디어로 돌아가기</button></div></div>',{type:"checkout",id,kind});
 }catch(error){if(sequence===modalSequence){show(header("구매 조건을 확인할 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("detail","아이디어로 돌아가기",id,"button button-outline")+'</div>',{type:"error"});}}
}
async function submitCheckout(form){
 const el=$('button[type="submit"]',form);el.disabled=true;el.textContent="결제를 확인하고 있어요…";
 try{
  const result=await post("/api/ideas/"+form.dataset.id+"/checkout",{kind:form.dataset.kind,agree:form.elements.agree.checked,termsVersion:config.termsVersion,patentStamp:form.dataset.patentStamp},{"Idempotency-Key":form.dataset.key});
  journey.clear(form.dataset.owner,"checkout",form.dataset.id+":"+form.dataset.kind);
  try{await refresh();}catch{toast("구매는 완료됐어요. 계정 목록은 잠시 후 다시 확인해 주세요.");}
  const orderId=result.order?.id||account?.orders.find(o=>o.idea_id===form.dataset.id&&o.kind===form.dataset.kind&&o.effective_status==="paid")?.id;
  if(dialog.open&&current?.type==="checkout")show(header("테스트 구매를 완료했어요","YOUR NEXT STEP")+'<div class="dialog-content checkout-success">'+icon("check")+'<h3>'+(form.dataset.kind==="use"?"내 단독 이용권이 등록됐어요.":"이제 상세 자료를 볼 수 있어요.")+'</h3><p>'+(form.dataset.kind==="use"?"판매완료 처리되어 다른 구매자의 상세 접근이 종료됐어요.":"열람권은 자료 확인을 위한 권리예요.<br>사용하려면 별도 단독 이용권을 구매해 주세요.")+'</p><p class="mini-note">실제 청구 0원 · 법적 권리 이전 없는 테스트</p><div class="journey-actions">'+button("detail","상세 자료 열기",form.dataset.id)+(orderId?button("receipt","결제 · 서약 기록",orderId,"button button-outline"):button("account-orders","내 결제 내역","","button button-outline"))+'</div></div>',{type:"checkout-success",id:form.dataset.id});
 }catch(error){
  formError($("#checkout-error",form),error);
  if(error.status===409){try{await refresh();}catch{}}
  el.disabled=false;el.textContent="같은 요청으로 결과 확인 · 재시도";
 }
}
function renderCreate(){
 if(!member("seller",{type:"create"}))return;
 if(current?.type==="create")return;
 uploaded=[];studio.open();
}
async function renderEdit(id){
 if(!member("seller",{type:"edit",id}))return;
 show(header("아이디어 수정 준비")+'<div class="dialog-content prose"><p>기존 내용과 이미지를 불러오고 있어요.</p></div>',{type:"edit-loading",id});const sequence=modalSequence;
 try{const editing=await api("/api/ideas/"+id+"/edit");if(sequence===modalSequence){uploaded=[];studio.open(editing);}}
 catch(error){if(sequence===modalSequence)show(header("현재 수정할 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("detail","아이디어 확인",id,"button button-outline")+'</div>',{type:"error"});}
}
async function renderUploads(){
 if(!member("seller"))return;
 show(header("미사용 업로드 관리")+'<div class="dialog-content prose"><p>임시 이미지를 불러오는 중이에요.</p></div>',{type:"uploads-loading"});const sequence=modalSequence;
 try{const data=await api("/api/uploads");if(sequence===modalSequence)show(header("미사용 업로드 관리","SELLER STORAGE")+temporaryUploadsHTML(data,{button,money}),{type:"uploads"});}
 catch(error){if(sequence===modalSequence)show(header("업로드 목록을 확인할 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p></div>',{type:"error"});}
}
async function uploadFile(file,kind){
 if(file.retained)return file.id;
 if(file.size>5*1024*1024)throw new Error("이미지는 파일당 5MB 이하여야 해요.");
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("PNG, JPG, WebP 이미지만 올릴 수 있어요.");
 const existing=uploaded.find(x=>x.file===file&&x.kind===kind);if(existing)return existing.id;
 const data=await api("/api/uploads?kind="+kind,{method:"POST",body:file,headers:{"Content-Type":file.type}});
 uploaded.push({file,kind,id:data.id});return data.id;
}
async function submitIdea(form){
 const owner=auth?.profile?.id;if(!owner){formError($("#idea-error",form),Object.assign(new Error("로그인 후 작성 중인 아이디어를 이어서 제출해 주세요."),{status:401}));return;}
 const resource=form.dataset.editId?form.dataset.editId+":"+form.dataset.expectedVersion:"new";
 const submit=$('button[type="submit"]',form),controls=[...form.querySelectorAll("input,textarea,select,button")].map(el=>[el,el.disabled]);
 try{
  const fd=new FormData(form),{privateImages:images,covers}=studio.getFiles();
  if(images.length<1||images.length>5)throw new Error("상세 이미지를 1~5개 첨부해 주세요.");
  if(!form.elements.ownership.checked)throw new Error("판매 권한과 공개 범위를 확인해 주세요.");
  for(const [el] of controls)el.disabled=true;
  form.setAttribute("aria-busy","true");
  const previousKey=journey.peek(owner,"listing",resource);
  if(previousKey){try{const saved=await api("/api/listing-requests/"+previousKey);recoveredListing(form,saved);return;}catch(error){if(error.status!==404)throw error;}}
  const requestKey=journey.request(owner,"listing",resource);
  for(const item of uploaded.filter(x=>!images.includes(x.file)&&!covers.includes(x.file))){await api("/api/uploads/"+item.id,{method:"DELETE"});uploaded=uploaded.filter(x=>x!==item);}
  const imageIds=[];
  for(const [index,file] of images.entries()){submit.textContent="상세 이미지 업로드 "+(index+1)+"/"+images.length;imageIds.push(await uploadFile(file,"private"));}
  const coverId=covers[0]?await uploadFile(covers[0],"public"):null;
  submit.textContent="검토 요청을 보내고 있어요…";
  const input=Object.fromEntries(fd);
  const result=await post(form.dataset.editId?"/api/ideas/"+form.dataset.editId+"/revise":"/api/ideas",{...(form.dataset.editId?{expectedVersion:Number(form.dataset.expectedVersion)}:{}),title:input.title,summary:input.summary,category:input.category,topic:input.topic,domainIds:fd.getAll("domainIds"),maturity:input.maturity,viewPrice:Number(input.viewPrice),usePrice:Number(input.usePrice),problem:input.problem,solution:input.solution,audience:input.audience,execution:input.execution,deliverables:input.deliverables.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),tags:input.tags.split(",").map(x=>x.trim()).filter(Boolean),imageIds,coverId,originality:input.originality,validationNote:input.validationNote,risks:input.risks,patent:patentFromValues(input,form.elements.patentAcknowledged.checked),sellerAgreement:form.elements.sellerAgreement.checked,sellerTermsVersion:form.dataset.sellerTermsVersion,feeQuote:JSON.parse(form.dataset.feeQuote)},{"Idempotency-Key":requestKey});
  await finishListing(result,owner,resource);
 }catch(error){
  if(error.status===409&&error.message.includes("같은 요청 번호")){try{const key=journey.peek(owner,"listing",resource);if(key){recoveredListing(form,await api("/api/listing-requests/"+key));return;}}catch{}}
  if(!form.dataset.editId&&error.status===409&&error.message.includes("수수료")){try{config=await api("/api/config");ops.refreshListingPolicy(form);studio.update();error.message="수수료 정책이 변경됐어요. 작성 내용은 유지했으니 새 조건을 확인하고 다시 동의해 주세요.";}catch{}}
  const el=$("#idea-error");if(el){formError(el,error);el.scrollIntoView({block:"nearest"});}else toast(error.message);
  submit.textContent="다시 확인하고 검토 요청";
 }finally{for(const [el,disabled] of controls)el.disabled=disabled;form.removeAttribute("aria-busy");if(form.isConnected)studio.update();}
}
async function finishListing(result,owner,resource){
 journey.clear(owner,"listing",resource);uploaded=[];studio.markSubmitted();
 try{await refresh();}catch{toast("검토 요청은 접수됐어요. 목록은 잠시 후 다시 확인해 주세요.");}
 if(current?.type==="create"){await renderDetail(result.id);toast("검토 요청을 접수했어요. 승인 후 목록에 공개됩니다.");}
}
function accountRow(idea){
 const access=account?.access?.[idea.id],seller=auth.profile.role==="seller";
 return '<article class="library-row"><button type="button" class="row-art" data-action="'+(access&&!access.canView?"receipt":"detail")+'" data-id="'+h(access&&!access.canView?access.orderId:idea.id)+'" aria-label="'+h(idea.title)+' 확인">'+cardArt(idea)+'</button><div class="row-info"><span class="category-tag">'+h(config.categories[idea.category])+'</span><h3>'+h(idea.title)+'</h3><p class="row-meta">열람 '+money(idea.viewPrice)+'원 · 사용 '+money(idea.usePrice)+'원 · '+(idea.reviewStatus&&idea.reviewStatus!=="approved"?({pending:"검토 대기",rejected:"반려",suspended:"게시 중단"}[idea.reviewStatus]||"검토 중"):(idea.status==="sold"?"판매완료":"판매중"))+'</p>'+(!seller?accessHTML(access):idea.reviewReason?'<p class="mini-note">'+h(idea.reviewReason)+'</p>':"")+'</div><div class="account-row-actions">'+(access&&!access.canView?button("receipt","권한 · 거래 확인",access.orderId,"text-button"):button("detail","살펴보기",idea.id,"text-button","arrow"))+(seller&&idea.canEdit?button("edit","수정 · 재검토",idea.id,"text-button","pen"):"")+'</div></article>';
}
function renderAccount(tab){
 if(!member())return;
 const seller=auth.profile.role==="seller";
 tab=tab||(seller?"selling":"viewed");
 const tabs=seller?[["selling","내 아이디어"],["favorites","찜한 아이디어"]]:[["viewed","열람한 아이디어"],["licensed","내 사용권"],["favorites","찜"],["orders","결제 내역"]];
 if(!tabs.some(x=>x[0]===tab))tab=tabs[0][0];
 const ids=account?.[tab]||[];
 const historyIdeas=[...new Map([...ideas,...(account?.purchasedIdeas||[]),...(account?.bookmarkedIdeas||[])].map(x=>[x.id,x])).values()];
 const selected=tab==="selling"?(account?.selling||[]):historyIdeas.filter(x=>ids.includes(x.id));
 const orders=account?.orders||[];
 const rows=tab==="orders"?(orders.length?orders.map(order=>'<article class="receipt-row"><div><strong>'+(order.kind==="view"?"상세 열람권":"단독 이용권")+'</strong><p>'+h(order.title||ideas.find(x=>x.id===order.idea_id)?.title||order.idea_id)+'</p><span>'+h(new Date(order.created_at).toLocaleString("ko-KR"))+'</span></div><div><strong>'+(order.effective_status==="refunded"?"테스트 환불 완료":"실제 청구 0원")+'</strong><p>테스트 가격 '+money(order.amount)+'원</p>'+button("receipt","권한 · 결제 기록",order.id,"text-button")+button("ops-order-case","문의하기",order.id,"text-button")+'</div></article>').join(""):empty("아직 결제 내역이 없어요.","마음에 드는 아이디어를 찾아보세요.")):(selected.length?selected.map(accountRow).join(""):empty(tab==="selling"?"첫 아이디어를 등록해 보세요.":"아직 모아둔 아이디어가 없어요.",tab==="selling"?"기획과 참고 이미지를 준비하고 두 가지 가격을 정해 주세요.":"아이디어를 둘러보고 찜하거나 열람권을 구매해 보세요.",tab==="selling"?"create":"browse",tab==="selling"?"아이디어 등록":"아이디어 둘러보기"));
 show(header(auth.profile.name+"님의 공간",seller?"SELLER STUDIO":"BUYER LIBRARY")+'<div class="dialog-content"><div class="account-topline"><span class="soft-badge">'+(seller?"판매자":"구매자")+' 계정</span>'+(auth?.auth?.backend==="better-auth"?button("ops-logout","로그아웃","","text-button"):'<a href="'+h(config.devMode?"/__dev/logout":auth.signOutUrl)+'" target="_top">로그아웃</a>')+'</div><div class="notice-box">'+icon("info")+'<span>'+(seller?"요약과 공개 커버만 무료로 보입니다. 단독 이용권이 구매되면 자동으로 판매완료 처리됩니다.":"열람권은 사용권과 별개입니다. 다른 구매자가 단독 이용권을 얻으면 이전에 결제한 상세 자료도 다시 볼 수 없습니다.")+'</span></div>'+ops.nav()+'<div class="library-tabs" role="tablist" aria-label="내 계정 메뉴">'+tabs.map(([key,label])=>'<button type="button" class="library-tab '+(key===tab?"active":"")+'" id="account-tab-'+key+'" role="tab" aria-controls="account-panel" aria-selected="'+(key===tab)+'" tabindex="'+(key===tab?"0":"-1")+'" data-action="account-tab" data-tab="'+key+'">'+label+'</button>').join("")+'</div><div id="account-panel" role="tabpanel" aria-labelledby="account-tab-'+tab+'">'+rows+'</div>'+devAccounts()+'</div>',{type:"account",tab});
}
async function renderReceipt(id){
 if(!member("buyer"))return;
 show(header("결제와 권한 확인")+'<div class="dialog-content prose"><p>거래 기록을 불러오고 있어요.</p></div>',{type:"receipt-loading",id});const sequence=modalSequence;
 try{const data=await api("/api/orders/"+id);if(sequence===modalSequence)show(header("결제와 현재 권한","TEST RECEIPT")+receiptHTML(data,{button,money}),{type:"receipt",id,accessState:data.access?.state,effectiveStatus:data.order.effective_status});}
 catch(error){if(sequence===modalSequence)show(header("거래 기록을 확인할 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("account-orders","결제 내역으로","","button button-outline")+'</div>',{type:"error"});}
}
function renderInfo(type){
 if(["notice","terms"].includes(type)){show(header("공지 · 아이디어 거래 원칙","IDEA COMMONS")+'<div class="dialog-content">'+platformNoticeHTML()+'</div>',{type:"info"});return;}
 const pages={
  about:["seed 소개","묻혀 있던 생각과 실행할 사람을 연결해요.","누구나 일상에서 떠오른 생각을 정리해 나누고, 창업자와 기업은 요약을 읽은 뒤 열람료를 내고 구체적인 설명·기획·참고 자료를 살펴봅니다. 아이디어의 방향을 발견하는 공유소이며 특허나 사업 성공을 보증하는 서비스는 아닙니다.","수익 모델","열람권과 단독 이용권 거래에서 정해진 수수료를 계산합니다. 등록 시 수수료와 대기 기간을 합의하고 거래별로 기록해요. 실제 결제와 송금은 연결 전이며 현재는 테스트 원장입니다."],
  privacy:["개인정보와 자료 안내","서버에 저장되는 정보","가입 역할과 활동 이름, 아이디어와 이미지, 주문과 정산, 찜, 서약 동의, 문의와 처리 내역을 서버에 저장합니다. 나눔 글에 남긴 금액·완성도·사유와 수정·철회·운영 검토 기록도 저장합니다. 현재 호스팅은 ChatGPT 인증을 사용하며, 독립 인증 모드에는 소셜·이메일 로그인을 준비했습니다. 카드 정보는 보관하지 않습니다. 판매 등록에서 기기 임시저장을 선택하면 작성 중인 글을 이 브라우저에 저장합니다. 이미지와 계약 동의는 저장하지 않으며 저장본을 삭제할 수 있습니다. 가입 이어가기와 재시도를 위해 세션에는 작업 종류·식별자·요청 번호만 보관합니다.","상세 자료의 공개 범위","상세 기획과 비공개 이미지는 판매자, 열람권을 가진 구매자, 판매완료 후 단독 구매자에게만 서버에서 제공합니다. 이미 열람한 사람이 기억하거나 별도로 저장한 정보를 기술적으로 회수할 수는 없습니다. 승인된 나눔 본문은 무료로 공개되며, 가격 의견은 이름과 계정 ID를 표시하지 않고 금액·완성도·사유를 공개합니다. 모인 정보는 향후 권장 가격 기준을 검토하는 통계에 사용하며 의견을 철회하면 공개·집계에서 제외합니다. 글꼴을 위해 Google Fonts에 접속할 수 있습니다."]
 };
 const [title,h1,p1,h2,p2]=pages[type];
 show(header(title,"ABOUT SEED")+'<div class="dialog-content prose"><h3>'+h(h1)+'</h3><p>'+h(p1)+'</p><h3>'+h(h2)+'</h3><p>'+h(p2)+'</p><div class="notice-box" style="margin-top:20px">'+icon("info")+'<span>'+h(config?.testNotice||"결제 서비스 준비중")+'</span></div></div>',{type:"info"});
}
const ops=createOperationsUI({api,post,show,header,button,icon,h,money,toast,member,getAuth:()=>auth,getConfig:()=>config,getCurrent:()=>current,refresh,refreshConfig:async()=>{config=await api("/api/config");await refresh();}});
const studio=createSellerStudio({show,header,icon,money,toast,getConfig:()=>config,getAuth:()=>auth});
const discovery=createDiscoveryUI({api,icon,money,toast,card,header,show,close,getCurrent:()=>current,onResults:items=>{ideas=[...new Map([...ideas,...items].map(idea=>[idea.id,idea])).values()].slice(-1200);}});
const sharing=createSharingUI({api,post,show,close,header,button,toast,member,journey,getAuth:()=>auth,getCurrent:()=>current});
const valuations=createValuationsUI({api,post,show,header,button,toast,member,getAuth:()=>auth,getCurrent:()=>current});
document.addEventListener("click",async event=>{
 const el=event.target.closest("[data-action]");if(!el)return;
 const {action,id}=el.dataset;
 if(el.tagName==="A")event.preventDefault();
 if(!["close","notice"].includes(action)&&(!config||!auth)){toast("서버 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.");return;}
 try{
 const activeForm=$("form",dialog);if(activeForm&&busyForms.has(activeForm)&&action!=="close"){toast("요청을 처리하고 있어요. 결과를 확인한 뒤 이동해 주세요.");return;}
 if(ops.handles(action)){await ops.action(action,id,el);return;}
 if(sharing.handles(action)){await sharing.action(action,id,el);return;}
 if(valuations.handles(action)){await valuations.action(action,id,el);return;}
 if(action==="close")close();
 else if(action==="create")renderCreate();
 else if(action==="edit")await renderEdit(id);
 else if(action==="listing-recovered"){const form=$("#idea-form");if(form){const resource=form.dataset.editId?form.dataset.editId+":"+form.dataset.expectedVersion:"new";await finishListing({id},auth.profile.id,resource);}}
 else if(action==="uploads")await renderUploads();
 else if(action==="upload-delete"){el.disabled=true;try{await api("/api/uploads/"+id,{method:"DELETE"});await renderUploads();toast("미사용 이미지를 삭제했어요.");}finally{if(el.isConnected)el.disabled=false;}}
 else if(action==="account-orders"){await refresh();renderAccount("orders");}
 else if(action==="reauth"){const role=current?.type==="create"?"seller":"buyer";journey.remember(current?.type==="create"?(current.editId?{type:"edit",id:current.editId,role}:{type:"create",role}):{type:"checkout",id:current?.id,kind:current?.kind,role});renderJoin(role);}
 else if(action==="library"||action==="account"){if(auth?.profile){await refresh();renderAccount();}else renderJoin();}
 else if(action==="account-tab"){renderAccount(el.dataset.tab);$("#account-tab-"+el.dataset.tab)?.focus();}
 else if(action==="detail")await renderDetail(id);
 else if(action==="favorite")await favorite(id);
 else if(action==="checkout-view")await renderCheckout(id,"view");
 else if(action==="checkout-use")await renderCheckout(id,"use");
 else if(action==="receipt")await renderReceipt(id);
 else if(action==="reset")reset();
 else if(action==="browse"){close();$("#marketplace").scrollIntoView({behavior:"smooth"});}
 else if(["about","terms","privacy","notice"].includes(action))renderInfo(action);
 }catch(error){toast(error.message);}
});
document.addEventListener("submit",async event=>{
 const form=event.target;
 if(!["signup-form","checkout-form","idea-form"].includes(form.id)&&!ops.hasForm(form.id)&&!sharing.hasForm(form.id)&&!valuations.hasForm(form.id))return;
 event.preventDefault();if(busyForms.has(form))return;busyForms.add(form);
 try{if(form.id==="signup-form")await submitSignup(form);else if(form.id==="checkout-form")await submitCheckout(form);else if(form.id==="idea-form"){if(studio.beforeSubmit(form))await submitIdea(form);}else if(sharing.hasForm(form.id))await sharing.submit(form);else if(valuations.hasForm(form.id))await valuations.submit(form);else await ops.submitForm(form);}finally{busyForms.delete(form);}
});
document.addEventListener("input",event=>{
 if(event.target.closest("#signup-form")){try{const fd=new FormData($("#signup-form"));sessionStorage.setItem("seed-signup-preference",JSON.stringify({role:fd.get("role"),name:fd.get("name")}));}catch{}}
});
$("#menu-toggle").addEventListener("click",()=>{const expanded=$("#menu-toggle").getAttribute("aria-expanded")!=="true";$("#menu-toggle").setAttribute("aria-expanded",String(expanded));$("#mobile-nav").hidden=!expanded;});
$("#mobile-nav").addEventListener("click",()=>{$("#menu-toggle").setAttribute("aria-expanded","false");$("#mobile-nav").hidden=true;});
dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
dialog.addEventListener("click",event=>{if(event.target===dialog)close();});
document.addEventListener("keydown",event=>{
 if(event.key==="/"&&!dialog.open&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){event.preventDefault();$("#search-input").focus();$("#search-input").scrollIntoView({block:"center"});}
 if(event.target.matches?.(".library-tab")&&["ArrowRight","ArrowLeft","Home","End"].includes(event.key)){
  event.preventDefault();const tabs=Array.from(document.querySelectorAll(".library-tab")),at=tabs.indexOf(event.target),index=event.key==="Home"?0:event.key==="End"?tabs.length-1:(at+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
  const tab=tabs[index].dataset.tab;renderAccount(tab);$("#account-tab-"+tab).focus();
 }
});
async function readHash(){const form=$("form",dialog);if(form&&busyForms.has(form))return;if(location.hash==="#reset-password"){ops.resetPassword();}else if(location.hash==="#join"){if(auth?.profile){await resume();return;}let preferred="buyer";try{preferred=JSON.parse(sessionStorage.getItem("seed-signup-preference")||"{}").role||preferred;}catch{}renderJoin(preferred);}else if(location.hash.startsWith("#share/")){try{await sharing.open(decodeURIComponent(location.hash.slice(7)));}catch(error){toast(error.message);}}else if(location.hash==="#sharing"){await sharing.refresh({nextMode:"public"});}else if(location.hash.startsWith("#idea/")){try{await renderDetail(decodeURIComponent(location.hash.slice(6)));}catch{toast("아이디어 주소를 확인해 주세요.");}}}
window.addEventListener("hashchange",()=>{if(config)readHash();});
let polling=false;
async function recheck(){
 if(!config||document.hidden||polling)return;polling=true;
 try{
  if(current?.type==="detail"){
   const id=current.id;
   try{
    const data=await api("/api/ideas/"+id);
    if(current?.type!=="detail"||current.id!==id)return;
    if(current.canView!==data.canView||current.status!==data.idea.status){
     const revoked=current.canView&&!data.canView;await renderDetail(id);
     if(revoked)toast("거래 또는 검토 상태가 변경되어 상세 접근이 종료됐어요.");
    }
   }catch(error){if([403,404].includes(error.status)&&current?.type==="detail"&&current.id===id){await renderDetail(id);toast("게시 상태가 변경됐어요. 자료의 현재 공개 상태를 확인해 주세요.");}}
  }
  if(current?.type==="account"&&auth?.profile){
   const sequence=modalSequence,tab=current.tab,previous=JSON.stringify(account),next=await api("/api/account");
   if(sequence===modalSequence&&JSON.stringify(next)!==previous){
    const active=document.activeElement,focusId=active?.id,action=active?.dataset?.action,id=active?.dataset?.id,scroll=dialog.scrollTop;
    account=next;renderAccount(tab);dialog.scrollTop=scroll;
    const target=focusId?document.getElementById(focusId):[...content.querySelectorAll("[data-action]")].find(el=>el.dataset.action===action&&el.dataset.id===id);
    target?.focus({preventScroll:true});
   }
  }
  if(current?.type==="receipt"){
   const sequence=modalSequence,data=await api("/api/orders/"+current.id);
   if(sequence===modalSequence&&(data.access?.state!==current.accessState||data.order.effective_status!==current.effectiveStatus)){await renderReceipt(current.id);toast("거래 상태가 변경됐어요. 현재 권한과 처리 기록을 갱신했어요.");}
  }
  if(!dialog.open)await discovery.refresh({silent:true});
 }catch{}finally{polling=false;}
}
setInterval(recheck,15000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)recheck();});
window.addEventListener("focus",recheck);
async function initialize(){
 try{
  [config,auth]=await Promise.all([api("/api/config"),api("/api/me")]);await refresh();sharing.init();await readHash();
 }catch(error){$("#idea-grid").innerHTML=empty("서비스 연결을 확인해 주세요.",error.message);$("#results-count").textContent="연결 준비중";$("#catalog-pagination").innerHTML="";$(".beta-label").textContent="연결 준비중";}
}
initialize();

const publicNotice=document.querySelector("#platform-notice-content");if(publicNotice)publicNotice.innerHTML=platformNoticeHTML();
