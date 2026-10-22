import {CATALOG,TOPICS,DOMAINS,KIND_GROUPS,groupedKindOptions,MATURITY_LABELS,DEFAULT_FILTERS,parseDiscoveryFilters,discoveryParams} from "./catalog.js";
import {escapeHtml as h} from "./format.js";

export function createDiscoveryUI(ctx){
  const {api,icon,money,toast}=ctx;
  const $=s=>document.querySelector(s);
  let filters=parseDiscoveryFilters(new URLSearchParams(location.search)),result=null,sequence=0,controller,suggestSequence=0,suggestTimer,suggestions=[],selectedSuggestion=-1,composing=false;
  const compared=new Map();
  const bannerContent=[
    {eyebrow:"좋은 생각과, 다음 시작을 연결해요",heading:'다음에 할 일,<br><span class="highlight">여기서 발견.</span>',description:"머릿속의 가능성을 실행할 수 있는 기획으로.\n당신의 관심과 예산에 맞는 아이디어를 만나보세요.",cta:"내게 맞는 아이디어 찾기",action:"start"},
    {eyebrow:"구체적인 자료에서, 실행의 힌트까지",heading:'생각의 다음 장,<br><span class="highlight">기획으로 만나다.</span>',description:"문제 정의부터 검증과 실행 계획까지.\n전문 기획으로 분류된 아이디어를 살펴보세요.",cta:"전문 기획 둘러보기",action:"professional"},
    {eyebrow:"당신의 생각에도, 다음이 있으니까",heading:'머릿속 가능성,<br><span class="highlight">기회로 키우다.</span>',description:"공개할 소개와 보호할 상세 자료를 나누어.\n네 단계로 차근차근, 첫 판매를 준비하세요.",cta:"내 아이디어 등록하기",action:"create"}
  ];
  function directory(){
    $("#category-directory").innerHTML=Object.entries(KIND_GROUPS).map(([group,data])=>'<section class="kind-family"><div class="kind-family-heading"><h3>'+h(data.label)+'</h3><p>'+h(data.description)+'</p></div><ul>'+Object.entries(CATALOG).filter(([,item])=>item.group===group).map(([id,item])=>'<li><a href="#marketplace" data-category="'+id+'" title="'+h(item.description+' · '+item.example)+'">'+icon(item.icon)+'<span>'+h(item.label)+'</span>'+icon("chevron")+'</a></li>').join("")+'</ul></section>').join("");
  }
  function setBanner(index){
    const content=bannerContent[index];if(!content)return;
    $("#banner-eyebrow").textContent=content.eyebrow;
    $("#banner-heading").innerHTML=content.heading;
    $("#banner-description").textContent=content.description;
    $("#banner-description").style.whiteSpace="pre-line";
    const cta=$("#banner-primary");cta.innerHTML=h(content.cta)+icon("arrow");
    delete cta.dataset.action;delete cta.dataset.discover;
    if(content.action==="create")cta.dataset.action="create";else cta.dataset.discover=content.action;
    document.querySelectorAll("[data-banner]").forEach(button=>button.setAttribute("aria-pressed",String(Number(button.dataset.banner)===index)));
  }
  function syncURL(mode="push"){
    const url=new URL(location.href);
    for(const key of Object.keys(DEFAULT_FILTERS))url.searchParams.delete(key);
    for(const [key,value] of discoveryParams(filters))url.searchParams.set(key,value);
    if(!url.hash||url.hash==="#categories")url.hash="marketplace";
    history[mode==="replace"?"replaceState":"pushState"](null,"",url);
  }
  function selectedFilters(){
    const rows=[];
    if(filters.q)rows.push(["q","검색: "+filters.q]);
    if(filters.category!=="all")rows.push(["category",CATALOG[filters.category].label]);
    if(filters.topic!=="all")rows.push(["topic",TOPICS[filters.topic].label]);
    if(filters.domain!=="all")rows.push(["domain",DOMAINS[filters.domain].label]);
    if(filters.legacy||filters.legacyTopic)rows.push(["legacy","이전 분류에서 찾기"]);
    if(filters.maturity!=="all")rows.push(["maturity",MATURITY_LABELS[filters.maturity]]);
    if(filters.status!=="active")rows.push(["status",filters.status==="sold"?"판매완료":"판매완료 포함"]);
    if(filters.min!==""||filters.max!=="")rows.push(["price",(filters.priceType==="view"?"열람료 ":"사용료 ")+(filters.min?money(Number(filters.min)):"0")+"~"+(filters.max?money(Number(filters.max)):"제한 없음")+(filters.max?"원":"")]);
    return rows;
  }
  function controls(){
    const focusedCategory=document.activeElement?.closest("#category-tabs [data-category]")?.dataset.category;
    const facets=result?.facets;
    $("#category-tabs").innerHTML=[["all",{label:"전체",icon:"grid"}],...Object.entries(CATALOG)].map(([id,data])=>'<button class="category '+(filters.category===id?"active":"")+'" type="button" data-category="'+id+'" aria-pressed="'+(filters.category===id)+'">'+icon(data.icon)+h(data.label)+(facets&&id!=="all"?'<span class="category-count">'+(facets.categories[id]||0)+'</span>':"")+'</button>').join("");
    const form=$("#catalog-filters"),topic=form.elements.topic;
    form.elements.category.innerHTML=groupedKindOptions({includeAll:true,emptyLabel:"모든 아이디어 종류"});form.elements.category.value=filters.category;
    form.elements.domain.innerHTML='<option value="all">모든 관련 분야</option>'+Object.entries(DOMAINS).map(([id,data])=>'<option value="'+id+'">'+h(data.label)+(facets?" ("+(facets.domains?.[id]||0)+")":"")+'</option>').join("");form.elements.domain.value=filters.domain;
    topic.innerHTML='<option value="all">'+(filters.category==="all"?"종류를 먼저 선택하세요":"모든 세부 유형")+'</option>'+(CATALOG[filters.category]?.topics||[]).map(([id,label])=>'<option value="'+id+'">'+h(label)+(facets?" ("+(facets.topics[id]||0)+")":"")+'</option>').join("");
    topic.disabled=filters.category==="all";topic.value=filters.topic;
    for(const key of ["maturity","status","priceType","min","max"])form.elements[key].value=filters[key];
    $("#sort-select").value=filters.sort;
    if(document.activeElement!==$("#search-input"))$("#search-input").value=filters.q;
    $(".search-clear").hidden=!$("#search-input").value;
    const chips=selectedFilters();$("#filter-count").textContent=chips.filter(x=>x[0]!=="q").length;
    $("#active-filters").innerHTML=chips.map(([key,label])=>'<button type="button" class="filter-chip" data-discover="remove-filter" data-filter="'+key+'" aria-label="'+h(label)+' 조건 해제">'+h(label)+icon("close")+'</button>').join("");
    $("#search-result-note").textContent=(filters.priceType==="use"?"가격 필터·가격순 정렬은 독점 사용료 기준입니다. ":"")+(filters.sort==="relevance"?"관련도는 제목·태그·공개 요약의 일치도를 기준으로 정렬해요.":"기획 수준은 판매자가 선택하며 사업성과 법적 권리를 보증하지 않아요.");
    if(focusedCategory)document.querySelector('#category-tabs [data-category="'+focusedCategory+'"]').focus({preventScroll:true});
  }
  function skeleton(){return Array.from({length:6},()=>'<article class="idea-card discovery-skeleton" aria-hidden="true"><div></div><p></p><p></p><span></span></article>').join("");}
  function emptyState(){return '<div class="empty-state">'+icon("search")+'<h3>'+(filters.q?'“'+h(filters.q)+'”에 맞는 아이디어가 없어요.':"선택한 조건의 아이디어가 아직 없어요.")+'</h3><p>단어를 줄이거나 가격·분야 조건을 넓혀보세요.</p><div class="empty-suggestions"><button type="button" data-discover="reset">모든 조건 초기화</button>'+(filters.q?'<button type="button" data-discover="keep-query">검색어만 유지하고 다시 찾기</button>':"")+'</div></div>';}
  function pagination(){
    if(result.pages<=1){$("#catalog-pagination").innerHTML="";return;}
    const pages=[...new Set([1,result.page-1,result.page,result.page+1,result.pages].filter(x=>x>=1&&x<=result.pages))].sort((a,b)=>a-b);
    const pageButton=(page,label,extra="")=>'<button type="button" data-discover="page" data-page="'+page+'" '+extra+'>'+label+'</button>';
    let html=pageButton(Math.max(1,result.page-1),icon("back"),'aria-label="이전 결과 페이지" '+(result.page===1?"disabled":"")),last=0;
    for(const page of pages){if(last&&page-last>1)html+='<span aria-hidden="true">…</span>';html+=pageButton(page,String(page),page===result.page?'aria-current="page"':'aria-label="'+page+'페이지"');last=page;}
    html+=pageButton(Math.min(result.pages,result.page+1),icon("arrow"),'aria-label="다음 결과 페이지" '+(result.page===result.pages?"disabled":""));
    $("#catalog-pagination").innerHTML=html;
  }
  async function refresh({silent=false}={}){
    const request=++sequence;controller?.abort();controller=new AbortController();
    if(!silent){$("#idea-grid").setAttribute("aria-busy","true");if(!result)$("#idea-grid").innerHTML=skeleton();}
    try{
      const data=await api("/api/discovery?"+discoveryParams(filters),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(request!==sequence)return;
      const correctedPage=filters.page!==data.page;
      const changed=JSON.stringify(result)!==JSON.stringify(data);
      result=data;filters=data.filters;ctx.onResults(data.ideas);
      if(correctedPage)syncURL("replace");
      if(!silent||changed)$("#idea-grid").innerHTML=data.ideas.length?data.ideas.map(ctx.card).join(""):emptyState();
      $("#results-count").innerHTML=(filters.q?'검색 결과 ':"아이디어 ")+'<strong>'+money(data.total)+'</strong>개'+(data.total?' <span class="results-range">· '+((data.page-1)*data.limit+1)+'–'+Math.min(data.total,data.page*data.limit)+'</span>':"");
      if(!silent||changed){controls();pagination();updateCompare();}
      return data;
    }catch(error){
      if(request!==sequence||error.name==="AbortError")return;
      if(!silent){$("#idea-grid").innerHTML='<div class="empty-state">'+icon("info")+'<h3>아이디어를 불러오지 못했어요.</h3><p>'+h(error.message)+'</p><button class="button button-outline" type="button" data-discover="retry">다시 불러오기</button></div>';$("#results-count").textContent="연결을 확인해 주세요.";$("#catalog-pagination").innerHTML="";}
    }finally{if(request===sequence)$("#idea-grid").setAttribute("aria-busy","false");}
  }
  async function apply(patch,{scroll=false,page=false}={}){
    const next={...filters,...patch,...(!page?{page:1}:{})};
    const params=new URLSearchParams(Object.entries(next).map(([key,value])=>[key,String(value)]));
    try{filters=parseDiscoveryFilters(params,{strict:true});}catch(error){$("#filter-error").hidden=false;$("#filter-error").textContent=error.message;return;}
    $("#filter-error").hidden=true;hideSuggestions();$("#search-input").value=filters.q;syncURL();await refresh();
    if(scroll)$("#marketplace").scrollIntoView({behavior:"smooth",block:"start"});
  }
  const reset=()=>apply({...DEFAULT_FILTERS});
  function hideSuggestions(){suggestSequence++;suggestions=[];selectedSuggestion=-1;$("#search-suggestions").hidden=true;$("#search-input").setAttribute("aria-expanded","false");$("#search-input").removeAttribute("aria-activedescendant");}
  async function suggest(){
    const input=$("#search-input"),q=input.value.trim(),request=++suggestSequence;
    if(!q){hideSuggestions();return;}
    const params=discoveryParams(filters);params.set("q",q);
    try{const data=await api("/api/discovery/suggest?"+params,{signal:AbortSignal.timeout(10000)});if(request!==suggestSequence||document.activeElement!==input)return;suggestions=data.suggestions;selectedSuggestion=-1;input.removeAttribute("aria-activedescendant");
      $("#search-suggestions").innerHTML=suggestions.map((item,i)=>'<button type="button" class="suggestion-option" role="option" id="suggestion-'+i+'" data-discover="suggestion" data-index="'+i+'" aria-selected="false" tabindex="-1">'+icon("search")+'<span>'+h(item.label)+'</span><small>'+h(item.kind)+'</small></button>').join("");
      $("#search-suggestions").hidden=!suggestions.length;input.setAttribute("aria-expanded",String(Boolean(suggestions.length)));
    }catch{hideSuggestions();}
  }
  function compareControl(idea){return '<button type="button" class="compare-control" data-discover="compare-toggle" data-id="'+h(idea.id)+'" aria-pressed="'+compared.has(idea.id)+'">'+icon(compared.has(idea.id)?"check":"plus")+'<span>비교 담기</span></button>';}
  function updateCompare(){
    document.querySelectorAll(".compare-control").forEach(button=>{const selected=compared.has(button.dataset.id);button.setAttribute("aria-pressed",String(selected));button.innerHTML=icon(selected?"check":"plus")+'<span>'+(selected?"비교에 담았어요":"비교 담기")+'</span>';});
    const tray=$("#compare-tray");tray.hidden=!compared.size;
    tray.innerHTML='<p>아이디어 비교 <strong>'+compared.size+'/3</strong></p><div class="compare-items">'+[...compared.values()].map(idea=>'<button type="button" data-discover="compare-toggle" data-id="'+h(idea.id)+'" aria-label="'+h(idea.title)+' 비교에서 제거">'+h(idea.title)+icon("close")+'</button>').join("")+'</div><button type="button" class="text-button" data-discover="compare-clear">비우기</button><button type="button" class="button button-dark" data-discover="compare-open" '+(compared.size<2?"disabled":"")+'>나란히 비교'+icon("arrow")+'</button>';
  }
  function toggleCompare(id){
    if(compared.has(id))compared.delete(id);else{if(compared.size>=3){toast("아이디어는 최대 3개까지 비교할 수 있어요.");return;}const idea=result?.ideas.find(x=>x.id===id);if(idea)compared.set(id,idea);}
    updateCompare();
  }
  async function compare(){
    if(compared.size<2)return;
    const token=crypto.randomUUID();ctx.show(ctx.header("아이디어 나란히 비교")+'<div class="dialog-content"><p class="prose">현재 판매 상태를 확인하고 있어요.</p></div>',{type:"compare-loading",token});
    const responses=await Promise.allSettled([...compared.keys()].map(id=>api("/api/ideas/"+id)));
    if(ctx.getCurrent()?.token!==token)return;
    const items=responses.filter(x=>x.status==="fulfilled").map(x=>x.value.idea);
    if(items.length<2){toast("비교 가능한 아이디어가 부족해요. 목록에서 다시 골라주세요.");ctx.close();return;}
    const row=(label,render)=>'<tr><th scope="row">'+label+'</th>'+items.map(idea=>'<td>'+render(idea)+'</td>').join("")+'</tr>';
    ctx.show(ctx.header("같은 기준으로, 다른 가능성을","COMPARE IDEAS")+'<div class="dialog-content"><p class="checkout-lead">공개된 요약과 판매 조건을 비교해요. 상세 자료는 포함하지 않아요.</p><div class="compare-scroll"><table class="compare-table"><caption class="sr-only">선택한 아이디어의 공개 정보 비교</caption><tbody>'+row("아이디어",idea=>'<strong>'+h(idea.title)+'</strong>')+row("종류 · 세부 유형",idea=>h(CATALOG[idea.category].label)+'<p>'+h(TOPICS[idea.topic]?.label||"")+'</p>')+row("관련 분야",idea=>(idea.domainIds||[]).map(id=>h(DOMAINS[id]?.label||"")).join(" · ")||"미지정")+row("기획 수준",idea=>h(MATURITY_LABELS[idea.maturity]))+row("상세 열람료",idea=>'<strong>'+money(idea.viewPrice)+'원</strong>')+row("별도 사용료",idea=>'<strong>'+money(idea.usePrice)+'원</strong>')+row("판매 상태",idea=>idea.status==="sold"?"판매완료":"구매 가능")+row("공개 요약",idea=>'<p>'+h(idea.summary)+'</p>')+row("살펴보기",idea=>'<button type="button" class="button button-outline" data-action="detail" data-id="'+h(idea.id)+'">자세히 보기</button>')+'</tbody></table></div><p class="form-hint">열람료와 사용료는 별도입니다. 현재는 실제 청구 없는 테스트입니다.</p></div>',{type:"compare"});
  }
  document.addEventListener("click",async event=>{
    const category=event.target.closest("[data-category]");
    if(category){event.preventDefault();await apply({category:category.dataset.category,topic:"all",legacy:"",legacyTopic:""},{scroll:category.tagName==="A"});return;}
    const el=event.target.closest("[data-discover]");if(!el)return;event.preventDefault();
    const action=el.dataset.discover;
    if(action==="banner")setBanner(Number(el.dataset.banner));
    else if(action==="start")await apply({...DEFAULT_FILTERS},{scroll:true});
    else if(action==="professional")await apply({...DEFAULT_FILTERS,maturity:"professional"},{scroll:true});
    else if(action==="keyword")await apply({...DEFAULT_FILTERS,q:el.dataset.query});
    else if(action==="suggestion"){const item=suggestions[Number(el.dataset.index)];if(item)await apply({q:item.q});}
    else if(action==="clear-query")await apply({q:""});
    else if(action==="reset")await reset();
    else if(action==="keep-query")await apply({...DEFAULT_FILTERS,q:filters.q});
    else if(action==="retry")await refresh();
    else if(action==="page")await apply({page:Number(el.dataset.page)},{page:true,scroll:true});
    else if(action==="remove-filter"){const key=el.dataset.filter;await apply(key==="price"?{min:"",max:""}:key==="legacy"?{legacy:"",legacyTopic:""}:key==="category"?{category:"all",topic:"all",legacy:"",legacyTopic:""}:{[key]:DEFAULT_FILTERS[key]});}
    else if(action==="compare-toggle")toggleCompare(el.dataset.id);
    else if(action==="compare-clear"){compared.clear();updateCompare();}
    else if(action==="compare-open")await compare();
  });
  $("#discovery-search").addEventListener("submit",event=>{event.preventDefault();if(!composing)apply({q:$("#search-input").value});});
  $("#catalog-filters").addEventListener("submit",event=>{event.preventDefault();const fd=new FormData(event.target);apply({min:fd.get("min"),max:fd.get("max"),priceType:fd.get("priceType")});});
  $("#catalog-filters").addEventListener("change",event=>{if(["category","topic","domain","maturity","status","priceType"].includes(event.target.name)){const patch={[event.target.name]:event.target.value};if(event.target.name==="category"){patch.topic="all";patch.legacy="";patch.legacyTopic="";}if(event.target.name==="priceType"){const fd=new FormData(event.currentTarget);patch.min=fd.get("min");patch.max=fd.get("max");}apply(patch);}});
  $("#sort-select").addEventListener("change",event=>apply({sort:event.target.value}));
  $("#reset-filters").addEventListener("click",reset);
  $("#search-input").addEventListener("compositionstart",()=>{composing=true;clearTimeout(suggestTimer);hideSuggestions();});
  $("#search-input").addEventListener("compositionend",()=>{composing=false;clearTimeout(suggestTimer);suggestTimer=setTimeout(suggest,180);});
  $("#search-input").addEventListener("input",()=>{$(".search-clear").hidden=!$("#search-input").value;hideSuggestions();clearTimeout(suggestTimer);if(!composing)suggestTimer=setTimeout(suggest,180);});
  $("#search-input").addEventListener("keydown",event=>{
    if(event.isComposing||composing)return;
    if(event.key==="Escape"){hideSuggestions();return;}
    if(suggestions.length&&["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();selectedSuggestion=(selectedSuggestion+(event.key==="ArrowDown"?1:-1)+suggestions.length)%suggestions.length;document.querySelectorAll(".suggestion-option").forEach((el,i)=>el.setAttribute("aria-selected",String(i===selectedSuggestion)));event.target.setAttribute("aria-activedescendant","suggestion-"+selectedSuggestion);}
    if(event.key==="Enter"&&selectedSuggestion>=0&&suggestions[selectedSuggestion]){event.preventDefault();apply({q:suggestions[selectedSuggestion].q});}
  });
  document.addEventListener("click",event=>{if(!event.target.closest(".search-field-wrap"))hideSuggestions();});
  document.addEventListener("focusin",event=>{if(!event.target.closest(".search-field-wrap"))hideSuggestions();});
  window.addEventListener("popstate",()=>{filters=parseDiscoveryFilters(new URLSearchParams(location.search));$("#search-input").value=filters.q;refresh();});
  if(window.matchMedia("(max-width: 760px)").matches)$("#filter-panel").open=false;
  directory();controls();setBanner(0);updateCompare();
  return {refresh,reset,compareControl,updateCompare,getFilters:()=>({...filters})};
}
