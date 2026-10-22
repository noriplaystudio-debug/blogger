import {CATALOG,MATURITY_LABELS} from "./catalog.js";
import {escapeHtml as h} from "./format.js";

// Initial operating references, not transaction-derived valuations. Keep this
// module shared by server responses, seller previews and buyer disclosures.
export const PRICE_GUIDE_VERSION="2026-10-21-advisory-v1";
export const PRICE_LEVELS=Object.freeze({
  seed:Object.freeze({view:3000,use:30000,criteria:["대상과 문제 또는 창작 의도가 구체적임","핵심 제안과 기존 사례와의 차이를 설명함"]}),
  developed:Object.freeze({view:10000,use:100000,criteria:["초기 아이디어의 기준을 충족함","제작·실행 단계와 필요한 자원을 설명함","제공하는 기획 자료와 제외 범위를 명시함"]}),
  professional:Object.freeze({view:30000,use:300000,criteria:["구체화 기획의 기준을 충족함","실험·제작·조사 등 확인 가능한 근거를 제공함","비용·일정의 가정과 미검증 부분을 구분함"]})
});
const examples=Object.freeze({
  product:"구조·도면·시제품과 실제 시험 결과, 제작 조건",software:"사용 흐름·화면 설계·작동 예시와 사용자 실험",service:"서비스 여정·운영 절차와 시범 운영 결과",
  business:"고객 조사·비용 가정·수익 구조와 확인한 수요",music:"데모·악곡 구성·편곡 계획과 제작 범위",art:"시안·제작 과정·재료와 제공 파일 범위",
  video:"시놉시스·콘티·테스트 영상과 제작 계획",writing:"구성안·샘플 원고·설정과 집필 범위",game:"규칙·플레이 예시·프로토타입과 플레이 테스트",
  performance:"대본·연출안·리허설 기록과 무대 조건",sports:"루틴·진행 방법·적용 대상과 시험 운영 기록",space:"공간 구성·도면·동선과 시공 조건",
  education:"교육 목표·커리큘럼·샘플 수업과 학습자 반응",research:"연구 질문·방법·실험 조건과 재현 가능한 기록",society:"해결 대상·운영 구조와 현장 조사 또는 시범 적용",other:"분야에 맞는 산출물·실행 방법과 확인 가능한 근거"
});
const won=n=>new Intl.NumberFormat("ko-KR").format(n)+"원";
export function priceGuideFor(idea){
  const maturity=Object.hasOwn(PRICE_LEVELS,idea.maturity)?idea.maturity:"seed",level=PRICE_LEVELS[maturity];
  const compare=(kind,value)=>{const price=value==null||value===""?NaN:Number(value);return {recommendedMax:level[kind],sellerPrice:Number.isSafeInteger(price)&&price>=0?price:null,above:Number.isSafeInteger(price)&&price>level[kind],difference:Number.isSafeInteger(price)?Math.max(0,price-level[kind]):0};};
  return {version:PRICE_GUIDE_VERSION,mode:"advisory",basis:"seller-declared-maturity",maturity,label:MATURITY_LABELS[maturity],categoryLabel:CATALOG[idea.category]?.label||"분야별 아이디어",criteria:[...level.criteria],example:examples[idea.category]||examples.other,
    view:compare("view",idea.viewPrice),use:compare("use",idea.usePrice),recommendedTotal:level.view+level.use,
    note:"판매자가 선택한 기획 수준에 따른 초기 운영 참고 기준입니다. 개별 자료의 품질·시세·사업성이나 법적 독점권을 보증하지 않습니다.",
    useBasis:"추가 독점 사용료는 열람료 권장 상한의 10배를 초기 참고액으로 정했습니다. 실제 거래 통계나 권리 감정으로 산정한 금액은 아닙니다."};
}
export function priceGuideHTML(guide,{kind=null,compact=false}={}){
  if(!guide)return "";
  const kinds=kind?[kind]:["view","use"],above=kinds.some(k=>guide[k].above);
  const rows=kinds.map(k=>{const item=guide[k],label=k==="view"?"상세 열람료":"추가 독점 사용료";
    return '<div class="guide-price-row"><span>'+label+' 권장 상한</span><strong>'+won(item.recommendedMax)+'</strong></div>'+(item.sellerPrice!==null?'<p class="guide-comparison'+(item.above?' above':'')+'">'+(item.above?'판매가가 권장 상한보다 '+won(item.difference)+' 높아요.':'판매가 '+won(item.sellerPrice)+' · 권장 범위 이내')+'</p>':"");}).join("");
  return '<section class="price-guidance'+(above?' has-higher-price':'')+'" aria-label="플랫폼 권장 가격 안내"><div class="guide-heading"><span>seed 가격 안내</span><strong>'+h(guide.label)+' 기준</strong></div>'+rows+'<p class="guide-source">판매자 선택 수준에 따른 초기 참고액 · 감정가·품질 보증 아님</p><p class="guide-freedom">판매자가 자유롭게 정한 가격입니다. 권장 상한을 넘어도 등록·구매할 수 있어요.</p>'+(above?'<p class="guide-caution">제공 자료와 사용 범위를 확인하고 판매가가 적절한지 다시 살펴보세요.</p>':"")+(compact?'': '<details><summary>이 금액을 안내하는 기준</summary><p>'+h(guide.note)+'</p><ul>'+guide.criteria.map(x=>'<li>'+h(x)+'</li>').join("")+'</ul><p>'+h(guide.categoryLabel)+' 예: '+h(guide.example)+'</p><p>'+h(guide.useBasis)+'</p><p>열람·추가 사용료는 별도이며, 권장 합계는 '+won(guide.recommendedTotal)+'입니다. 권장액에 맞춘 가격도 품질 보증을 뜻하지 않아요.</p><small>기준 버전 '+h(guide.version)+'</small></details>')+'</section>';
}
export function priceHintHTML(idea){
  const guide=idea.priceGuide||priceGuideFor(idea);
  return '<p class="card-price-guide'+(guide.view.above||guide.use.above?' above':'')+'">권장 상한 · 열람 '+won(guide.view.recommendedMax)+' / 추가 사용 '+won(guide.use.recommendedMax)+(guide.view.above||guide.use.above?' <span>권장액 초과 항목 있음</span>':'')+'</p>';
}
