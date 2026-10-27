import {fail} from "./policy.mjs";
import {PATENT_POLICY_VERSION,PATENT_STATUSES,PATENT_REVIEW_OUTCOMES,PATENT_JURISDICTIONS,PATENT_TRANSFERS,PATENT_PURCHASE_NOTICE,patentDeclarationIssues,patentSourceUrl,patentFromValues,PATENT_REFERENCE_LIMIT,PATENT_REFERENCE_KINDS,patentDocumentKind} from "../public/assets/patent-policy.js";

export function validatePatentDeclaration(input){
 const issues=patentDeclarationIssues(input);if(issues.length)fail(400,issues[0].message);
 const data={...patentFromValues({}),...(input||{})},keys=["status","jurisdiction","number","holder","authority","scope","ownershipNote","priorArt","priorArtNote","transfer","visibility","nonApplicableReason"];
 return {...Object.fromEntries(keys.map(k=>[k,data[k].trim()])),policyVersion:PATENT_POLICY_VERSION,acknowledged:input?.acknowledged===true};
}
export async function patentRecord(db,id){return db.prepare("SELECT * FROM idea_patents WHERE idea_id=?").bind(id).first();}
const referenceProjection=x=>({number:x.number,title:x.title,jurisdiction:x.jurisdiction,kind:x.kind,kindLabel:PATENT_REFERENCE_KINDS[x.kind]||PATENT_REFERENCE_KINDS.unknown,url:x.url,checkedDate:x.checkedDate,note:x.note||"",legalStatus:"unverified",sourceType:x.sourceType});
export function publicPatent(row){
 const base={mode:"reference-only",blocking:false,notice:PATENT_PURCHASE_NOTICE,policyVersion:PATENT_POLICY_VERSION,legalStatus:"unverified"};
 if(!row)return {...base,stamp:"unreported",state:"unreported",statusLabel:"판매자 특허 정보 미제공",reviewLabel:"등록된 참고 문헌 없음",number:null,sourceUrl:null,references:[]};
 const d=JSON.parse(row.declaration),r=row.review?JSON.parse(row.review):null;
 return {...base,stamp:row.listing_version+":"+row.revision,state:row.review_state,status:d.status,statusLabel:d.status==="unsure"?PATENT_STATUSES.unsure:(PATENT_STATUSES[d.status]||PATENT_STATUSES.unsure)+" · 판매자 제공 정보",jurisdiction:d.jurisdiction,jurisdictionLabel:PATENT_JURISDICTIONS[d.jurisdiction],reviewLabel:PATENT_REVIEW_OUTCOMES[row.review_state],transfer:d.transfer,transferLabel:PATENT_TRANSFERS[d.transfer],number:d.visibility==="public"&&["pending","registered"].includes(d.status)?d.number:null,sourceUrl:d.visibility==="public"&&r?.sourceUrl?r.sourceUrl:null,reviewedAt:row.reviewed_at||null,references:Array.isArray(r?.references)?r.references.map(referenceProjection):[]};
}
export function privatePatent(row){return row?{declaration:JSON.parse(row.declaration),review:row.review?JSON.parse(row.review):null,revision:row.revision,listingVersion:row.listing_version}:null;}
export function patentDeclarationStatement(db,{id,version,declaration,time,guard,guardParams}){
 return db.prepare("INSERT INTO idea_patents(idea_id,listing_version,declaration,review_state,revision,declared_at) SELECT ?,?,?,'pending',0,? WHERE "+guard+" ON CONFLICT(idea_id) DO UPDATE SET listing_version=excluded.listing_version,declaration=excluded.declaration,review_state='pending',revision=0,review=NULL,review_token=NULL,reviewer_id=NULL,reviewed_at=NULL,declared_at=excluded.declared_at").bind(id,version,JSON.stringify(declaration),time,...guardParams);
}
export function officialPatentUrl(value){
 if(value===""||value==null)return "";
 if(typeof value!=="string"||value.length>1500)fail(400,"확인한 공식 자료 주소를 입력해 주세요.");
 const url=patentSourceUrl(value);if(!url)fail(400,"인증키가 없는 공식 특허정보 HTTPS 주소만 기록할 수 있어요.");return url;
}
function checkedDate(value,time){
 if(!value)return "";
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(400,"자료 확인일을 YYYY-MM-DD 형식으로 입력해 주세요.");
 const date=new Date(value+"T00:00:00Z"),today=new Date(new Date(time).getTime()+9*3600000).toISOString().slice(0,10);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||value>today)fail(400,"실제 자료 확인일을 입력해 주세요.");return value;
}
export function validatePatentReferences(input,time=new Date().toISOString()){
 if(input===undefined)return undefined;
 if(!Array.isArray(input)||input.length>PATENT_REFERENCE_LIMIT)fail(400,"유사 문헌은 최대 "+PATENT_REFERENCE_LIMIT+"건까지 기록할 수 있어요.");
 const seen=new Set();return input.map(x=>{
  if(!x||typeof x!=="object"||Array.isArray(x))fail(400,"유사 문헌의 입력 형식을 확인해 주세요.");
  const take=(key,min,max)=>{if(typeof x[key]!=="string"||x[key].trim().length<min||x[key].trim().length>max)fail(400,"문헌 번호·제목·주소·설명의 길이를 확인해 주세요.");return x[key].trim();};
  const number=take("number",5,40).toUpperCase().replace(/[ .()-]/g,""),title=take("title",2,160),note=x.note===undefined?"":take("note",0,500);
  if(!/^(KR|US|EP|JP|CN|WO)[0-9]{5,14}[A-Z][0-9]?$/.test(number)||!Object.hasOwn(PATENT_JURISDICTIONS,x.jurisdiction)||!number.startsWith(x.jurisdiction))fail(400,"국가와 공보 번호(예: KR102302296B1)를 확인해 주세요.");
  if(!Object.hasOwn(PATENT_REFERENCE_KINDS,x.kind))fail(400,"출원 공개·등록공보·미확인 중 구분을 선택해 주세요.");
  const inferred=patentDocumentKind(number);if(x.kind!=="unknown"&&inferred!=="unknown"&&inferred!==x.kind)fail(400,"공보 번호와 출원 공개·등록공보 구분이 맞는지 확인해 주세요.");
  const url=patentSourceUrl(take("url",8,1500),{copies:true});if(!url)fail(400,"공식 특허정보 또는 Google Patents 공보의 인증키 없는 HTTPS 주소를 입력해 주세요.");
  const u=new URL(url);if(u.hostname==="patents.google.com"&&(u.pathname.split("/")[2]||"").toUpperCase()!==number)fail(400,"문헌 번호와 Google Patents 원문 주소가 일치해야 해요.");
  const date=checkedDate(x.checkedDate,time);if(!date)fail(400,"문헌을 읽은 확인일을 입력해 주세요.");
  if(seen.has(number))fail(400,"같은 공보 번호는 한 번만 기록해 주세요.");seen.add(number);
  return {number,title,jurisdiction:x.jurisdiction,kind:x.kind,url,checkedDate:date,note,legalStatus:"unverified",sourceType:["patents.google.com","patentimages.storage.googleapis.com"].includes(u.hostname)?"publication-copy":"official-publication"};
 });
}
export function validatePatentReview(input,row,_publicationStatus,time=new Date().toISOString()){
 if(!input)return null;
 if(!row||input.expectedRevision!==row.revision)fail(409,"참고 정보가 변경됐어요. 최신 화면에서 다시 기록해 주세요.");
 if(!Object.hasOwn(PATENT_REVIEW_OUTCOMES,input.outcome))fail(400,"참고 정보의 정리 상태를 선택해 주세요.");
 if(typeof input.note!=="string"||input.note.trim().length<20||input.note.length>2000)fail(400,"참고 자료의 출처와 확인하지 않은 범위를 20~2,000자로 적어주세요.");
 if(input.acknowledged!==true||input.policyVersion!==PATENT_POLICY_VERSION)fail(400,"특허 정보는 거래 차단이나 법률 판단이 아닌 참고자료임을 확인해 주세요.");
 const previous=row.review?JSON.parse(row.review):{},sourceUrl=officialPatentUrl(input.sourceUrl===undefined?previous.sourceUrl:input.sourceUrl),date=checkedDate(input.checkedDate===undefined?previous.checkedDate:input.checkedDate,time);if(sourceUrl&&!date)fail(400,"자료 확인일을 입력해 주세요.");
 const references=validatePatentReferences(input.references,time);
 return {outcome:input.outcome,note:input.note.trim(),sourceUrl,checkedDate:date,references:references??(row.review?JSON.parse(row.review).references||[]:[]),mode:"reference-only",policyVersion:PATENT_POLICY_VERSION};
}
// The guard only protects the disclosure snapshot against concurrent edits. It never assesses patent risk.
export function patentPurchaseGuard(row,id){
 return row?{sql:"EXISTS(SELECT 1 FROM idea_patents p WHERE p.idea_id=? AND p.listing_version=? AND p.revision=? AND p.listing_version=COALESCE((SELECT version FROM idea_quality WHERE idea_id=p.idea_id),0))",params:[row.idea_id,row.listing_version,row.revision]}:{sql:"NOT EXISTS(SELECT 1 FROM idea_patents WHERE idea_id=?)",params:[id]};
}
export function patentIntegrationSettings(env){
 return {mode:"manual-reference-only",blocking:false,automaticLookupEnabled:false,keyConfigured:typeof env.KIPRIS_PLUS_API_KEY==="string"&&Boolean(env.KIPRIS_PLUS_API_KEY.trim()),productApprovalDeclared:env.KIPRIS_PLUS_PRODUCT_APPROVED==="true",portal:"https://plus.kipris.or.kr/",note:"특허는 참고 정보로 안내하며 미확인·유사 문헌·전문가 상담 권장 상태로 등록·구매를 막지 않습니다. 자동 조회는 미연결이며 인증키 등록만으로 켜지지 않습니다."};
}
