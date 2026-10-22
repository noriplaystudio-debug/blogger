import {CATALOG,MATURITY_LABELS} from "../public/assets/catalog.js";
import {PRICE_LEVELS} from "../public/assets/pricing.js";
import {SHARE_LICENSES} from "../public/assets/sharing-policy.js";
import {VALUE_BUCKETS,VALUE_THRESHOLDS,VALUE_QUESTION_VERSION} from "../public/assets/valuation-policy.js";

export async function shareValueHash(row){
  const value=JSON.stringify({title:row.title,summary:row.summary,body:row.body,category:row.category,topic:row.topic,license:row.license,licenseText:row.license_text??row.licenseText,termsVersion:row.terms_version??row.termsVersion});
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function quantile(sorted,p){
  if(!sorted.length)return null;
  const index=(sorted.length-1)*p,lower=Math.floor(index),fraction=index-lower;
  return Math.round((sorted[lower]+fraction*((sorted[lower+1]??sorted[lower])-sorted[lower]))*100)/100;
}
export function amountSummary(values){
  const sorted=[...values].sort((a,b)=>a-b),count=sorted.length,q1=quantile(sorted,.25),q3=quantile(sorted,.75),iqr=count?q3-q1:0;
  return {count,median:quantile(sorted,.5),q1,q3,min:sorted[0]??null,max:sorted.at(-1)??null,zeroCount:sorted.filter(x=>x===0).length,
    outlierCount:sorted.filter(x=>x<q1-1.5*iqr||x>q3+1.5*iqr).length,
    buckets:VALUE_BUCKETS.map((bucket,index)=>({label:bucket.label,count:sorted.filter(x=>x<=bucket.max&&(index===0||x>VALUE_BUCKETS[index-1].max)).length}))};
}
export function publicValueSummary(rows){
  return {participants:rows.length,maturityCounts:Object.fromEntries(Object.keys(MATURITY_LABELS).map(key=>[key,rows.filter(row=>row.maturity===key).length])),
    view:amountSummary(rows.flatMap(row=>row.view_amount===null?[]:[row.view_amount])),use:amountSummary(rows.flatMap(row=>row.use_amount===null?[]:[row.use_amount]))};
}
function balancedReference(rows,kind){
  const field=kind+"_amount",withAmounts=rows.filter(row=>row[field]!==null),byIdea=new Map();
  for(const row of withAmounts){if(!byIdea.has(row.share_id))byIdea.set(row.share_id,[]);byIdea.get(row.share_id).push(row);}
  const eligible=[...byIdea.values()].filter(list=>list.length>=VALUE_THRESHOLDS.perIdea),creatorIdeas=new Map();
  for(const list of eligible)creatorIdeas.set(list[0].author_id,(creatorIdeas.get(list[0].author_id)||0)+1);
  const participants=new Set(eligible.flatMap(list=>list.map(row=>row.user_id))).size,largestCreatorShare=eligible.length?Math.max(...creatorIdeas.values())/eligible.length:0;
  const checks={ideas:eligible.length>=VALUE_THRESHOLDS.ideas,participants:participants>=VALUE_THRESHOLDS.participants,creators:creatorIdeas.size>=VALUE_THRESHOLDS.creators,concentration:eligible.length>0&&largestCreatorShare<=VALUE_THRESHOLDS.maxCreatorShare};
  const medians=eligible.map(list=>amountSummary(list.map(row=>row[field])).median).sort((a,b)=>a-b),ready=Object.values(checks).every(Boolean);
  return {eligibleIdeas:eligible.length,eligibleParticipants:participants,eligibleCreators:creatorIdeas.size,largestCreatorShare:Math.round(largestCreatorShare*10000)/10000,checks,ready,
    // Each eligible idea has equal weight. This is a review statistic only.
    ideaMedian:ready?quantile(medians,.5):null,reviewP75:ready?quantile(medians,.75):null};
}
export function calibrationGroups(rows){
  const groups=new Map();
  for(const row of rows){const key=[row.category,row.maturity,row.license,row.terms_version||"legacy"].join(":");if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups].map(([key,list])=>{const first=list[0];return {key,category:first.category,categoryLabel:CATALOG[first.category]?.label||first.category,maturity:first.maturity,maturityLabel:MATURITY_LABELS[first.maturity],license:first.license,licenseTermsVersion:first.terms_version||"legacy",licenseLabel:SHARE_LICENSES[first.license]?.label,
    opinionCount:list.length,participants:new Set(list.map(row=>row.user_id)).size,ideas:new Set(list.map(row=>row.share_id)).size,creators:new Set(list.map(row=>row.author_id)).size,
    view:{...amountSummary(list.flatMap(row=>row.view_amount===null?[]:[row.view_amount])),currentReference:PRICE_LEVELS[first.maturity].view,balanced:balancedReference(list,"view")},
    use:{...amountSummary(list.flatMap(row=>row.use_amount===null?[]:[row.use_amount])),currentReference:PRICE_LEVELS[first.maturity].use,balanced:balancedReference(list,"use")}};
  }).sort((a,b)=>a.key.localeCompare(b.key));
}
export function valueSummaryCSV(report){
  const rows=[["질문 버전","집계 시각","기간 일수(0=전체)","참여 역할","자료 출처","통화","분야","참여자 판단 완성도","이용 조건","이용 조건 버전","가격 종류","의견 수","중앙값","하위25%","상위25%","무료 의견 수","참고값 대상 글 수","참고값 대상 계정 수","참고값 대상 작성자 수","최대 작성자 글 비중","검토 표본 충족","글별 중앙값의 75백분위","현재 권장 참고액"]];
  for(const group of report.groups)for(const kind of ["view","use"]){const s=group[kind],b=s.balanced;rows.push([VALUE_QUESTION_VERSION,report.generatedAt,report.filters.days,report.filters.role,"무료 나눔 가정 의견","KRW",group.categoryLabel,group.maturityLabel,group.licenseLabel,group.licenseTermsVersion,kind==="view"?"상세 열람료":"추가 독점 사용료",s.count,s.median,s.q1,s.q3,s.zeroCount,b.eligibleIdeas,b.eligibleParticipants,b.eligibleCreators,b.largestCreatorShare,b.ready?"충족":"부족",b.reviewP75,s.currentReference]);}
  const cell=value=>{let text=value==null?"":String(value);if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return "\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
