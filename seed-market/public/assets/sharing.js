import {CATALOG,TOPICS,groupedKindOptions} from "./catalog.js";
import {escapeHtml as h} from "./format.js";
import {SHARE_LICENSES,SHARE_TERMS_VERSION} from "./sharing-policy.js";
import {valueEntryHTML} from "./valuations.js";

const states={pending:"검토 대기",published:"무료 공개",rejected:"보완 요청",hidden:"숨김"};
export function shareCardsHTML(shares,{button,mode="public"}){
  return shares.map(item=>'<article class="share-card"><div class="share-card-top"><span class="category-tag">'+h(CATALOG[item.category]?.label||"")+'</span><span class="soft-badge">'+h(states[item.status]||"무료 공개")+'</span></div><h3>'+button("share-open",item.title,item.id,"title-button")+'</h3><p>'+h(item.summary)+'</p><div class="share-license">'+h(SHARE_LICENSES[item.license]?.label||"이용 조건 확인")+'</div><div class="share-card-bottom"><span>'+h(item.author)+'</span>'+button(mode==="admin"&&item.status!=="hidden"?"share-review":"share-open",mode==="admin"&&item.status!=="hidden"?"검토하기":"읽어보기",item.id,"text-button")+'</div>'+(mode!=="public"&&item.reviewReason?'<p class="share-review-reason">검토 사유: '+h(item.reviewReason)+'</p>':"")+'</article>').join("");
}
export function shareFormHTML({header,button,editing=null,draft=null}){
  const item=editing||draft||{},license=item.license||"discussion";
  return header(editing?"나눔 글 수정 · 재검토":"작은 생각을 나눠주세요","IDEA COMMONS")+'<div class="dialog-content"><p class="prose">판매자·구매자 모두 무료로 등록할 수 있어요. 검토 후 본문 전체가 공개되니 공개할 수 있는 내용만 작성하세요.</p><form id="share-form" class="idea-form" data-id="'+h(editing?.id||"")+'" data-version="'+h(editing?.version||"")+'"><div class="field"><label for="share-title">제목 *</label><input id="share-title" name="title" required minlength="6" maxlength="80" value="'+h(item.title||"")+'"></div><div class="form-row"><div class="field"><label for="share-category">아이디어 종류 *</label><select id="share-category" name="category" required>'+groupedKindOptions()+'</select></div><div class="field"><label for="share-topic">세부 유형 *</label><select id="share-topic" name="topic" required><option value="">종류를 먼저 선택하세요</option></select></div></div><div class="field"><label for="share-summary">공개 요약 *</label><textarea id="share-summary" name="summary" required minlength="30" maxlength="300">'+h(item.summary||"")+'</textarea></div><div class="field"><label for="share-body">나눌 아이디어 *</label><textarea class="large" id="share-body" name="body" required minlength="80" maxlength="12000" placeholder="어떤 생각인가요? 활용 방법과 더 발전시키고 싶은 점도 적어주세요.">'+h(item.body||"")+'</textarea><span class="hint">80~12,000자 · 본문 전체가 무료로 공개됩니다.</span></div><fieldset class="share-license-picker"><legend>무료 열람 이후의 이용 조건 *</legend>'+Object.entries(SHARE_LICENSES).map(([id,data])=>'<label class="checkbox-label"><input type="radio" name="license" value="'+id+'" '+(license===id?"checked":"")+' required><span><strong>'+h(data.label)+'</strong><small>'+h(data.text)+'</small></span></label>').join("")+'</fieldset><label class="checkbox-label"><input type="checkbox" name="agree" required><span>직접 작성했거나 공개·이용 허락 권한이 있는 자료입니다. 전체 무료 공개와 선택한 이용 조건을 확인했습니다.</span></label><p class="mini-note">출처 표시 후 활용을 허용한 자료는 숨김 처리해도 이미 허용된 이용이 자동 취소되지 않아요. 수정 가능한 글은 검토 대기·보완 요청 상태의 글입니다.</p><p id="share-error" class="form-message" role="alert" hidden></p><div class="form-footer"><span>금액 입력·결제 없이<br>운영 검토 후 공개돼요.</span><button class="button button-dark" type="submit">'+(editing?"수정하고 재검토 요청":"무료 나눔 검토 요청")+'</button></div></form></div>';
}
export function createSharingUI(ctx){
  const {api,post,show,header,button,toast,member,journey}=ctx,$=(s,root=document)=>root.querySelector(s);
  let mode="public",page=1,listSequence=0,viewSequence=0,ready=false,drafts=new Map();
  async function load(id,type,title){
    const marker=++viewSequence;show(header(title)+'<div class="dialog-content prose"><p>글을 불러오고 있어요.</p></div>',{type,id,marker});
    try{const data=await api("/api/shares/"+id);return ctx.getCurrent()?.marker===marker?data:null;}
    catch(error){if(ctx.getCurrent()?.marker===marker)show(header("나눔 글을 확인할 수 없어요")+'<div class="dialog-content prose"><p>'+h(error.message)+'</p>'+button("share-back","나눔터로 돌아가기")+'</div>',{type:"share-error"});return null;}
  }
  function topics(form,selected=""){
    const category=form.elements.category.value;
    form.elements.topic.innerHTML='<option value="">세부 유형 선택</option>'+(CATALOG[category]?.topics||[]).map(([id,label])=>'<option value="'+id+'">'+h(label)+'</option>').join("");
    form.elements.topic.disabled=!category;form.elements.topic.value=TOPICS[selected]?.category===category?selected:"";
  }
  function captureDraft(){
    const form=$("#share-form");if(form&&ctx.getAuth()?.profile?.id===form.dataset.owner){const data=Object.fromEntries(new FormData(form));drafts.set(form.dataset.owner+":"+form.dataset.id,{title:data.title,summary:data.summary,body:data.body,category:data.category,topic:data.topic,license:data.license,version:Number(form.dataset.version)||null});}
  }
  function compose(editing=null){
    if(!member(null,{type:"share-create"}))return;
    const owner=ctx.getAuth().profile.id,saved=drafts.get(owner+":"+(editing?.id||"")),draft=!editing||saved?.version===editing.version?saved:null;
    show(shareFormHTML({header,button,editing,draft}),{type:"share-create",id:editing?.id||null},"#share-title");
    const form=$("#share-form"),item=editing||draft||{};form.dataset.owner=owner;
    if(editing&&draft)for(const name of ["title","summary","body"])form.elements[name].value=draft[name]||editing[name];
    form.elements.category.value=(draft||item).category||"";topics(form,(draft||item).topic||"");
    if(draft?.license)form.elements.license.value=draft.license;
  }
  async function refresh({nextMode=mode,nextPage=1}={}){
    if(!ready)return;
    if(nextMode==="mine"&&!member())return;
    if(nextMode==="admin"&&!ctx.getAuth()?.isAdmin)return;
    mode=nextMode;page=nextPage;const sequence=++listSequence,owner=ctx.getAuth()?.profile?.id;
    const grid=$("#sharing-grid");grid.setAttribute("aria-busy","true");
    $("#sharing-count").textContent="나눔 글을 불러오고 있어요…";
    try{
      const filters=new FormData($("#sharing-search")),query=new URLSearchParams({category:filters.get("category"),q:filters.get("q"),page:String(page)});
      const data=await api(mode==="public"?"/api/shares?"+query:mode==="mine"?"/api/shares/mine":"/api/admin/shares");
      if(sequence!==listSequence||owner!==ctx.getAuth()?.profile?.id)return;
      grid.innerHTML=data.shares.length?shareCardsHTML(data.shares,{button,mode}):'<div class="empty-state"><h3>'+(mode==="public"?"첫 번째 생각을 기다리고 있어요.":"표시할 나눔 글이 없어요.")+'</h3><p>'+(mode==="public"?"검색 조건을 바꾸거나 새로운 아이디어를 나눠보세요.":"새 생각을 적거나 무료 공개된 글을 살펴보세요.")+'</p></div>';
      $("#sharing-count").textContent=(mode==="public"?"공개된 나눔":mode==="mine"?"내 나눔 글":"나눔 글 검토")+" · "+(data.total??data.shares.length)+"개";
      $("#sharing-pagination").innerHTML=mode==="public"&&data.pages>1?(data.page>1?button("share-page","이전",String(data.page-1),"button button-outline button-small"):"")+'<span>'+data.page+' / '+data.pages+'</span>'+(data.page<data.pages?button("share-page","다음",String(data.page+1),"button button-outline button-small"):""):"";
      for(const el of document.querySelectorAll("[data-share-mode]"))el.setAttribute("aria-pressed",String(el.dataset.shareMode===mode));
      $("#sharing-search").hidden=mode!=="public";
    }catch(error){if(sequence===listSequence){$("#sharing-count").textContent="나눔 글을 불러오지 못했어요.";grid.innerHTML='<p class="empty-state">'+h(error.message)+'</p>';$("#sharing-pagination").innerHTML="";}}
    finally{if(sequence===listSequence)grid.setAttribute("aria-busy","false");}
  }
  async function open(id){
    const data=await load(id,"share-loading","나눔 아이디어");if(!data)return;
    const item=data.share;
    show(header(item.title,"IDEA COMMONS")+'<div class="dialog-content"><div class="detail-badges"><span class="soft-badge">무료 열람</span><span class="soft-badge">'+h(CATALOG[item.category]?.label||"")+'</span><span class="soft-badge">'+h(TOPICS[item.topic]?.label||"")+'</span></div><p class="mini-note">'+h(item.author)+' · '+h(new Date(item.createdAt).toLocaleDateString("ko-KR"))+(item.status?' · '+h(states[item.status]):"")+'</p><p class="share-detail-summary">'+h(item.summary)+'</p><div class="share-body">'+h(item.body)+'</div><section class="share-usage"><h3>'+h(SHARE_LICENSES[item.license]?.label||"이용 조건")+'</h3><p>'+h(item.licenseText)+'</p><small>'+h(item.termsVersion)+'</small></section>'+valueEntryHTML(id,{own:data.own,published:!item.status||item.status==='published',operator:data.canModerate})+(data.own&&item.reviewReason?'<p class="share-review-reason">검토 사유: '+h(item.reviewReason)+'</p>':"")+'<div class="journey-actions">'+(data.own&&["pending","rejected"].includes(item.status)?button("share-edit","수정 · 재검토",id,"button button-outline"):"")+(data.own&&item.status!=="hidden"?button("share-hide","내 글 숨기기",id,"text-button"):"")+(data.canModerate&&item.status!=="hidden"?button("share-review","운영 검토",id,"button button-outline"):"")+button("share-back","나눔터로","","text-button")+'</div></div>',{type:"share",id});
    history.replaceState(null,"",location.pathname+location.search+"#share/"+encodeURIComponent(id));
  }
  async function review(id){
    if(!ctx.getAuth()?.isAdmin)return;
    const data=await load(id,"share-review-loading","나눔 글 검토");if(!data)return;const item=data.share;
    show(header("나눔 글 검토")+'<div class="dialog-content"><h3>'+h(item.title)+'</h3><p>'+h(item.summary)+'</p><div class="share-body">'+h(item.body)+'</div><section class="share-usage"><strong>선택한 이용 조건</strong><p>'+h(item.licenseText)+'</p></section><p class="mini-note">전체 무료 공개에 적합한 내용과 작성·이용 허락 권한을 확인하세요.</p><form class="idea-form" id="share-review-form" data-id="'+h(id)+'" data-version="'+item.version+'" data-status="'+h(item.status)+'"><div class="field"><label for="share-review-status">처리 결과</label><select id="share-review-status" name="status" required><option value="published">무료 공개 승인</option><option value="rejected">보완 요청</option><option value="hidden">공개 중단</option></select></div><div class="field"><label for="share-review-reason">검토 사유 · 작성자에게 표시</label><textarea id="share-review-reason" name="reason" required minlength="10" maxlength="1000"></textarea></div><p id="share-error" class="form-message" role="alert" hidden></p><button class="button button-dark" type="submit">검토 결과 저장</button></form></div>',{type:"share-review",id});
  }
  async function action(action,id){
    if(action==="share-new")compose();
    else if(action==="share-open")await open(id);
    else if(action==="share-edit"){const data=await load(id,"share-edit-loading","나눔 글 수정 준비");if(!data)return;if(!data.own||!["pending","rejected"].includes(data.share.status)){toast("현재 수정할 수 없는 글이에요.");await open(id);return;}compose(data.share);}
    else if(action==="share-review")await review(id);
    else if(action==="share-page")await refresh({nextPage:Number(id)});
    else if(action==="share-hide"){
      const data=await load(id,"share-hide-loading","내 나눔 글 확인");if(!data||!data.own)return;
      show(header("내 나눔 글 숨기기")+'<div class="dialog-content"><p class="prose">숨기면 공개 목록과 원문에서 내용을 볼 수 없어요. 이미 허용한 비독점 활용은 소급 취소되지 않습니다.</p><form id="share-hide-form" data-id="'+h(id)+'" data-version="'+data.share.version+'"><p id="share-error" class="form-message" role="alert" hidden></p><button class="button button-dark" type="submit">확인하고 숨기기</button></form></div>',{type:"share-hide",id});
    }else if(["share-public","share-mine","share-admin","share-back"].includes(action)){
      if(action==="share-mine"&&!member())return;
      if(ctx.getCurrent()?.type?.startsWith("share"))ctx.close();
      history.replaceState(null,"",location.pathname+location.search+"#sharing");
      await refresh({nextMode:action==="share-admin"?"admin":action==="share-mine"?"mine":"public"});$("#sharing-heading").focus({preventScroll:true});$("#sharing").scrollIntoView({behavior:"smooth"});
    }
  }
  async function submit(form){
    const fd=new FormData(form),owner=ctx.getAuth()?.profile?.id,submit=form.querySelector('button[type="submit"]');
    if(!owner&&!ctx.getAuth()?.isAdmin){toast("로그인 후 다시 확인해 주세요.");return;}
    const original=submit.textContent;submit.disabled=true;submit.textContent="접수 결과를 확인하고 있어요…";
    try{
      if(form.id==="share-form"){
        if(owner!==form.dataset.owner)throw new Error("작성 계정이 바뀌었어요. 글을 다시 열어주세요.");
        const data={...Object.fromEntries(fd),agree:fd.get("agree")==="on",termsVersion:SHARE_TERMS_VERSION};
        const previous=journey.peek(owner,"share","new");let result;
        if(!form.dataset.id&&previous){try{result=await api("/api/shares/requests/"+previous);}catch(error){if(error.status!==404)throw error;}}
        if(!result)result=await post(form.dataset.id?"/api/shares/"+form.dataset.id+"/revise":"/api/shares",{...data,...(form.dataset.id?{expectedVersion:Number(form.dataset.version)}:{})},form.dataset.id?{}:{"Idempotency-Key":journey.request(owner,"share","new")});
        if(!form.dataset.id)journey.clear(owner,"share","new");drafts.delete(owner+":"+form.dataset.id);
        // Replace the form before showing a new view, so captureDraft cannot
        // recreate a successfully submitted draft during the dialog transition.
        form.remove();
        show(header("나눔 글을 접수했어요")+'<div class="dialog-content prose"><p>검토 결과는 내 나눔 글에서 확인할 수 있어요. 이전 요청이 이미 접수됐다면 중복 등록하지 않으며, 그 뒤 작성창에서 바꾼 내용은 추가 반영되지 않습니다.</p>'+button("share-open","접수된 글 확인",result.id)+button("share-mine","내 나눔 글","","button button-outline")+'</div>',{type:"share-success",id:result.id});
      }else{
        await post(form.id==="share-review-form"?"/api/admin/shares/"+form.dataset.id+"/review":"/api/shares/"+form.dataset.id+"/hide",{...Object.fromEntries(fd),expectedVersion:Number(form.dataset.version),...(form.dataset.status?{expectedStatus:form.dataset.status}:{})});
        show(header("처리 결과를 저장했어요")+'<div class="dialog-content prose"><p>현재 공개 상태를 갱신했어요.</p>'+button(form.id==="share-review-form"?"share-admin":"share-mine","목록으로 돌아가기")+'</div>',{type:"share-success"});
      }
      await refresh();
    }catch(error){const target=$("#share-error",form);if(target){target.textContent=error.message;target.hidden=false;}else toast(error.message);}
    finally{submit.disabled=false;submit.textContent=original;}
  }
  function init(){
    const select=$("#sharing-category");if(!select)return;
    select.innerHTML=groupedKindOptions({includeAll:true,emptyLabel:"모든 종류"});
    $("#sharing-admin-button").hidden=!ctx.getAuth()?.isAdmin;ready=true;void refresh();
    $("#value-admin-button").hidden=!ctx.getAuth()?.isAdmin;
    $("#sharing-search").addEventListener("submit",event=>{event.preventDefault();void refresh({nextMode:"public"});});
    document.addEventListener("change",event=>{if(event.target.matches('#share-form [name="category"]'))topics(event.target.form);});
  }
  return {init,refresh,open,compose,captureDraft,handles:action=>action.startsWith("share-"),action,hasForm:id=>["share-form","share-review-form","share-hide-form"].includes(id),submit};
}
