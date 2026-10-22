import {CATALOG,TOPICS,DOMAINS,KIND_GROUPS,LEGACY_CATEGORIES,LEGACY_TOPICS,inferTopic} from "./taxonomy.js";
export {CATALOG,TOPICS,DOMAINS,KIND_GROUPS,TAXONOMY_VERSION,inferTopic,classifyIdea,briefFor,groupedKindOptions} from "./taxonomy.js";
export const MATURITY_LABELS=Object.freeze({seed:"아이디어",developed:"구체화 기획",professional:"전문 기획"});
export const DEFAULT_FILTERS=Object.freeze({q:"",category:"all",topic:"all",domain:"all",legacy:"",legacyTopic:"",maturity:"all",status:"active",priceType:"view",min:"",max:"",sort:"relevance",page:1,limit:9});
const INITIALS="ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const SYNONYMS=[["ai","인공지능","에이아이"],["로컬","동네","지역"],["b2b","기업간거래","기업 서비스"],["구독","멤버십"],["크리에이터","창작자"],["친환경","지속가능","순환"],["음악","뮤직","music"],["스포츠","체육","sports"],["사업","비즈니스","창업","business"],["예체능","예술","스포츠","음악","미술","무용"]];
export const normalizeText=value=>String(value??"").normalize("NFKC").replace(/[\u1100-\u1112]/g,ch=>INITIALS[ch.charCodeAt(0)-0x1100]).toLowerCase().replace(/[\p{P}\p{S}]/gu," ").replace(/\s+/g," ").trim();
const compact=value=>normalizeText(value).replace(/\s/g,"");
export const initials=value=>Array.from(String(value)).map(ch=>{const n=ch.charCodeAt(0)-0xac00;return n>=0&&n<=11171?INITIALS[Math.floor(n/588)]:ch;}).join("");
export function parseDiscoveryFilters(params,{strict=false}={}){
  const result={...DEFAULT_FILTERS};
  params=new URLSearchParams(params);
  const invalid=message=>{if(strict)throw new Error(message);};
  const oldCategory=params.get("category"),oldTopic=params.get("topic");
  if(Object.hasOwn(LEGACY_CATEGORIES,oldCategory)){params.set("legacy",oldCategory);params.set("category","all");}
  if(Object.hasOwn(LEGACY_TOPICS,oldTopic)){
    const owner=oldTopic.split("-")[0];
    if(oldCategory&&oldCategory!=="all"&&oldCategory!==owner)invalid("이전 분류와 세부 유형의 조합을 확인해 주세요.");
    params.set("legacyTopic",oldTopic);
    if(Object.hasOwn(LEGACY_CATEGORIES,owner))params.set("legacy",owner);
    const mapped=LEGACY_TOPICS[oldTopic];
    params.set("topic",mapped||"all");params.set("category",mapped?TOPICS[mapped].category:"all");
  }
  const choices={category:["all",...Object.keys(CATALOG)],topic:["all",...Object.keys(TOPICS)],domain:["all",...Object.keys(DOMAINS)],legacy:["",...Object.keys(LEGACY_CATEGORIES)],legacyTopic:["",...Object.keys(LEGACY_TOPICS)],maturity:["all",...Object.keys(MATURITY_LABELS)],status:["all","active","sold"],priceType:["view","use"],sort:["relevance","latest","price-low","price-high"]};
  for(const [key,allowed] of Object.entries(choices)){const value=params.get(key);if(value!==null){if(allowed.includes(value))result[key]=value;else invalid("필터 값을 확인해 주세요: "+key);}}
  result.q=(params.get("q")||"").trim();
  if(result.q.length>100){invalid("검색어는 100자 이내로 입력해 주세요.");result.q=result.q.slice(0,100);}
  if(result.q.split(/\s+/).length>8){invalid("검색어는 8개 단어까지 입력해 주세요.");result.q=result.q.split(/\s+/).slice(0,8).join(" ");}
  for(const key of ["min","max"]){const value=params.get(key);if(value){if(/^\d{1,9}$/.test(value)&&Number(value)<=100000000)result[key]=String(Number(value));else invalid("가격 범위는 0~100,000,000원의 정수로 입력해 주세요.");}}
  if(result.min!==""&&result.max!==""&&Number(result.min)>Number(result.max)){invalid("최소 가격이 최대 가격보다 커요.");result.min="";result.max="";}
  for(const [key,max] of [["page",100000],["limit",24]]){const value=params.get(key);if(value!==null){if(/^\d{1,6}$/.test(value)&&Number(value)>=1&&Number(value)<=max)result[key]=Number(value);else invalid("페이지 범위를 확인해 주세요.");}}
  if(result.topic!=="all"){
    const category=TOPICS[result.topic].category;
    if(result.category!=="all"&&result.category!==category){invalid("선택한 아이디어 종류에 속하는 세부 유형을 골라주세요.");result.topic="all";}else result.category=category;
  }
  return result;
}
export function discoveryParams(filters,{page=true}={}){
  const params=new URLSearchParams();
  for(const key of Object.keys(DEFAULT_FILTERS)){if(!page&&["page","limit"].includes(key))continue;if(String(filters[key]??DEFAULT_FILTERS[key])!==String(DEFAULT_FILTERS[key]))params.set(key,String(filters[key]));}
  return params;
}
function textScore(idea,q){
  if(!q)return 0;
  if(!compact(q))return -1;
  const fields=[[idea.title,140],[(idea.tags||[]).join(" "),90],[idea.summary,35],[CATALOG[idea.category]?.label+" "+(KIND_GROUPS[CATALOG[idea.category]?.group]?.label||"")+" "+TOPICS[idea.topic]?.label+" "+MATURITY_LABELS[idea.maturity]+" "+(idea.domainIds||[]).map(id=>DOMAINS[id]?.label||"").join(" "),25]];
  let score=0;
  for(const term of normalizeText(q).split(" ").filter(Boolean)){
    const synonyms=SYNONYMS.find(group=>group.some(word=>compact(word)===compact(term)))||[term];
    let termScore=0;
    for(const [value,weight] of fields){const text=compact(value);for(const word of synonyms){if(text.includes(compact(word)))termScore=Math.max(termScore,weight+(text===compact(word)?30:0));}}
    const normalizedInitials=term.normalize("NFC");
    if(/^[ㄱ-ㅎ]{2,}$/.test(normalizedInitials)&&fields.slice(0,2).some(([value])=>initials(value).replace(/\s/g,"").includes(normalizedInitials)))termScore=Math.max(termScore,65);
    if(!termScore)return -1;
    score+=termScore;
  }
  if(compact(idea.title).includes(compact(q)))score+=180;
  return score;
}
function passes(idea,f,except=""){
  const price=f.priceType==="use"?idea.usePrice:idea.viewPrice;
  return (except==="category"||f.category==="all"||idea.category===f.category)
    &&(except==="category"||except==="topic"||f.topic==="all"||idea.topic===f.topic)
    &&(except==="domain"||f.domain==="all"||(idea.domainIds||[]).includes(f.domain))
    &&(!f.legacy||idea.legacyCategory===f.legacy)
    &&(!f.legacyTopic||idea.legacyTopic===f.legacyTopic)
    &&(except==="maturity"||f.maturity==="all"||idea.maturity===f.maturity)
    &&(f.status==="all"||idea.status===f.status)
    &&(f.min===""||price>=Number(f.min))&&(f.max===""||price<=Number(f.max));
}
export function searchCatalog(ideas,filters){
  const matched=ideas.map(idea=>({...idea,topic:inferTopic(idea)})).map(idea=>({idea,score:textScore(idea,filters.q)})).filter(x=>x.score>=0);
  const facets={categories:Object.fromEntries(Object.keys(CATALOG).map(key=>[key,0])),topics:{},domains:Object.fromEntries(Object.keys(DOMAINS).map(key=>[key,0])),maturities:Object.fromEntries(Object.keys(MATURITY_LABELS).map(key=>[key,0]))};
  for(const {idea} of matched){
    if(passes(idea,filters,"category"))facets.categories[idea.category]++;
    if(passes(idea,filters,"topic"))facets.topics[idea.topic]=(facets.topics[idea.topic]||0)+1;
    if(passes(idea,filters,"domain"))for(const domain of idea.domainIds||[])if(Object.hasOwn(facets.domains,domain))facets.domains[domain]++;
    if(passes(idea,filters,"maturity"))facets.maturities[idea.maturity]++;
  }
  const rows=matched.filter(({idea})=>passes(idea,filters));
  const tie=(a,b)=>b.idea.createdAt.localeCompare(a.idea.createdAt)||a.idea.id.localeCompare(b.idea.id);
  rows.sort((a,b)=>{
    if(filters.sort==="price-low"||filters.sort==="price-high"){const key=filters.priceType==="use"?"usePrice":"viewPrice";return (a.idea[key]-b.idea[key])*(filters.sort==="price-low"?1:-1)||tie(a,b);}
    return (filters.sort==="relevance"?b.score-a.score:0)||tie(a,b);
  });
  const total=rows.length,pages=Math.max(1,Math.ceil(total/filters.limit)),page=Math.min(filters.page,pages);
  return {ideas:rows.slice((page-1)*filters.limit,page*filters.limit).map(x=>x.idea),total,pages,page,limit:filters.limit,facets,filters:{...filters,page}};
}
export function suggestCatalog(ideas,query,filters=DEFAULT_FILTERS){
  const q=compact(query);
  if(!q||query.length>100)return [];
  const candidates=new Map();
  for(const idea of ideas.filter(x=>x.status==="active"&&passes(x,filters))){
    for(const value of [idea.title,...idea.tags]){
      if(compact(value).includes(q)||initials(value).replace(/\s/g,"").includes(normalizeText(query)))candidates.set(value,{label:value,kind:value===idea.title?"아이디어":"태그",q:value});
    }
  }
  return [...candidates.values()].sort((a,b)=>(a.kind==="태그"?0:1)-(b.kind==="태그"?0:1)||a.label.length-b.label.length).slice(0,6);
}
