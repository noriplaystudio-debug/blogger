export const PATENT_POLICY_VERSION="2026-10-22-patent-v1";
export const PATENT_STATUSES=Object.freeze({unfiled:"미출원",pending:"출원 중",registered:"등록 신고",unsure:"확인 필요",not_applicable:"특허 검토 비대상 · 사유 확인"});
export const PATENT_JURISDICTIONS=Object.freeze({KR:"대한민국",US:"미국",EP:"유럽특허청",JP:"일본",CN:"중국",WO:"PCT 국제출원 경로 · 세계 특허권 아님"});
export const PATENT_AUTHORITIES=Object.freeze({creator:"본인의 창작·출원 · 권리관계 설명",authorized:"권리자로부터 허락받음",shared:"공동 창작·공동 권리",unsure:"소속기관·제3자 등 권리관계 확인 필요"});
export const PATENT_SEARCHES=Object.freeze({not_searched:"아직 검색하지 않음",self_searched:"판매자가 선행기술을 검색함",references_found:"유사한 자료·특허를 발견함"});
export const PATENT_TRANSFERS=Object.freeze({excluded:"특허권 양도·실시허락은 포함하지 않음",separate_contract:"특허 관련 권리는 별도 계약·절차로 협의"});
export const PATENT_REVIEW_OUTCOMES=Object.freeze({pending:"권리 자료 검토 대기",recorded:"권리 자료 기록 · 법률 판단 제외",needs_info:"권리 자료 보완 필요",expert_required:"변리사 검토 필요"});
export const PATENT_OWNERSHIP_REVIEWS=Object.freeze({self_declared:"판매자 신고만 확인",source_compared:"제공 자료와 권리자·권한 근거 대조",needs_more:"권한 근거 보완 필요",expert_required:"전문가 검토 필요"});
export const PATENT_NOVELTY_REVIEWS=Object.freeze({not_assessed:"특허 등록 가능성 미판단",references_recorded:"선행기술 참고자료 기록 · 등록 가능성 미판단",expert_required:"신규성·진보성 전문가 검토 필요"});
export const PATENT_FTO_REVIEWS=Object.freeze({not_assessed:"타인 특허 침해 여부 미판단",expert_required:"청구범위·존속상태·국가별 전문가 검토 필요"});
export const PATENT_PUBLICATION_NOTICE="출원 전 공개는 국내외 특허 취득에 영향을 줄 수 있어요. 공개 요약·커버도 공개에 해당할 수 있으니 출원과 비밀유지 필요성을 먼저 확인하세요. 공개 특허 검색에는 아직 공개되지 않은 출원이 나타나지 않을 수 있어요.";
export const PATENT_PURCHASE_NOTICE="아이디어 자료의 독점 사용 조건과 특허권은 별개입니다. 이 구매로 특허권 양도·실시허락이나 타인 특허에 대한 사용 허락이 자동으로 생기지 않습니다. 운영자의 자료 기록은 특허 등록 가능성·유효성·비침해를 보증하지 않습니다.";
export const PATENT_ACKNOWLEDGMENT="특허 현황과 권한 근거를 사실대로 신고하며 공개 범위와 출원 전 공개 위험을 확인했습니다. 필요한 특허권 양도·실시허락은 별도 계약과 절차로 정하고, 플랫폼의 자료 기록이 법률 판단이나 권리 보증이 아님을 확인합니다.";
export const PATENT_PORTALS=Object.freeze([{label:"KIPRIS 공개 특허 검색",url:"https://www.kipris.or.kr/"},{label:"WIPO PATENTSCOPE",url:"https://patentscope.wipo.int/"}]);
export function patentSourceUrl(value){
 try{
  const u=new URL(value),hosts=["kipris.or.kr","kipo.go.kr","patent.go.kr","wipo.int","epo.org","uspto.gov","j-platpat.inpit.go.jp","cnipa.gov.cn"];
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||!hosts.some(host=>u.hostname===host||u.hostname.endsWith("."+host)))return null;
  if([...u.searchParams.keys()].some(key=>/secret|token|servicekey|accesskey|apikey|authorization|credential/i.test(key.replace(/[^a-z]/gi,""))))return null;
  return u.href;
 }catch{return null;}
}
export const PATENT_FIELDS=Object.freeze({patentStatus:24,patentJurisdiction:8,patentNumber:40,patentHolder:120,patentAuthority:24,patentScope:1000,patentOwnershipNote:2000,patentPriorArt:24,patentPriorArtNote:2000,patentTransfer:24,patentVisibility:10,patentNonApplicableReason:1000});
export function patentFromValues(values,acknowledged=false){
 return {status:values.patentStatus||"",jurisdiction:values.patentJurisdiction||"KR",number:values.patentNumber||"",holder:values.patentHolder||"",authority:values.patentAuthority||"",scope:values.patentScope||"",ownershipNote:values.patentOwnershipNote||"",priorArt:values.patentPriorArt||"",priorArtNote:values.patentPriorArtNote||"",transfer:values.patentTransfer||"",visibility:values.patentVisibility||"private",nonApplicableReason:values.patentNonApplicableReason||"",acknowledged,policyVersion:PATENT_POLICY_VERSION};
}
export function patentToValues(p={}){
 return Object.fromEntries(Object.keys(PATENT_FIELDS).map(key=>{const property=key.slice(6);return [key,p[property.charAt(0).toLowerCase()+property.slice(1)]||""];}));
}
export function patentDeclarationIssues(p){
 const errors=[];const error=(field,message)=>errors.push({field:"patent"+field.charAt(0).toUpperCase()+field.slice(1),message});
 if(!p||typeof p!=="object"||Array.isArray(p))return [{field:"patentStatus",message:"특허 현황과 권한 근거를 입력해 주세요."}];
 for(const [field,options,label] of [["status",PATENT_STATUSES,"특허 현황"],["jurisdiction",PATENT_JURISDICTIONS,"국가·출원 경로"],["authority",PATENT_AUTHORITIES,"권리관계"],["priorArt",PATENT_SEARCHES,"선행기술 검색 현황"],["transfer",PATENT_TRANSFERS,"특허 관련 권리 제공 범위"]])if(!Object.hasOwn(options,p[field]))error(field,label+"을 선택해 주세요.");
 for(const [field,max] of [["number",40],["holder",120],["scope",1000],["ownershipNote",2000],["priorArtNote",2000],["nonApplicableReason",1000]])if(typeof p[field]!=="string"||p[field].trim().length>max)error(field,"특허 자료의 입력 형식과 길이를 확인해 주세요.");
 const length=key=>typeof p[key]==="string"?p[key].trim().length:0;
 if(length("ownershipNote")<20)error("ownershipNote","직무발명·소속기관·공동 권리·허락 근거를 포함해 권리관계를 20자 이상 설명해 주세요.");
 if(p.status==="not_applicable"&&length("nonApplicableReason")<20)error("nonApplicableReason","특허 검토 비대상이라고 판단한 사유를 20자 이상 적어주세요. 저작권 등 다른 권리 확인은 별도예요.");
 if(p.status!=="not_applicable"&&length("scope")<20)error("scope","검토할 기술·구성·방법 또는 확인이 필요한 범위를 20자 이상 적어주세요.");
 if(["pending","registered"].includes(p.status)){
  if(length("holder")<2)error("holder","신고한 출원인·등록권자를 입력해 주세요. 운영 검토에만 사용돼요.");
  if(!/^[A-Za-z0-9 .()/+-]{5,40}$/.test(p.number||""))error("number","출원·등록 번호를 문서 표기대로 입력해 주세요.");
  else if(p.jurisdiction==="KR"&&!/^(10|20)[0-9]{7}(?:[0-9]{4})?$/.test(p.number.replace(/[ .()-]/g,"")))error("number","국내 특허·실용신안 번호의 형식을 확인해 주세요. 형식 검사는 권리 확인이 아니에요.");
 }else if(length("number")||length("holder"))error("number","출원·등록 번호와 권리자를 입력했다면 특허 현황도 함께 확인해 주세요.");
 if(p.priorArt!=="not_searched"&&length("priorArtNote")<20)error("priorArtNote","검색한 국가·날짜·자료와 유사점 등 확인한 내용을 20자 이상 적어주세요.");
 if(!["private","public"].includes(p.visibility))error("visibility","특허 번호의 공개 범위를 확인해 주세요.");
 if(p.acknowledged!==true||p.policyVersion!==PATENT_POLICY_VERSION)error("Acknowledged","특허·권리 안내와 공개 위험을 확인하고 동의해 주세요.");
 return errors;
}
