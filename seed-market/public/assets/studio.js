import {platformNoticeHTML} from "./platform-notices.js";
import {CATALOG,TOPICS,DOMAINS,TAXONOMY_VERSION,briefFor,groupedKindOptions,MATURITY_LABELS} from "./catalog.js";
import {escapeHtml as h} from "./format.js";
import {priceGuideFor,priceGuideHTML} from "./pricing.js";
import {PATENT_FIELDS,patentFromValues,patentToValues,patentDeclarationIssues} from "./patent-policy.js";
import {patentSellerHTML,patentSellerAckHTML,patentSellerSummaryHTML} from "./patents.js";

const TEXT_FIELDS={...PATENT_FIELDS,title:80,summary:300,category:20,topic:40,maturity:20,tags:60,problem:6000,solution:10000,audience:2000,execution:10000,deliverables:485,originality:4000,validationNote:4000,risks:2000,viewPrice:12,usePrice:12};
export function parseStudioDraft(raw,owner){
  try{
    if(typeof raw!=="string"||raw.length>80000)return null;
    const data=JSON.parse(raw);
    if(![3,4].includes(data.version)||data.owner!==owner||!Number.isFinite(data.savedAt)||!data.values||typeof data.values!=="object")return null;
    const values=Object.fromEntries(Object.entries(TEXT_FIELDS).filter(([key])=>typeof data.values[key]==="string").map(([key,max])=>[key,data.values[key].slice(0,max)]));
    const needsClassification=data.taxonomyVersion!==TAXONOMY_VERSION||!Object.hasOwn(CATALOG,values.category)||TOPICS[values.topic]?.category!==values.category;
    if(needsClassification){values.category="";values.topic="";}
    const domainIds=Array.isArray(data.domainIds)?[...new Set(data.domainIds.filter(id=>typeof id==="string"&&Object.hasOwn(DOMAINS,id)))].slice(0,3):[];
    return {version:4,owner,savedAt:data.savedAt,values,domainIds,needsClassification};
  }catch{return null;}
}
export function studioHTML({config,header,icon}){
  const field=(name,label,min,max,placeholder)=>`<div class="field"><div class="field-label-line"><label for="idea-${name}">${h(label)} <span class="required-dot">*</span></label><span class="counter" id="counter-${name}" data-counter="${name}">0 / ${max}</span></div><textarea ${max>6000?'class="large" ':""}id="idea-${name}" name="${name}" required minlength="${min}" maxlength="${max}" aria-describedby="hint-${name} counter-${name}" placeholder="${h(placeholder)}"></textarea><span class="hint" id="hint-${name}">${min}자 이상 · 최대 ${new Intl.NumberFormat("ko-KR").format(max)}자</span></div>`;
  const visibility=kind=>'<span class="visibility-label '+(kind==="private"?"private":"")+'">'+icon(kind==="private"?"lock":"grid")+(kind==="private"?"결제 후 상세 공개":"무료 공개")+'</span>';
  const upload=(kind,label)=>`<div class="field"><div class="field-label-line"><label for="idea-${kind==="cover"?"cover":"private-images"}">${label}</label>${visibility(kind==="cover"?"public":"private")}</div><div class="upload-zone ${kind==="private"?"private":""}" data-upload-zone="${kind}">${icon("plus")}<strong>클릭하거나 이미지를 끌어 놓으세요</strong><p>PNG · JPG · WebP, 파일당 5MB 이하 · ${kind==="cover"?"1장, 선택 사항":"1~5장, 여러 번 추가 가능"}</p><input id="idea-${kind==="cover"?"cover":"private-images"}" name="${kind==="cover"?"cover":"privateImages"}" type="file" ${kind==="private"?'multiple aria-required="true"':""} accept="image/png,image/jpeg,image/webp" aria-label="${h(label)} 추가"></div><div class="upload-preview-list" id="${kind==="cover"?"cover-preview":"private-previews"}"></div></div>`;
  const quality=[["originality","직접 창작한 근거와 출처",20,4000,"직접 만든 자료와 참고한 자료를 구분하고, 출처와 판매 권한을 적어주세요."],["validationNote","검증한 내용과 미검증 부분",20,4000,"인터뷰·실험 등 확인한 사실과 앞으로 검증할 가설을 구분해 주세요."],["risks","실행의 한계와 위험",10,2000,"추가 확인이 필요한 기술, 비용, 권리나 운영상의 제약을 적어주세요."]].map(args=>field(...args)).join("");
  return header("아이디어를 기회로 만드는 작업실","SELLER STUDIO")+`
    <div class="studio-intro"><p>공개할 소개와 보호할 자료를 나누어 작성하세요.<br>등록 후 운영 검토를 거쳐 마켓에 공개돼요.</p><div><div class="draft-actions"><button type="button" data-studio="save">${icon("download")} 이 기기에 임시저장</button></div><span class="draft-status" id="draft-status" role="status">작성 내용은 이 탭에서 유지돼요. 이미지는 저장되지 않아요.</span></div></div>
    <div class="draft-notice" id="draft-notice" hidden><span>이 기기에 저장한 작성본이 있어요. 이미지는 다시 첨부해야 해요.</span><button type="button" data-studio="restore">불러오기</button><button type="button" data-studio="discard">저장본 삭제</button></div>
    <div class="studio-layout"><aside class="studio-sidebar"><nav class="studio-step-list" aria-label="판매 등록 단계">${["공개 소개","상세 자료 · 권리","가격 · 조건","최종 확인"].map((label,index)=>`<button type="button" class="studio-step" data-studio="step" data-step="${index}" aria-controls="studio-panel-${index}" ${index===0?'aria-current="step"':""}><span class="step-number">${index+1}</span><span>${label}</span></button>`).join("")}</nav><p class="studio-progress-label">작성 준비도 <strong id="studio-percent">0%</strong></p><progress class="studio-progress" id="studio-progress" max="100" value="0" aria-label="필수 자료 작성 준비도"></progress><div class="disclosure-guide"><div><strong>${icon("grid")} 요약은 무료로</strong><p>제목·요약·태그·커버·가격은 누구나 볼 수 있어요.</p></div><div><strong>${icon("lock")} 기획은 권한으로</strong><p>상세 본문과 참고 이미지는 열람 권한을 확인해 제공해요.</p></div></div></aside>
    <form id="idea-form" class="idea-form studio-form" novalidate>
      <section class="studio-panel" id="studio-panel-0" aria-labelledby="studio-heading-0"><h3 id="studio-heading-0" tabindex="-1">첫인상을 만드는 공개 소개</h3><p class="panel-description">무엇을 해결하는 기획인지 알려주세요. 핵심 노하우는 다음 단계의 상세 자료에 담아요.</p><div class="studio-fields">
        <div class="field"><div class="field-label-line"><label for="idea-title">아이디어 제목 <span class="required-dot">*</span></label><span class="counter" data-counter="title" id="counter-title">0 / 80</span></div><input id="idea-title" name="title" required minlength="6" maxlength="80" aria-describedby="counter-title" placeholder="예: 접이식 주방 도구 / 짧은 곡의 편곡 콘셉트"></div>
        <div class="form-row"><div class="field"><label for="idea-category">아이디어 종류 *</label><select id="idea-category" name="category" required aria-describedby="kind-description kind-example">${groupedKindOptions()}</select></div><div class="field"><label for="idea-topic">세부 유형 *</label><select id="idea-topic" name="topic" required><option value="">종류를 먼저 선택하세요</option></select></div></div><div class="kind-help"><strong id="kind-description">구매자가 받게 될 아이디어 자체의 종류를 골라주세요.</strong><p id="kind-example">운동기구의 구조는 제품 · 발명, 운동 루틴은 스포츠 · 운동, 시설 수익 모델은 사업 · 창업으로 구분해요.</p></div><fieldset class="domain-picker"><legend>관련 분야 <span>선택 · 최대 3개</span></legend><p>예: 건강 관련 앱은 종류를 소프트웨어로, 관련 분야를 건강 · 의료로 선택해요.</p><div>${Object.entries(DOMAINS).map(([id,data])=>'<label><input type="checkbox" name="domainIds" value="'+id+'"><span>'+h(data.label)+'</span></label>').join("")}</div><small id="domain-selection-count" role="status">0 / 3개 선택</small></fieldset>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label-line" style="margin-bottom:10px">기획의 구체화 수준 *</legend><div class="studio-levels">${[["seed","문제와 해결 방향, 초기 실행 계획"],["developed","사용자 흐름과 구체적인 기획 자료"],["professional","검증 근거와 비용·일정 가정까지"]].map(([id,description])=>'<label><input type="radio" name="maturity" value="'+id+'" '+(id==="seed"?"checked":"")+' required><span class="level-card"><strong>'+h(MATURITY_LABELS[id])+'</strong><small>'+h(description)+'</small></span></label>').join("")}</div><span class="hint">제공하는 자료의 깊이에 맞게 선택하세요. 이 선택을 기준으로 권장 가격을 안내하며, 자격이나 사업성 인증을 의미하지 않아요.</span></fieldset>
        ${field("summary","공개 요약",30,300,"제품의 쓸모, 작품의 매력, 사업의 가치처럼 이 아이디어의 핵심을 소개해 주세요. 상세 노하우는 다음 단계에 적어요.")}
        <div class="field"><label for="idea-tags">탐색을 돕는 태그</label><input id="idea-tags" name="tags" maxlength="60" placeholder="AI, 생산성, B2B"><span class="hint">쉼표로 구분해 최대 3개, 태그당 18자. 제목과 관련 있는 단어를 사용해 주세요.</span></div>
        ${upload("cover","소개용 커버 · 선택")}<p class="public-boundary">${icon("info")}<span>커버와 요약은 무료로 공개돼요. 기획의 핵심이나 개인정보가 들어 있지 않은지 확인해 주세요.</span></p>
      </div></section>
      <section class="studio-panel" id="studio-panel-1" aria-labelledby="studio-heading-1" hidden><h3 id="studio-heading-1" tabindex="-1">열람할 가치가 있는 구체적인 자료</h3><p class="panel-description">이 단계의 본문과 이미지는 결제 권한이 있는 사람에게만 제공돼요. 운영자는 검토를 위해 확인할 수 있어요.</p><div class="studio-fields">
        ${field("problem","문제와 배경",50,6000,"지금 어떤 불편이 있고, 기존 방식은 왜 충분하지 않은가요?")}
        ${field("solution","해결 방법과 핵심 기획",80,10000,"사용 흐름, 핵심 기능, 차별점과 구체적인 예시를 적어주세요.")}
        ${field("audience","대상 사용자와 시장",20,2000,"누구에게, 어떤 상황에서 필요한가요? 확인한 근거와 가설을 구분해 주세요.")}
        ${field("execution","실행 계획과 검증 방법",80,10000,"첫 실행 단계, 필요한 자원과 일정, 가설을 확인할 방법을 적어주세요.")}
        <div class="field"><label for="idea-deliverables">구매자가 받게 될 자료 *</label><textarea id="idea-deliverables" name="deliverables" required maxlength="485" placeholder="서비스 기획서&#10;핵심 화면 구성&#10;4주 실행 로드맵"></textarea><span class="hint">한 줄에 한 가지, 최대 6개 · 항목당 80자. 자료의 이름은 무료로 공개돼요.</span></div>
        ${upload("private","상세 참고 이미지 *")}
        <div class="quality-section"><h4>창작 근거와 검증 현황</h4><p>확인한 사실과 미확인 가설을 구분하면 구매자가 자료를 판단하는 데 도움이 돼요. 아래 내용도 상세 자료에 포함돼요.</p>${quality}</div>${patentSellerHTML()}
      </div></section>
      <section class="studio-panel" id="studio-panel-2" aria-labelledby="studio-heading-2" hidden><h3 id="studio-heading-2" tabindex="-1">열람과 사용, 두 가지 가격</h3><p class="panel-description">열람권은 자료 확인의 대가예요. 단독 이용권은 별도이며 열람료에서 차감되지 않아요.</p><div class="studio-fields"><div id="studio-price-guidance" aria-live="polite">${priceGuideHTML(priceGuideFor({maturity:"seed",category:"",viewPrice:1000,usePrice:10000}))}</div><div class="price-example"><div><strong>가격은 판매자가 자유롭게 정해요</strong><p>권장 상한을 넘어도 검토 요청을 할 수 있어요.<br>자료를 보완하거나 무료 나눔터에 먼저 공개해도 좋아요.</p></div><button type="button" data-studio="price-preset">권장 상한액 입력</button></div><div class="form-row"><div class="field"><label for="idea-viewPrice">1단계 · 상세 열람료 (원) *</label><input id="idea-viewPrice" name="viewPrice" type="number" min="1000" max="100000000" step="1000" inputmode="numeric" value="1000" required><span class="hint">최소 1,000원 · 1,000원 단위</span></div><div class="field"><label for="idea-usePrice">2단계 · 추가 단독 이용료 (원) *</label><input id="idea-usePrice" name="usePrice" type="number" min="1000" max="100000000" step="1000" inputmode="numeric" value="10000" required><span class="hint">상세 열람료 이상의 가격</span></div></div><div class="studio-financials"><div class="studio-financial"><span>열람권 1건 판매 시 예상액</span><strong id="studio-view-net">—</strong><p id="studio-view-fee"></p></div><div class="studio-financial"><span>사용권 1건 판매 시 예상액</span><strong id="studio-use-net">—</strong><p id="studio-use-fee"></p></div></div><p class="public-boundary">${icon("info")}<span>플랫폼 수수료 차감 후, PG 비용·세금 차감 전의 예상액이에요. 원 미만 수수료는 내림하며 정산은 <span id="studio-hold-days">${config.commerce.holdDays}</span>일 대기해요. 현재 실제 청구와 송금은 0원인 테스트입니다.</span></p></div></section>
      <section class="studio-panel" id="studio-panel-3" aria-labelledby="studio-heading-3" hidden><h3 id="studio-heading-3" tabindex="-1">공개 전에, 한 번 더 확인</h3><p class="panel-description">왼쪽은 무료로 보이는 소개예요. 공개되었거나 결제 이력이 있는 글은 수정할 수 없으니 마지막으로 확인하세요.</p><div id="studio-review"></div><section class="seller-policy"><h3>판매 수수료와 정산 조건</h3><div class="policy-rates"><span>열람권 <strong>${config.commerce.viewBps/100}%</strong></span><span>단독 이용권 <strong>${config.commerce.useBps/100}%</strong></span><span>정산 대기 <strong>${config.commerce.holdDays}일</strong></span></div><details><summary>판매 정책 전문 확인</summary><p>${h(config.sellerTerms.text)}</p></details><label class="checkbox-label"><input type="checkbox" name="sellerAgreement" required><span>위 수수료와 정산 조건, 운영 검토 후 공개되는 절차에 동의합니다.</span></label></section><label class="checkbox-label ownership-label"><input type="checkbox" name="ownership" required><span>직접 작성했거나 판매 권한이 있는 자료입니다. 무료 공개 범위와 열람권·단독 이용권의 차이를 확인했습니다.</span></label>${patentSellerAckHTML()}${platformNoticeHTML({compact:true})}</section>
      <p class="form-message" id="idea-error" role="alert" hidden></p><div class="form-footer"><span>등록 즉시 공개되지 않아요.<br>검토가 끝나면 내 계정에서 확인해요.</span><div class="studio-footer-actions"><button type="button" class="button button-outline" data-studio="previous" hidden>이전 단계</button><button type="button" class="button button-dark" data-studio="next">다음 단계 ${icon("arrow")}</button><button class="button button-dark" type="submit" hidden>검토 요청하기 ${icon("arrow")}</button></div></div>
    </form></div>`;
}

