import {escapeHtml as h} from "./format.js";
import {PLATFORM_NOTICE} from "./platform-policy.js";
export function platformNoticeHTML({compact=false}={}){
 const n=PLATFORM_NOTICE;
 return '<section class="platform-notice '+(compact?'is-compact':'')+'" aria-label="아이디어 거래 목적과 확인 범위" data-notice-version="'+h(n.version)+'"><p class="notice-date">서비스 운영 원칙 · '+h(n.date)+'</p><h3>'+h(n.title)+'</h3><p>'+h(n.purpose)+'</p>'+(compact?'<p>'+h("유사 특허는 참고 정보이며 등록·구매를 막는 판정이 아닙니다. 자료 구매는 권리 확보·법적 독점성·사업 성과의 보증을 뜻하지 않습니다.")+'</p><button type="button" class="text-button" data-action="notice">공지·거래 원칙 전문 확인</button>':'<ol>'+n.points.map(x=>'<li>'+h(x)+'</li>').join("")+'</ol>')+'<p class="notice-limits">'+h(n.limits)+'</p></section>';
}
