import {validateListing,fail,SELLER_TERMS_VERSION,sellerTermsText} from "./policy.mjs";
import {commerceSettings,listingCommerce} from "./commerce.mjs";
import {CATALOG,TAXONOMY_VERSION} from "../public/assets/catalog.js";

const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const editable="i.status='active' AND r.status IN ('pending','rejected') AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.idea_id=i.id)";
export async function listingEditable(db,id,sellerId){
  return Boolean(await db.prepare("SELECT 1 FROM ideas i JOIN idea_reviews r ON r.idea_id=i.id JOIN idea_quality q ON q.idea_id=i.id WHERE i.id=? AND i.seller_id=? AND "+editable).bind(id,sellerId).first());
}
export async function editableListingIds(db,sellerId){
  const rows=await db.prepare("SELECT i.id FROM ideas i JOIN idea_reviews r ON r.idea_id=i.id JOIN idea_quality q ON q.idea_id=i.id WHERE i.seller_id=? AND "+editable).bind(sellerId).all();
  return new Set(rows.results.map(row=>row.id));
}

// The request record is written in the same transaction as the listing. A unique
// per-attempt token keeps a concurrent replay from changing an already saved row.
export async function handleListings({path,method,request,db,member,bodyJSON,json}){
  const match=path.match(/^\/api\/ideas\/([a-zA-Z0-9-]+)\/(edit|revise)$/);
  const lookup=path.match(/^\/api\/listing-requests\/([a-zA-Z0-9-]{8,128})$/);
  if(!(path==="/api/ideas"&&method==="POST")&&!match&&!lookup)return null;
  const seller=member("seller"),target=match?.[1];
  if(lookup&&method==="GET"){
    const requestId="listing-"+await digest(seller.id+"\n"+lookup[1]);
    const prior=await db.prepare("SELECT l.idea_id,l.version,r.status FROM listing_requests l JOIN idea_reviews r ON r.idea_id=l.idea_id WHERE l.id=? AND l.seller_id=?").bind(requestId,seller.id).first();
    if(!prior)fail(404,"아직 접수된 등록 요청이 없어요.");
    return json({id:prior.idea_id,version:prior.version,reviewStatus:prior.status});
  }
  if(lookup)return null;
  const idea=target?await db.prepare("SELECT * FROM ideas WHERE id=? AND seller_id=?").bind(target,seller.id).first():null;
  if(target&&!idea)fail(404,"내 아이디어를 찾을 수 없어요.");
  if(match?.[2]==="edit"&&method==="GET"){
    if(!await listingEditable(db,target,seller.id))fail(409,"결제 이력이 없는 검토 대기·반려 아이디어만 수정할 수 있어요.");
    const detail=await db.prepare("SELECT * FROM idea_details WHERE idea_id=?").bind(target).first();
    const quality=await db.prepare("SELECT * FROM idea_quality WHERE idea_id=?").bind(target).first();
    const classification=await db.prepare("SELECT * FROM idea_classification WHERE idea_id=?").bind(target).first();
    const review=await db.prepare("SELECT reason FROM idea_reviews WHERE idea_id=?").bind(target).first();
    const images=await db.prepare("SELECT id,kind,content_type,size FROM uploads WHERE idea_id=? ORDER BY created_at,id").bind(target).all();
    const commerce=await listingCommerce(db,target);
    return json({id:target,version:quality.version,reviewReason:review.reason,commerce,sellerTerms:{version:SELLER_TERMS_VERSION,text:sellerTermsText(commerce)},input:{title:idea.title,summary:idea.summary,category:classification?.kind||idea.category,topic:classification?.topic||"",domainIds:JSON.parse(classification?.domains||"[]"),maturity:idea.maturity,viewPrice:idea.view_price,usePrice:idea.use_price,tags:JSON.parse(idea.tags),problem:detail.problem,solution:detail.solution,audience:detail.audience,execution:detail.execution,deliverables:JSON.parse(detail.deliverables),originality:quality.originality,validationNote:quality.validation_note,risks:quality.risks},images:images.results.map((img,index)=>({id:img.id,kind:img.kind,name:(img.kind==="public"?"공개 커버":"기존 상세 이미지 "+(index+1)),type:img.content_type,size:img.size,url:"/api/images/"+img.id,retained:true}))});
  }
  if(method!=="POST"||match?.[2]==="edit")return null;
  const input=await bodyJSON(request),data=validateListing(input),kind=target?"revise":"create";
  if(input.sellerAgreement!==true||input.sellerTermsVersion!==SELLER_TERMS_VERSION)fail(400,"판매 수수료와 정산 정책을 확인하고 동의해 주세요.");
  if(target&&(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1))fail(400,"수정할 등록 버전을 확인해 주세요.");
  const suppliedKey=request.headers.get("Idempotency-Key");
  if(suppliedKey&&!/^[a-zA-Z0-9-]{8,128}$/.test(suppliedKey))fail(400,"등록 요청 식별자를 확인해 주세요.");
  if(target&&!suppliedKey)fail(400,"재검토 요청 식별자가 필요해요.");
  const requestId="listing-"+await digest(seller.id+"\n"+(suppliedKey||crypto.randomUUID()));
  const payloadHash=await digest(JSON.stringify({kind,target:target||null,data,expectedVersion:input.expectedVersion||null,feeQuote:input.feeQuote,terms:input.sellerTermsVersion}));
  const replay=async()=>{
    const prior=await db.prepare("SELECT * FROM listing_requests WHERE id=? AND seller_id=?").bind(requestId,seller.id).first();
    if(!prior)return null;
    if(prior.payload_hash!==payloadHash)fail(409,"같은 요청 번호의 내용이 달라졌어요. 저장 결과를 확인한 뒤 새 요청으로 제출해 주세요.");
    const review=await db.prepare("SELECT status FROM idea_reviews WHERE idea_id=?").bind(prior.idea_id).first();
    return json({id:prior.idea_id,version:prior.version,reviewStatus:review?.status,duplicate:true,note:"이미 접수된 요청입니다. 중복 등록하지 않았어요."});
  };
  const previous=await replay();if(previous)return previous;
  const settings=target?await listingCommerce(db,target):await commerceSettings(db);
  if(!input.feeQuote||["viewBps","useBps","holdDays"].some(key=>input.feeQuote[key]!==settings[key]))fail(409,"수수료 정책이 변경됐어요. 현재 조건을 확인하고 다시 동의해 주세요.");
  if(target&&!await listingEditable(db,target,seller.id))fail(409,"공개되었거나 결제 이력이 있는 아이디어는 수정할 수 없어요.");
  const ids=[...data.imageIds,...(data.coverId?[data.coverId]:[])];
  if(new Set(ids).size!==ids.length)fail(400,"공개 커버와 상세 이미지는 서로 다른 파일이어야 해요.");
  for(const id of ids){
    const img=await db.prepare("SELECT * FROM uploads WHERE id=?").bind(id).first();
    if(!img||img.owner_id!==seller.id||(img.idea_id&&img.idea_id!==target)||img.kind!==(id===data.coverId?"public":"private")){
      const concurrent=await replay();if(concurrent)return concurrent;
      fail(400,"첨부한 이미지의 소유자 또는 공개 범위를 확인해 주세요.");
    }
  }
  const id=target||"idea-"+crypto.randomUUID(),time=new Date().toISOString(),token=crypto.randomUUID(),version=target?input.expectedVersion+1:1;
  const contentHash=await digest(JSON.stringify(data));
  const imageCondition="(SELECT count(*) FROM uploads WHERE id IN("+ids.map(()=>"?").join(",")+") AND owner_id=? AND (idea_id IS NULL OR idea_id=?) AND ((kind='private' AND id!=?) OR (kind='public' AND id=?)))=?";
  const imageParams=[...ids,seller.id,target||"",data.coverId||"",data.coverId||"",ids.length];
  const stmts=[];
  if(!target){
    stmts.push(db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,status,art,created_at) SELECT ?,?,?,?,?,?,?,?,?,'active',?,? WHERE "+imageCondition+" AND NOT EXISTS(SELECT 1 FROM listing_requests WHERE id=?)").bind(id,seller.id,data.title,data.summary,data.category,data.maturity,data.viewPrice,data.usePrice,JSON.stringify(data.tags),CATALOG[data.category].art,time,...imageParams,requestId));
  }else{
    stmts.push(db.prepare("UPDATE idea_quality SET originality=?,validation_note=?,risks=?,content_hash=?,version=version+1,created_at=? WHERE idea_id=? AND version=? AND EXISTS(SELECT 1 FROM ideas i JOIN idea_reviews r ON r.idea_id=i.id WHERE i.id=? AND i.seller_id=? AND "+editable+") AND "+imageCondition+" AND NOT EXISTS(SELECT 1 FROM listing_requests WHERE id=?)").bind(data.originality,data.validationNote,data.risks,contentHash,time,id,input.expectedVersion,id,seller.id,...imageParams,requestId));
  }
  stmts.push(db.prepare("INSERT OR IGNORE INTO listing_requests(id,seller_id,idea_id,kind,payload_hash,version,token,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1").bind(requestId,seller.id,id,kind,payloadHash,version,token,time));
  const guard="EXISTS(SELECT 1 FROM listing_requests WHERE id=? AND token=?)",guardParams=[requestId,token];
  if(!target){
    stmts.push(db.prepare("INSERT INTO idea_details(idea_id,problem,solution,audience,execution,deliverables) SELECT ?,?,?,?,?,? WHERE "+guard).bind(id,data.problem,data.solution,data.audience,data.execution,JSON.stringify(data.deliverables),...guardParams));
    stmts.push(db.prepare("INSERT INTO idea_taxonomy(idea_id,topic) SELECT ?,? WHERE "+guard).bind(id,data.topic,...guardParams));
    stmts.push(db.prepare("INSERT INTO idea_classification(idea_id,kind,topic,domains,version,confirmed_at) SELECT ?,?,?,?,?,? WHERE "+guard).bind(id,data.category,data.topic,JSON.stringify(data.domainIds),TAXONOMY_VERSION,time,...guardParams));
    stmts.push(db.prepare("INSERT INTO idea_reviews(idea_id,status,created_at) SELECT ?,'pending',? WHERE "+guard).bind(id,time,...guardParams));
    stmts.push(db.prepare("INSERT INTO idea_quality(idea_id,originality,validation_note,risks,content_hash,version,created_at) SELECT ?,?,?,?,?,1,? WHERE "+guard).bind(id,data.originality,data.validationNote,data.risks,contentHash,time,...guardParams));
    stmts.push(db.prepare("INSERT INTO listing_terms(idea_id,view_bps,use_bps,hold_days,version,text,agreed_at) SELECT ?,?,?,?,?,?,? WHERE "+guard).bind(id,settings.viewBps,settings.useBps,settings.holdDays,SELLER_TERMS_VERSION,sellerTermsText(settings),time,...guardParams));
  }else{
    stmts.push(db.prepare("UPDATE ideas SET title=?,summary=?,category=?,maturity=?,view_price=?,use_price=?,tags=?,art=? WHERE id=? AND "+guard).bind(data.title,data.summary,data.category,data.maturity,data.viewPrice,data.usePrice,JSON.stringify(data.tags),CATALOG[data.category].art,id,...guardParams));
    stmts.push(db.prepare("UPDATE idea_details SET problem=?,solution=?,audience=?,execution=?,deliverables=? WHERE idea_id=? AND "+guard).bind(data.problem,data.solution,data.audience,data.execution,JSON.stringify(data.deliverables),id,...guardParams));
    stmts.push(db.prepare("UPDATE idea_taxonomy SET topic=? WHERE idea_id=? AND "+guard).bind(data.topic,id,...guardParams));
    stmts.push(db.prepare("UPDATE idea_classification SET kind=?,topic=?,domains=?,version=?,confirmed_at=? WHERE idea_id=? AND "+guard).bind(data.category,data.topic,JSON.stringify(data.domainIds),TAXONOMY_VERSION,time,id,...guardParams));
    stmts.push(db.prepare("UPDATE idea_reviews SET status='pending',reason=NULL,reviewer_id=NULL,reviewed_at=NULL WHERE idea_id=? AND "+guard).bind(id,...guardParams));
    stmts.push(db.prepare("UPDATE uploads SET idea_id=NULL WHERE idea_id=? AND id NOT IN("+ids.map(()=>"?").join(",")+") AND "+guard).bind(id,...ids,...guardParams));
  }
  for(const imageId of ids)stmts.push(db.prepare("UPDATE uploads SET idea_id=? WHERE id=? AND owner_id=? AND idea_id IS NULL AND "+guard).bind(id,imageId,seller.id,...guardParams));
  stmts.push(db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,?,?,?,? WHERE "+guard).bind("event-"+crypto.randomUUID(),seller.id,"listing."+kind,id,JSON.stringify({version,contentHash}),time,...guardParams));
  await db.batch(stmts);
  const result=await replay();
  if(!result)fail(409,"이미지나 등록·심사 상태가 변경됐어요. 현재 내용을 다시 불러와 확인해 주세요.");
  // Return a fresh 201 only for the transaction which actually claimed the token.
  const saved=await db.prepare("SELECT token FROM listing_requests WHERE id=?").bind(requestId).first();
  if(saved.token!==token)return result;
  return json({id,version,reviewStatus:"pending",note:"검토 요청을 접수했어요. 승인 후 공개됩니다."},201);
}
