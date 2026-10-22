import {fail} from "./policy.mjs";
import {PATENT_POLICY_VERSION,PATENT_STATUSES,PATENT_REVIEW_OUTCOMES,PATENT_OWNERSHIP_REVIEWS,PATENT_NOVELTY_REVIEWS,PATENT_FTO_REVIEWS,PATENT_JURISDICTIONS,PATENT_TRANSFERS,PATENT_PURCHASE_NOTICE,patentDeclarationIssues,patentSourceUrl} from "../public/assets/patent-policy.js";

export function validatePatentDeclaration(input){
 const issues=patentDeclarationIssues(input);if(issues.length)fail(400,issues[0].message);
 const keys=["status","jurisdiction","number","holder","authority","scope","ownershipNote","priorArt","priorArtNote","transfer","visibility","nonApplicableReason"];
 return {...Object.fromEntries(keys.map(k=>[k,input[k].trim()])),policyVersion:PATENT_POLICY_VERSION,acknowledged:true};
}
export async function patentRecord(db,id){return db.prepare("SELECT * FROM idea_patents WHERE idea_id=?").bind(id).first();}
export function publicPatent(row){
 if(!row)return {stamp:"unreported",state:"unreported",statusLabel:"특허 정보 미제공",reviewLabel:"기존 등록 글 · 권리 자료 미확인",notice:PATENT_PURCHASE_NOTICE,policyVersion:PATENT_POLICY_VERSION,number:null,sourceUrl:null};
 const d=JSON.parse(row.declaration),r=row.review?JSON.parse(row.review):null;
 return {stamp:row.listing_version+":"+row.revision,state:row.review_state,status:d.status,statusLabel:PATENT_STATUSES[d.status]+" · 판매자 신고",jurisdiction:d.jurisdiction,jurisdictionLabel:PATENT_JURISDICTIONS[d.jurisdiction],reviewLabel:PATENT_REVIEW_OUTCOMES[row.review_state],ownership:r?PATENT_OWNERSHIP_REVIEWS[r.ownership]:"권리자·거래 권한 미확인",novelty:r?PATENT_NOVELTY_REVIEWS[r.novelty]:"특허 등록 가능성 미판단",freedomToOperate:r?PATENT_FTO_REVIEWS[r.freedomToOperate]:"타인 특허 침해 여부 미판단",transfer:d.transfer,transferLabel:PATENT_TRANSFERS[d.transfer],number:d.visibility==="public"&&["pending","registered"].includes(d.status)?d.number:null,sourceUrl:d.visibility==="public"&&r?.sourceUrl?r.sourceUrl:null,reviewedAt:row.reviewed_at||null,notice:PATENT_PURCHASE_NOTICE,policyVersion:PATENT_POLICY_VERSION};
}
export function privatePatent(row){return row?{declaration:JSON.parse(row.declaration),review:row.review?JSON.parse(row.review):null,revision:row.revision,listingVersion:row.listing_version}:null;}
export function patentDeclarationStatement(db,{id,version,declaration,time,guard,guardParams}){
 return db.prepare("INSERT INTO idea_patents(idea_id,listing_version,declaration,review_state,revision,declared_at) SELECT ?,?,?,'pending',0,? WHERE "+guard+" ON CONFLICT(idea_id) DO UPDATE SET listing_version=excluded.listing_version,declaration=excluded.declaration,review_state='pending',revision=0,review=NULL,review_token=NULL,reviewer_id=NULL,reviewed_at=NULL,declared_at=excluded.declared_at").bind(id,version,JSON.stringify(declaration),time,...guardParams);
}
export function officialPatentUrl(value){
 if(value===""||value==null)return "";
 if(typeof value!=="string"||value.length>1500)fail(400,"확인한 공식 자료 주소를 입력해 주세요.");
 const url=patentSourceUrl(value);
 if(!url)fail(400,"인증키가 없는 KIPRIS·지식재산처·WIPO 등 공식 특허정보 HTTPS 주소만 기록할 수 있어요.");
 return url;
}
export function validatePatentReview(input,row,publicationStatus){
 if(!row)return null;
 if(!input){if(publicationStatus==="approved")fail(400,"특허·권리 자료의 검토 결과를 먼저 기록해 주세요.");return null;}
 if(input.expectedRevision!==row.revision)fail(409,"다른 운영자가 권리 자료를 검토했어요. 최신 자료를 다시 확인해 주세요.");
 for(const [key,options] of [["outcome",PATENT_REVIEW_OUTCOMES],["ownership",PATENT_OWNERSHIP_REVIEWS],["novelty",PATENT_NOVELTY_REVIEWS],["freedomToOperate",PATENT_FTO_REVIEWS]])if(!Object.hasOwn(options,input[key])||(key==="outcome"&&input[key]==="pending"))fail(400,"특허·권리 검토의 세 항목과 처리 결과를 선택해 주세요.");
 if(typeof input.note!=="string"||input.note.trim().length<20||input.note.length>2000)fail(400,"권리 자료의 확인 근거와 판단하지 않은 범위를 20~2,000자로 기록해 주세요.");
 if(input.acknowledged!==true||input.policyVersion!==PATENT_POLICY_VERSION)fail(400,"자료 기록과 법률 판단의 범위를 확인해 주세요.");
 const sourceUrl=officialPatentUrl(input.sourceUrl),d=JSON.parse(row.declaration);
 if(input.checkedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(input.checkedDate))fail(400,"자료 확인일의 형식을 확인해 주세요.");
 if(sourceUrl&&!input.checkedDate)fail(400,"공식 자료를 확인한 날짜를 적어주세요.");
 if(input.checkedDate){const date=new Date(input.checkedDate+"T00:00:00Z");if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input.checkedDate||input.checkedDate>new Date().toISOString().slice(0,10))fail(400,"실제 자료 확인일을 입력해 주세요.");}
 if(input.outcome==="recorded"){
  if(d.authority==="unsure"||["needs_more","expert_required"].includes(input.ownership)||input.novelty==="expert_required"||input.freedomToOperate==="expert_required")fail(400,"확인되지 않은 권한이나 전문가 검토 필요 항목을 먼저 보완해 주세요.");
  if(["pending","registered"].includes(d.status)&&(input.ownership!=="source_compared"||!sourceUrl||!input.checkedDate))fail(400,"출원·등록 신고는 공식 기록 주소·확인일과 권한 근거 대조가 필요해요.");
  if(["authorized","shared"].includes(d.authority)&&input.ownership!=="source_compared")fail(400,"허락받은 권리·공동 권리의 거래 권한 근거를 대조해 주세요.");
 }
 if(publicationStatus==="approved"&&input.outcome!=="recorded")fail(400,"보완·변리사 검토가 필요한 아이디어는 공개 승인할 수 없어요.");
 return {outcome:input.outcome,ownership:input.ownership,novelty:input.novelty,freedomToOperate:input.freedomToOperate,note:input.note.trim(),sourceUrl,checkedDate:input.checkedDate||"",policyVersion:PATENT_POLICY_VERSION};
}
export function patentPurchaseGuard(row,id){
 return row?{sql:"EXISTS(SELECT 1 FROM idea_patents p WHERE p.idea_id=? AND p.listing_version=? AND p.revision=? AND p.review_state='recorded' AND p.listing_version=(SELECT version FROM idea_quality WHERE idea_id=p.idea_id))",params:[row.idea_id,row.listing_version,row.revision]}:{sql:"NOT EXISTS(SELECT 1 FROM idea_patents WHERE idea_id=?)",params:[id]};
}
export function patentIntegrationSettings(env){
 return {mode:"manual",automaticLookupEnabled:false,keyConfigured:typeof env.KIPRIS_PLUS_API_KEY==="string"&&Boolean(env.KIPRIS_PLUS_API_KEY.trim()),productApprovalDeclared:env.KIPRIS_PLUS_PRODUCT_APPROVED==="true",portal:"https://plus.kipris.or.kr/",note:"현재는 운영자가 공식 사이트의 자료를 직접 대조합니다. 인증키 등록만으로 자동 조회·법률 검토가 활성화되지 않습니다. 서비스 신청·상품 승인과 별도 연동 검증이 필요합니다."};
}
