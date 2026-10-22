import {PATENT_POLICY_VERSION} from "../public/assets/patent-policy.js";

export const patentDraft=Object.freeze({
 status:"unfiled",jurisdiction:"KR",number:"",holder:"",authority:"creator",
 scope:"직접 고안한 구조와 이용 순서를 기록한 기획이며 기술적 구성의 특허 검토는 별도로 진행할 계획입니다.",
 ownershipNote:"개인이 직접 만든 테스트 기획으로 소속기관의 직무발명이나 제삼자의 공동 권리를 포함하지 않습니다.",
 priorArt:"not_searched",priorArtNote:"",transfer:"excluded",visibility:"private",nonApplicableReason:"",
 acknowledged:true,policyVersion:PATENT_POLICY_VERSION
});
export const patentReview=Object.freeze({
 outcome:"recorded",ownership:"self_declared",novelty:"not_assessed",freedomToOperate:"not_assessed",
 sourceUrl:"",checkedDate:"",note:"판매자의 권리 신고 자료만 기록했으며 특허의 등록 가능성과 타인 특허 침해 여부는 판단하지 않았습니다.",
 expectedRevision:0,acknowledged:true,policyVersion:PATENT_POLICY_VERSION
});