export function createSellerStudio(ctx){
  const {icon,money,toast}=ctx;
  const $=(s,root=document)=>root.querySelector(s);
  let form=null,step=0,memory=new Map(),editing=null,files={cover:[],private:[]},urls=new Map(),autosave=false,saveTimer,submitted=false,owner=null;
  const key=()=>"seed-studio-v3:"+owner+(editing?":"+editing.id+":"+editing.version:"");
  const values=()=>Object.fromEntries(Object.keys(TEXT_FIELDS).map(name=>[name,String(form.elements[name]?.value||"")]));
  function saved(){try{return parseStudioDraft(localStorage.getItem(key()),owner);}catch{return null;}}
  function setError(message,element){$("#idea-error",form).textContent=message;$("#idea-error",form).hidden=false;if(element){const details=element.closest("details");if(details)details.open=true;element.setAttribute("aria-invalid","true");element.focus();}else $("#idea-error",form).scrollIntoView({block:"nearest"});}
  function clearError(){if(!form)return;$("#idea-error",form).hidden=true;}
  function topics(selected=""){
    const category=form.elements.category.value;
    form.elements.topic.innerHTML='<option value="">'+(category?"세부 유형을 선택하세요":"종류를 먼저 선택하세요")+'</option>'+(CATALOG[category]?.topics||[]).map(([id,label])=>'<option value="'+id+'">'+h(label)+'</option>').join("");
    form.elements.topic.value=TOPICS[selected]?.category===category?selected:"";form.elements.topic.disabled=!category;
  }
  const selectedDomains=()=>[...form.querySelectorAll('input[name="domainIds"]:checked')].map(el=>el.value);
  function applyValues(data,domainIds=[]){
    form.elements.category.value=data.category||"";topics(data.topic);
    for(const [name,value] of Object.entries(data))if(name in TEXT_FIELDS&&!["category","topic"].includes(name))form.elements[name].value=value;
    for(const [name,value] of Object.entries(patentToValues(patentFromValues(data))))if(!form.elements[name].value)form.elements[name].value=value;
    form.querySelectorAll('input[name="domainIds"]').forEach(el=>el.checked=domainIds.includes(el.value));
    updateKindHelp();
    form.elements.sellerAgreement.checked=false;form.elements.ownership.checked=false;form.elements.patentAcknowledged.checked=false;
  }
  function updateKindHelp(){
    const category=form.elements.category.value,data=CATALOG[category];
    $("#kind-description",form).textContent=data?data.description:"구매자가 받게 될 아이디어 자체의 종류를 골라주세요.";
    $("#kind-example",form).textContent=data?data.example:"운동기구의 구조는 제품 · 발명, 운동 루틴은 스포츠 · 운동, 시설 수익 모델은 사업 · 창업으로 구분해요.";
    for(const [name,[label,placeholder]] of Object.entries(briefFor(category))){$('label[for="idea-'+name+'"]',form).innerHTML=h(label)+' <span class="required-dot">*</span>';form.elements[name].placeholder=placeholder;}
  }
  function save({quiet=false}={}){
    if(!form||submitted)return;
    try{const data={version:4,taxonomyVersion:TAXONOMY_VERSION,owner,savedAt:Date.now(),values:values(),domainIds:selectedDomains()};localStorage.setItem(key(),JSON.stringify(data));autosave=true;$("#draft-status").textContent="이 기기에 저장됨 · "+new Date(data.savedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})+" · 이미지는 다시 첨부";$("#draft-notice").hidden=true;if(!quiet)toast("이 계정의 작성 내용을 이 기기에 저장했어요. 이미지는 저장하지 않아요.");}
    catch{autosave=false;$("#draft-status").textContent="기기 저장을 사용할 수 없어요. 이 탭의 작성 내용은 유지돼요.";if(!quiet)toast("브라우저 저장 공간을 확인해 주세요. 작성 내용은 유지돼요.");}
  }
  function objectURL(file){if(file.retained)return file.url;if(!urls.has(file))urls.set(file,URL.createObjectURL(file));return urls.get(file);}
  function renderFiles(){
    const all=[...files.cover,...files.private];
    for(const [file,url] of urls)if(!all.includes(file)){URL.revokeObjectURL(url);urls.delete(file);}
    for(const kind of ["cover","private"]){const container=$(kind==="cover"?"#cover-preview":"#private-previews",form);container.innerHTML=files[kind].map((file,index)=>'<article class="upload-preview"><img src="'+h(objectURL(file))+'" alt="'+h(file.name)+'"><span>'+(kind==="cover"?"무료 공개":"결제 후 공개")+'</span><button type="button" data-studio="remove-image" data-kind="'+kind+'" data-index="'+index+'" aria-label="'+h(file.name)+' 제거">'+icon("close")+'</button><p>'+h(file.name)+' · '+(file.size/1024/1024).toFixed(1)+'MB</p></article>').join("");}
  }
  function addFiles(kind,incoming){
    if(!incoming.length)return;
    const invalid=incoming.find(file=>!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024||file.size===0);
    if(invalid){setError("PNG·JPG·WebP 형식의 0~5MB 이미지인지 확인해 주세요: "+invalid.name);return;}
    const signature=file=>[file.name,file.size,file.lastModified,file.type].join("/");
    const next=kind==="cover"?incoming:[...new Map([...files.private,...incoming].map(file=>[signature(file),file])).values()];
    if(next.length>(kind==="cover"?1:5)){setError(kind==="cover"?"공개 커버는 1장만 선택해 주세요.":"상세 이미지는 최대 5장까지 첨부할 수 있어요. 기존 이미지를 먼저 제거해 주세요.");return;}
    files[kind]=next;clearError();renderFiles();update();
  }
  function validElement(element){
    if(element.disabled)return true;
    if(element.type==="radio")return Boolean(form.elements[element.name].value);
    if(element.type==="checkbox")return element.checked;
    const value=element.value.trim();
    if(element.required&&!value)return false;
    if(value&&element.minLength>0&&value.length<element.minLength)return false;
    return element.checkValidity();
  }
  function invalidIn(index){
    const panel=$("#studio-panel-"+index,form);
    const invalid=[...panel.querySelectorAll("input[required],select[required],textarea[required]")].find(element=>!validElement(element));
    if(invalid)return {element:invalid,message:"필수 항목의 내용과 글자 수를 확인해 주세요."};
    if(index===0&&selectedDomains().length>3)return {element:form.querySelector('input[name="domainIds"]'),message:"관련 분야는 최대 3개까지 선택해 주세요."};
    if(index===0){const tags=form.elements.tags.value.split(",").map(x=>x.trim()).filter(Boolean);if(tags.length>3||tags.some(x=>x.length>18))return {element:form.elements.tags,message:"태그는 최대 3개, 각각 18자 이내로 입력해 주세요."};}
    if(index===1){
      if(!files.private.length)return {element:form.elements.privateImages,message:"상세 참고 이미지를 1장 이상 첨부해 주세요."};
      const deliverables=form.elements.deliverables.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      if(!deliverables.length||deliverables.length>6||deliverables.some(x=>x.length>80))return {element:form.elements.deliverables,message:"제공 자료를 한 줄에 하나씩, 최대 6개·항목당 80자로 입력해 주세요."};
    }
    if(index===1){const issue=patentDeclarationIssues(patentFromValues(values(),true))[0];if(issue)return {element:form.elements[issue.field]||form.elements.patentStatus,message:issue.message};}
    if(index===2&&Number(form.elements.usePrice.value)<Number(form.elements.viewPrice.value))return {element:form.elements.usePrice,message:"단독 이용료는 상세 열람료 이상으로 설정해 주세요."};
    return null;
  }
  function viewStep(index,{focus=true}={}){
    step=index;clearError();
    form.querySelectorAll(".studio-panel").forEach((el,i)=>el.hidden=i!==step);
    document.querySelectorAll(".studio-step").forEach((el,i)=>{if(i===step)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");el.classList.toggle("is-complete",i<3&&!invalidIn(i));});
    $('[data-studio="previous"]',form).hidden=step===0;
    $('[data-studio="next"]',form).hidden=step===3;
    $('button[type="submit"]',form).hidden=step!==3;
    update();
    if(focus)$("#studio-heading-"+step,form).focus({preventScroll:false});
  }
  function go(index){
    if(index<0||index>3)return;
    if(index>step)for(let i=0;i<index;i++){const issue=invalidIn(i);if(issue){viewStep(i);setError(issue.message,issue.element);return;}}
    viewStep(index);
  }
  function review(){
    const data=values(),details=files.private.length,cover=files.cover[0];
    return '<div class="studio-review"><article class="review-card"><div class="review-card-cover">'+(cover?'<img src="'+h(objectURL(cover))+'" alt="무료 공개 커버 미리보기">':icon("sprout"))+'</div><div class="review-card-body"><small>'+h(CATALOG[data.category]?.label||"종류 미선택")+' · '+h(MATURITY_LABELS[data.maturity]||"")+' · '+h(TOPICS[data.topic]?.label||"")+'</small><h4>'+h(data.title||"아이디어 제목")+'</h4><p>'+h(data.summary||"구매자에게 보일 공개 요약")+'</p><div class="two-prices"><span>상세 열람 <strong>'+money(Number(data.viewPrice))+'<small>원</small></strong></span><span>단독 이용 <strong>'+money(Number(data.usePrice))+'<small>원</small></strong></span></div></div></article><div><ul class="review-checklist"><li>'+icon("grid")+'<div><strong>무료 공개</strong><p>제목·요약·태그·가격·제공 자료 이름<br>공개 커버 '+(cover?"1장":"없음 · 기본 이미지 사용")+'</p></div></li><li>'+icon("lock")+'<div><strong>결제 권한으로 제공</strong><p>상세 본문 4개 항목과 참고 이미지 '+details+'장<br>창작 근거·검증 현황·한계와 위험</p></div></li><li>'+icon("file")+'<div><strong>검토 후 공개</strong><p>판매자는 내 계정에서 심사 결과를 확인할 수 있어요. 반려 시 사유를 확인하고 기존 글을 수정해 재검토를 요청하세요.</p></div></li><li>'+icon("sprout")+'<div><strong>단독 구매 후 판매완료</strong><p>다른 구매자의 상세 재접근이 종료돼요. 이미 확인한 정보를 기술적으로 회수할 수는 없어요.</p></div></li></ul><button type="button" class="text-button" data-studio="step" data-step="0">공개 소개 다시 수정 '+icon("back")+'</button></div></div>';
  }
  function update(){
    if(!form)return;
    $("#domain-selection-count",form).textContent=selectedDomains().length+" / 3개 선택";
    for(const counter of form.querySelectorAll("[data-counter]")){const field=form.elements[counter.dataset.counter],length=field.value.length;counter.textContent=length+" / "+field.maxLength;counter.classList.toggle("is-valid",length>=field.minLength&&length>0);}
    const fields=[...form.querySelectorAll("input[required],select[required],textarea[required]")].filter(el=>!["checkbox","radio"].includes(el.type));
    const percent=Math.round((fields.filter(validElement).length+(files.private.length?1:0)+(patentDeclarationIssues(patentFromValues(values(),true)).length?0:1))/(fields.length+2)*100);
    $("#studio-percent").textContent=percent+"%";$("#studio-progress").value=percent;
    const commerce=editing?.commerce||ctx.getConfig().commerce;
    $("#studio-hold-days",form).textContent=commerce.holdDays;
    for(const [kind,bps] of [["view",commerce.viewBps],["use",commerce.useBps]]){const price=Number(form.elements[kind+"Price"].value),valid=Number.isSafeInteger(price)&&price>=1000&&price<=100000000&&price%1000===0;$("#studio-"+kind+"-net",form).textContent=valid?money(price-Math.floor(price*bps/10000))+"원":"—";$("#studio-"+kind+"-fee",form).textContent=valid?"수수료 "+bps/100+"% · "+money(Math.floor(price*bps/10000))+"원":"1,000원 단위로 입력해 주세요.";}
    $("#studio-price-guidance",form).innerHTML=priceGuideHTML(priceGuideFor(values()));
    if(step===3)$("#studio-review",form).innerHTML=review()+patentSellerSummaryHTML(patentFromValues(values()))+priceGuideHTML(priceGuideFor(values()));
  }
  function capture(){if(form&&!submitted)memory.set(key(),{owner,values:values(),domainIds:selectedDomains(),files:{cover:[...files.cover],private:[...files.private]},step});}
  function suspend(){capture();clearTimeout(saveTimer);if(autosave&&!submitted)save({quiet:true});for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();form=null;}
  function open(edit=null){
    editing=edit;owner=ctx.getAuth().profile.id;submitted=false;autosave=false;files={cover:[],private:[]};step=0;
    const config=editing?{...ctx.getConfig(),commerce:editing.commerce,sellerTerms:editing.sellerTerms}:ctx.getConfig();
    let html=studioHTML({config,header:editing?()=>ctx.header("아이디어 수정 · 재검토","SELLER STUDIO"):ctx.header,icon});
    if(editing)html=html.replace('<div class="studio-intro">','<div class="revision-notice"><strong>등록 버전 '+editing.version+' 수정</strong><br>'+h(editing.reviewReason||"검토 대기 중인 글을 수정합니다.")+'<br>기존 이미지를 그대로 사용할 수 있어요. 제출하면 다시 검토 대기로 전환되며, 처음 합의한 수수료 조건을 유지해요.</div><div class="studio-intro">');
    ctx.show(html,{type:"create",editId:editing?.id||null},"#idea-title");form=$("#idea-form");
    form.dataset.feeQuote=JSON.stringify(config.commerce);form.dataset.sellerTermsVersion=config.sellerTerms.version;
    form.dataset.editId=editing?.id||"";form.dataset.expectedVersion=editing?.version||"";
    if(editing){const input={...editing.input,...patentToValues(editing.input.patent||{}),tags:editing.input.tags.join(", "),deliverables:editing.input.deliverables.join("\n")};applyValues(input,editing.input.domainIds);files={cover:editing.images.filter(img=>img.kind==="public"),private:editing.images.filter(img=>img.kind==="private")};}
    const remembered=memory.get(key());
    if(remembered?.owner===owner){applyValues(remembered.values,remembered.domainIds||[]);files=remembered.files;step=remembered.step;}
    $("#draft-notice").hidden=!saved();
    topics(form.elements.topic.value);updateKindHelp();renderFiles();viewStep(step,{focus:false});
    for(const zone of form.querySelectorAll("[data-upload-zone]")){
      zone.addEventListener("dragover",event=>{if([...event.dataTransfer.types].includes("Files")){event.preventDefault();zone.classList.add("is-dragging");}});
      zone.addEventListener("dragleave",()=>zone.classList.remove("is-dragging"));
      zone.addEventListener("drop",event=>{event.preventDefault();zone.classList.remove("is-dragging");if(form?.getAttribute("aria-busy")!=="true")addFiles(zone.dataset.uploadZone,[...event.dataTransfer.files]);});
    }
  }
  document.addEventListener("click",event=>{
    const el=event.target.closest("[data-studio]");if(!el||!form||form.getAttribute("aria-busy")==="true")return;event.preventDefault();
    const action=el.dataset.studio;
    if(action==="next")go(step+1);else if(action==="previous")go(step-1);else if(action==="step")go(Number(el.dataset.step));
    else if(action==="save")save();
    else if(action==="restore"){const data=saved();if(data){applyValues(data.values,data.domainIds);files={cover:[],private:[]};renderFiles();autosave=true;$("#draft-notice").hidden=true;$("#draft-status").textContent=data.needsClassification?"이전 작성 내용은 유지했어요. 새 종류·세부 유형을 선택하고 이미지를 다시 첨부해 주세요.":"저장본을 불러왔어요. 이미지를 다시 첨부해 주세요.";viewStep(0);}}
    else if(action==="discard"){try{localStorage.removeItem(key());}catch{}autosave=false;$("#draft-notice").hidden=true;$("#draft-status").textContent="기기 저장본을 삭제했어요. 현재 작성 내용은 유지돼요.";}
    else if(action==="remove-image"){files[el.dataset.kind].splice(Number(el.dataset.index),1);renderFiles();update();}
    else if(action==="price-preset"){const guide=priceGuideFor(values()),prices=[guide.view.recommendedMax,guide.use.recommendedMax];form.elements.viewPrice.value=prices[0];form.elements.usePrice.value=prices[1];update();if(autosave)save({quiet:true});toast("권장 상한액을 입력했어요. 더 낮거나 높은 가격으로 자유롭게 바꿀 수 있어요.");}
  });
  document.addEventListener("change",event=>{
    if(!form||!form.contains(event.target))return;
    if(event.target.name==="category"){topics();updateKindHelp();}
    if(event.target.name==="domainIds"&&selectedDomains().length>3){event.target.checked=false;toast("관련 분야는 최대 3개까지 선택해 주세요.");}
    if(["cover","privateImages"].includes(event.target.name)){addFiles(event.target.name==="cover"?"cover":"private",[...event.target.files]);event.target.value="";}
    update();
    if(autosave){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save({quiet:true}),500);}
  });
  document.addEventListener("input",event=>{if(!form||!form.contains(event.target))return;event.target.removeAttribute("aria-invalid");update();if(autosave){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save({quiet:true}),500);}});
  function beforeSubmit(){for(let i=0;i<4;i++){const issue=invalidIn(i);if(issue){viewStep(i);setError(issue.message,issue.element);return false;}}return true;}
  function markSubmitted(){submitted=true;memory.delete(key());clearTimeout(saveTimer);try{localStorage.removeItem(key());}catch{}}
  return {open,suspend,beforeSubmit,markSubmitted,update,getFiles:()=>({privateImages:[...files.private],covers:[...files.cover]})};
}
