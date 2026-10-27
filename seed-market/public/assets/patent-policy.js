export const PATENT_POLICY_VERSION="2026-10-27-patent-reference-v2";
export const PATENT_STATUSES=Object.freeze({unfiled:"미출원",pending:"출원 중",registered:"등록 신고",unsure:"출원·등록 정보 미확인",not_applicable:"특허 관련 정보 없음 · 비대상"});
export const PATENT_JURISDICTIONS=Object.freeze({KR:"대한민국",US:"미국",EP:"유럽특허청",JP:"일본",CN:"중국",WO:"PCT 국제출원 경로 · 세계 특허권 아님"});
export const PATENT_AUTHORITIES=Object.freeze({creator:"본인의 창작·출원 · 권리관계 설명",authorized:"권리자로부터 허락받음",shared:"공동 창작·공동 권리",unsure:"소속기관·제3자 등 권리관계 확인 필요"});
export const PATENT_SEARCHES=Object.freeze({not_searched:"아직 검색하지 않음",self_searched:"판매자가 선행기술을 검색함",references_found:"유사한 자료·특허를 발견함"});
export const PATENT_TRANSFERS=Object.freeze({excluded:"특허권 양도·실시허락은 포함하지 않음",separate_contract:"특허 관련 권리는 별도 계약·절차로 협의"});
export const PATENT_REVIEW_OUTCOMES=Object.freeze({pending:"참고 정보 미정리",recorded:"참고자료 정리 · 법률 판단 제외",needs_info:"추가 정보 요청 · 거래 제한 없음",expert_required:"전문가 상담 권장 · 거래 제한 없음"});
export const PATENT_OWNERSHIP_REVIEWS=Object.freeze({self_declared:"판매자 신고만 확인",source_compared:"제공 자료와 권리자·권한 근거 대조",needs_more:"권한 근거 보완 필요",expert_required:"전문가 검토 필요"});
export const PATENT_NOVELTY_REVIEWS=Object.freeze({not_assessed:"특허 등록 가능성 미판단",references_recorded:"선행기술 참고자료 기록 · 등록 가능성 미판단",expert_required:"신규성·진보성 전문가 검토 필요"});
export const PATENT_FTO_REVIEWS=Object.freeze({not_assessed:"타인 특허 침해 여부 미판단",expert_required:"청구범위·존속상태·국가별 전문가 검토 필요"});
export const PATENT_PUBLICATION_NOTICE="출원 전 공개는 국내외 특허 취득에 영향을 줄 수 있어요. 공개 요약·커버도 공개에 해당할 수 있으니 출원과 비밀유지 필요성을 먼저 확인하세요. 공개 특허 검색에는 아직 공개되지 않은 출원이 나타나지 않을 수 있어요.";
export const PATENT_PURCHASE_NOTICE="아이디어 자료의 사이트 내 단독 이용 조건과 특허권은 별개입니다. 이 구매로 특허권 양도·실시허락이나 타인 특허에 대한 사용 허락이 자동으로 생기지 않습니다. 유사 문헌은 참고 정보이며 등록·구매 제한의 판정이 아닙니다. 플랫폼은 특허 등록 가능성·유효성·비침해를 보증하지 않습니다.";
export const PATENT_ACKNOWLEDGMENT="제공할 수 있는 특허 정보를 사실대로 안내하며 공개 범위와 출원 전 공개 영향을 확인했습니다. 필요한 특허권 양도·실시허락은 별도 계약과 절차로 정하고, 플랫폼의 자료 기록이 법률 판단이나 권리 보증이 아님을 확인합니다.";
export const PATENT_PORTALS=Object.freeze([{label:"KIPRIS 공개 특허 검색",url:"https://www.kipris.or.kr/"},{label:"WIPO PATENTSCOPE",url:"https://patentscope.wipo.int/"}]);
export function patentSourceUrl(value,{copies=false}={}){
 try{
  const u=new URL(value),hosts=["kipris.or.kr","kipo.go.kr","patent.go.kr","wipo.int","epo.org","uspto.gov","j-platpat.inpit.go.jp","cnipa.gov.cn",...(copies?["patents.google.com","patentimages.storage.googleapis.com"]:[])];
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||!hosts.some(host=>u.hostname===host||u.hostname.endsWith("."+host)))return null;
  if([...u.searchParams.keys()].some(key=>/secret|token|servicekey|accesskey|apikey|authorization|credential/i.test(key.replace(/[^a-z]/gi,""))))return null;
  return u.href;
 }catch{return null;}
}
export const PATENT_FIELDS=Object.freeze({patentStatus:24,patentJurisdiction:8,patentNumber:40,patentHolder:120,patentAuthority:24,patentScope:1000,patentOwnershipNote:2000,patentPriorArt:24,patentPriorArtNote:2000,patentTransfer:24,patentVisibility:10,patentNonApplicableReason:1000});
export function patentFromValues(values,acknowledged=false){
 return {status:values.patentStatus||"unsure",jurisdiction:values.patentJurisdiction||"KR",number:values.patentNumber||"",holder:values.patentHolder||"",authority:values.patentAuthority||"unsure",scope:values.patentScope||"",ownershipNote:values.patentOwnershipNote||"",priorArt:values.patentPriorArt||"not_searched",priorArtNote:values.patentPriorArtNote||"",transfer:values.patentTransfer||"excluded",visibility:values.patentVisibility||"private",nonApplicableReason:values.patentNonApplicableReason||"",acknowledged,policyVersion:PATENT_POLICY_VERSION};
}
export function patentToValues(p={}){
 return Object.fromEntries(Object.keys(PATENT_FIELDS).map(key=>{const property=key.slice(6);return [key,p[property.charAt(0).toLowerCase()+property.slice(1)]||""];}));
}
export function patentDeclarationIssues(p){
 const errors=[];const error=(field,message)=>errors.push({field:"patent"+field.charAt(0).toUpperCase()+field.slice(1),message});
 if(p==null)return [];
 if(typeof p!=="object"||Array.isArray(p))return [{field:"patentStatus",message:"특허 참고 정보의 입력 형식을 확인해 주세요."}];
 p={...patentFromValues({}),...p};
 for(const [field,options,label] of [["status",PATENT_STATUSES,"특허 현황"],["jurisdiction",PATENT_JURISDICTIONS,"국가·출원 경로"],["authority",PATENT_AUTHORITIES,"권리관계"],["priorArt",PATENT_SEARCHES,"선행기술 검색 현황"],["transfer",PATENT_TRANSFERS,"특허 관련 권리 제공 범위"]])if(!Object.hasOwn(options,p[field]))error(field,label+"을 선택해 주세요.");
 for(const [field,max] of [["number",40],["holder",120],["scope",1000],["ownershipNote",2000],["priorArtNote",2000],["nonApplicableReason",1000]])if(typeof p[field]!=="string"||p[field].trim().length>max)error(field,"특허 자료의 입력 형식과 길이를 확인해 주세요.");
 const length=key=>typeof p[key]==="string"?p[key].trim().length:0;
 if(["pending","registered"].includes(p.status)){
  if(!/^[A-Za-z0-9 .()/+-]{5,40}$/.test(p.number||""))error("number","출원·등록 번호를 문서 표기대로 입력해 주세요.");
  else if(p.jurisdiction==="KR"&&!/^(10|20)[0-9]{7}(?:[0-9]{4})?$/.test(p.number.replace(/[ .()-]/g,"")))error("number","국내 특허·실용신안 번호의 형식을 확인해 주세요. 형식 검사는 권리 확인이 아니에요.");
 }else if(length("number")||length("holder"))error("number","출원·등록 번호와 권리자를 입력했다면 특허 현황도 함께 확인해 주세요.");
 if(!["private","public"].includes(p.visibility))error("visibility","특허 번호의 공개 범위를 확인해 주세요.");
 return errors;
}

export const PATENT_REFERENCE_LIMIT=6;
export const PATENT_REFERENCE_KINDS=Object.freeze({application:"출원 공개 문헌 · 등록 여부 미확인",grant:"등록공보 · 현재 권리 존속 미확인",unknown:"공보 구분 미확인"});
export function patentDocumentKind(number){
 const n=String(number).toUpperCase().replace(/[ .()-]/g,"");
 if(/^WO[0-9]+/.test(n))return "application";
 if(/^US[0-9]{11}A[0-9]$/.test(n))return "application";
 if(/^US[0-9]{7,8}(A|B[0-9])$/.test(n))return "grant";
 if(/^(KR|EP|JP|CN)[0-9]+B[0-9]$/.test(n)||/^CN[0-9]+U$/.test(n))return "grant";
 if(/^(KR|EP|JP|CN)[0-9]+A[0-9]?$/.test(n))return "application";
 return "unknown";
}
