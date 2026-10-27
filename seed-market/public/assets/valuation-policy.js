export const VALUE_QUESTION_VERSION="2026-10-22-community-price-v1";
export const VALUE_QUESTION="같은 분량·완성도의 기획을 유료 상품으로 검토한다면, 얼마가 적절하다고 생각하나요?";
export const VALUE_NOTICE="무료 나눔 글은 계속 무료이며 기존 이용 조건도 유지됩니다. 열람료와 추가 단독 이용료를 각각 가정해 의견을 남겨주세요. 실제 구매 제안이나 결제가 아닙니다.";
export const VALUE_CONSENT="금액·완성도 의견·사유가 이름 없이 공개되고, 향후 권장 가격 기준을 검토하기 위한 통계에 사용됨을 확인했습니다.";
export const VALUE_KINDS=Object.freeze({view:"상세 열람료",use:"추가 단독 이용료"});
export const VALUE_LIMIT=100000000;
export const VALUE_THRESHOLDS=Object.freeze({perIdea:5,ideas:5,participants:20,creators:3,maxCreatorShare:0.4});
export const VALUE_BUCKETS=Object.freeze([
  {max:0,label:"무료 권장"},{max:3000,label:"1~3천원"},{max:10000,label:"3천원 초과~1만원"},{max:30000,label:"1만~3만원"},{max:100000,label:"3만~10만원"},{max:300000,label:"10만~30만원"},{max:1000000,label:"30만~100만원"},{max:VALUE_LIMIT,label:"100만원 초과"}
]);
