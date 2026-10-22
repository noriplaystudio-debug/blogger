import {fail} from "./policy.mjs";
import {isOperator} from "./commerce.mjs";
import {CATALOG,TOPICS} from "../public/assets/catalog.js";
import {SHARE_LICENSES,SHARE_TERMS_VERSION} from "../public/assets/sharing-policy.js";
import {shareValueHash} from "./valuation-data.mjs";

const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const selection="SELECT s.*,u.name AS author FROM shared_ideas s JOIN users u ON u.id=s.author_id";
const publicShare=row=>({id:row.id,title:row.title,summary:row.summary,category:row.category,topic:row.topic,author:row.author,license:row.license,licenseText:row.license_text,termsVersion:row.terms_version,createdAt:row.created_at,version:row.version});
const ownShare=row=>({...publicShare(row),body:row.body,status:row.status,reviewReason:row.review_reason});
function text(value,min,max,label){if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)fail(400,label+"은 "+min+"~"+max+"자로 입력해 주세요.");return value.trim();}
function shareInput(input){
  if(!Object.hasOwn(CATALOG,input.category)||TOPICS[input.topic]?.category!==input.category)fail(400,"종류에 맞는 세부 유형을 선택해 주세요.");
  if(!Object.hasOwn(SHARE_LICENSES,input.license)||input.agree!==true||input.termsVersion!==SHARE_TERMS_VERSION)fail(400,"무료 공개와 이용 조건을 확인하고 동의해 주세요.");
  return {title:text(input.title,6,80,"제목"),summary:text(input.summary,30,300,"요약"),body:text(input.body,80,12000,"본문"),category:input.category,topic:input.topic,license:input.license};
}
export async function handleSharing({path,method,request,url,db,member,identity,env,bodyJSON,json}){
  if(!path.startsWith("/api/shares")&&!path.startsWith("/api/admin/shares"))return null;
  const admin=()=>{if(!identity)fail(401,"로그인 후 이용해 주세요.");if(!isOperator(identity,env))fail(403,"운영자만 이용할 수 있어요.");};
  if(path==="/api/shares"&&method==="GET"){
    const category=url.searchParams.get("category")||"all",q=(url.searchParams.get("q")||"").trim(),page=Number(url.searchParams.get("page")||1),limit=12;
    if(category!=="all"&&!Object.hasOwn(CATALOG,category))fail(400,"아이디어 종류를 확인해 주세요.");
    if(q.length>100||!Number.isSafeInteger(page)||page<1||page>10000)fail(400,"검색어 또는 페이지를 확인해 주세요.");
    const search="%"+q.replace(/[\\%_]/g,"\\$&")+"%",where="s.status='published' AND (?='all' OR s.category=?) AND (s.title LIKE ? ESCAPE '\\' OR s.summary LIKE ? ESCAPE '\\')",params=[category,category,search,search];
    const total=(await db.prepare("SELECT count(*) AS n FROM shared_ideas s WHERE "+where).bind(...params).first()).n;
    const pages=Math.max(1,Math.ceil(total/limit)),current=Math.min(page,pages);
    const rows=await db.prepare(selection+" WHERE "+where+" ORDER BY s.created_at DESC,s.id LIMIT ? OFFSET ?").bind(...params,limit,(current-1)*limit).all();
    return json({shares:rows.results.map(publicShare),total,page:current,pages});
  }
  if(path==="/api/shares/mine"&&method==="GET"){
    const me=member();const rows=await db.prepare(selection+" WHERE s.author_id=? ORDER BY s.created_at DESC LIMIT 200").bind(me.id).all();
    return json({shares:rows.results.map(ownShare)});
  }
  const receipt=path.match(/^\/api\/shares\/requests\/([a-zA-Z0-9-]{8,128})$/);
  if(receipt&&method==="GET"){
    const me=member(),requestId=await digest(me.id+"\n"+receipt[1]);
    const saved=await db.prepare("SELECT id FROM shared_ideas WHERE request_id=? AND author_id=?").bind(requestId,me.id).first();
    if(!saved)fail(404,"아직 접수된 나눔 글이 없어요.");
    return json({id:saved.id});
  }
  if(path==="/api/admin/shares"&&method==="GET"){
    admin();const rows=await db.prepare(selection+" ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.created_at DESC LIMIT 200").all();
    return json({shares:rows.results.map(ownShare)});
  }
  const review=path.match(/^\/api\/admin\/shares\/([a-zA-Z0-9-]+)\/review$/);
  if(review&&method==="POST"){
    admin();const input=await bodyJSON(request),reason=text(input.reason,10,1000,"검토 사유");
    if(!["published","rejected","hidden"].includes(input.status)||!["pending","published","rejected","hidden"].includes(input.expectedStatus)||!Number.isSafeInteger(input.expectedVersion))fail(400,"검토 상태와 버전을 확인해 주세요.");
    if(input.expectedStatus==="hidden")fail(409,"숨긴 글은 재공개하지 않아요. 작성자가 새 글로 이용 조건을 확인하고 등록해야 해요.");
    const time=new Date().toISOString();
    const result=await db.batch([
      db.prepare("UPDATE shared_ideas SET status=?,review_reason=?,reviewer_id=?,reviewed_at=?,version=version+1 WHERE id=? AND status=? AND version=?").bind(input.status,reason,identity.id,time,review[1],input.expectedStatus,input.expectedVersion),
      db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,'share.review',?,?,? WHERE changes()=1").bind("event-"+crypto.randomUUID(),identity.id,review[1],JSON.stringify({status:input.status,reason}),time)
    ]);
    if(!result[0].meta.changes)fail(409,"검토 상태가 바뀌었어요. 최신 글을 다시 확인해 주세요.");
    return json({status:input.status});
  }
  const match=path.match(/^\/api\/shares\/([a-zA-Z0-9-]+)$/);
  const change=path.match(/^\/api\/shares\/([a-zA-Z0-9-]+)\/(revise|hide)$/);
  if(change&&method==="POST"){
    const me=member(),input=await bodyJSON(request);
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)fail(400,"수정할 글의 버전을 확인해 주세요.");
    const row=await db.prepare("SELECT id,status,version FROM shared_ideas WHERE id=? AND author_id=?").bind(change[1],me.id).first();
    if(!row)fail(404,"내 나눔 글을 찾을 수 없어요.");
    const time=new Date().toISOString(),revise=change[2]==="revise";
    if(revise&&!["pending","rejected"].includes(row.status))fail(409,"검토 대기·반려 글만 수정할 수 있어요. 공개된 글은 숨김 처리할 수 있어요.");
    if(revise&&row.status==="rejected"&&(await db.prepare("SELECT count(*) AS n FROM shared_ideas WHERE author_id=? AND status='pending'").bind(me.id).first()).n>=10)fail(429,"검토 대기 글은 최대 10개까지 등록할 수 있어요.");
    const data=revise?shareInput(input):null;
    const statement=revise?db.prepare("UPDATE shared_ideas SET title=?,summary=?,body=?,category=?,topic=?,license=?,license_text=?,terms_version=?,status='pending',review_reason=NULL,reviewer_id=NULL,reviewed_at=NULL,version=version+1 WHERE id=? AND author_id=? AND version=? AND status IN ('pending','rejected') AND (status='pending' OR (SELECT count(*) FROM shared_ideas WHERE author_id=?)<10)").bind(data.title,data.summary,data.body,data.category,data.topic,data.license,SHARE_LICENSES[data.license].text,SHARE_TERMS_VERSION,row.id,me.id,input.expectedVersion,me.id):db.prepare("UPDATE shared_ideas SET status='hidden',version=version+1 WHERE id=? AND author_id=? AND version=? AND status!='hidden'").bind(row.id,me.id,input.expectedVersion);
    const statements=[statement,db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1").bind("event-"+crypto.randomUUID(),me.id,revise?"share.revise":"share.hide",row.id,JSON.stringify({previousVersion:input.expectedVersion}),time)];
    if(revise)statements.push(db.prepare("INSERT INTO share_value_sources(share_id,content_hash,source_version,updated_at) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(share_id) DO UPDATE SET content_hash=excluded.content_hash,source_version=excluded.source_version,updated_at=excluded.updated_at").bind(row.id,await shareValueHash({...data,license_text:SHARE_LICENSES[data.license].text,terms_version:SHARE_TERMS_VERSION}),input.expectedVersion+1,time));
    const result=await db.batch(statements);
    if(!result[0].meta.changes)fail(409,"글이나 검토 상태가 바뀌었어요. 내 나눔 글에서 접수 결과를 확인해 주세요.");
    return json({id:row.id,status:revise?"pending":"hidden",version:input.expectedVersion+1});
  }
  if(match&&method==="GET"){
    const row=await db.prepare(selection+" WHERE s.id=?").bind(match[1]).first();
    const own=Boolean(row&&identity?.id===row.author_id),operator=isOperator(identity,env);
    if(!row||(row.status!=="published"&&!own&&!operator))fail(404,"공개된 나눔 글을 찾을 수 없어요.");
    return json({share:{...(own||operator?ownShare(row):publicShare(row)),body:row.body},own,canModerate:operator});
  }
  if(path==="/api/shares"&&method==="POST"){
    const me=member(),input=await bodyJSON(request),key=request.headers.get("Idempotency-Key");
    if(!key||!/^[a-zA-Z0-9-]{8,128}$/.test(key))fail(400,"등록 요청 식별자를 확인해 주세요.");
    const data=shareInput(input);
    const payload=await digest(JSON.stringify(data)),requestId=await digest(me.id+"\n"+key);
    const replay=async()=>{const saved=await db.prepare("SELECT id,payload_hash FROM shared_ideas WHERE request_id=? AND author_id=?").bind(requestId,me.id).first();if(saved&&saved.payload_hash!==payload)fail(409,"같은 요청 번호의 내용이 달라졌어요. 내 나눔 글에서 접수 결과를 확인해 주세요.");return saved;};
    const previous=await replay();if(previous)return json({id:previous.id,duplicate:true});
    const id="share-"+crypto.randomUUID(),time=new Date().toISOString();
    const result=await db.batch([
      db.prepare("INSERT OR IGNORE INTO shared_ideas(id,author_id,title,summary,body,category,topic,license,license_text,terms_version,status,version,request_id,payload_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,'pending',1,?,?,? WHERE (SELECT count(*) FROM shared_ideas WHERE author_id=? AND status='pending')<10").bind(id,me.id,data.title,data.summary,data.body,data.category,data.topic,data.license,SHARE_LICENSES[data.license].text,SHARE_TERMS_VERSION,requestId,payload,time,me.id),
      db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,'share.create',?,?,? WHERE changes()=1").bind("event-"+crypto.randomUUID(),me.id,id,JSON.stringify({license:data.license}),time),
      db.prepare("INSERT INTO share_value_sources(share_id,content_hash,source_version,updated_at) SELECT ?,?,?,? WHERE changes()=1").bind(id,await shareValueHash({...data,license_text:SHARE_LICENSES[data.license].text,terms_version:SHARE_TERMS_VERSION}),1,time)
    ]);
    if(!result[0].meta.changes){const saved=await replay();if(saved)return json({id:saved.id,duplicate:true});fail(429,"검토 대기 글은 최대 10개까지 등록할 수 있어요.");}
    return json({id,status:"pending",note:"나눔 글은 검토 후 무료로 공개돼요."},201);
  }
  return null;
}
