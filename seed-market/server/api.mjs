import {PLATFORM_NOTICE} from "../public/assets/platform-policy.js";
import { CATEGORIES,MATURITIES,TERMS_VERSION,SELLER_TERMS_VERSION,sellerTermsText,VIEW_PLEDGE,USE_PLEDGE,TEST_NOTICE,AppError,fail,imageType } from "./policy.mjs";
import {commerceSettings,listingCommerce,financialStatements,reviewState,isOperator} from "./commerce.mjs";
import {handleOperations} from "./operations.mjs";
import {handleListings,listingEditable,editableListingIds} from "./listings.mjs";
import {buyerAccess} from "./access.mjs";
import {handleSharing} from "./sharing.mjs";
import {handleValuations} from "./valuations.mjs";
import {patentRecord,publicPatent,privatePatent,patentPurchaseGuard} from "./patents.mjs";
import {PRICE_GUIDE_VERSION,PRICE_LEVELS,priceGuideFor} from "../public/assets/pricing.js";
import {flushUploadCleanup,discardTemporaryUpload} from "./uploads.mjs";
import {publicAuthSettings} from "../auth/settings.mjs";
import {CATALOG,DOMAINS,KIND_GROUPS,TAXONOMY_VERSION,classifyIdea,parseDiscoveryFilters,searchCatalog,suggestCatalog} from "../public/assets/catalog.js";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const now=()=>new Date().toISOString();
async function readLimited(request,max){
  const length=Number(request.headers.get("Content-Length"));
  if(length>max)fail(413,"파일 또는 요청의 크기가 너무 커요.");
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader();let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,"파일 또는 요청의 크기가 너무 커요.");}chunks.push(value);}
  const body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}return body;
}
async function bodyJSON(request){
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))fail(415,"JSON 형식으로 요청해 주세요.");
  try{const data=JSON.parse(new TextDecoder().decode(await readLimited(request,160000)));if(!data||Array.isArray(data)||typeof data!=="object")fail(400,"요청 내용을 확인해 주세요.");return data;}
  catch(error){if(error instanceof AppError)throw error;fail(400,"요청 내용을 확인해 주세요.");}
}
const publicSelect="SELECT i.id,i.seller_id,i.title,i.summary,i.category,i.maturity,t.topic,c.kind AS classified_kind,c.topic AS classified_topic,c.domains AS classified_domains,c.version AS classification_version,i.view_price,i.use_price,i.tags,i.status,i.is_sample,i.art,i.created_at,u.name AS seller_name,COALESCE(r.status,'approved') AS review_status,r.reason AS review_reason,(SELECT id FROM uploads WHERE idea_id=i.id AND kind='public' LIMIT 1) AS cover_id FROM ideas i JOIN users u ON u.id=i.seller_id LEFT JOIN idea_reviews r ON r.idea_id=i.id LEFT JOIN idea_taxonomy t ON t.idea_id=i.id LEFT JOIN idea_classification c ON c.idea_id=i.id";
function publicIdea(row,own=false){
  const idea={id:row.id,title:row.title,summary:row.summary,category:row.category,maturity:row.maturity,viewPrice:row.view_price,usePrice:row.use_price,tags:JSON.parse(row.tags),status:row.status,reviewStatus:row.review_status,...(own?{reviewReason:row.review_reason}:{}),sample:Boolean(row.is_sample),art:row.art,seller:row.seller_name,createdAt:row.created_at,coverUrl:row.cover_id?"/api/images/"+row.cover_id:null};
  const confirmed=row.classification_version===TAXONOMY_VERSION;
  const result=classifyIdea({...idea,category:row.classified_kind||row.category,topic:row.classified_topic||row.topic,domainIds:row.classified_domains?JSON.parse(row.classified_domains):[]},{confirmed});
  result.legacyTopic=confirmed?null:(row.topic||null);result.priceGuide=priceGuideFor(result);return result;
}
async function orderID(user,key){return "order-"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(user+"\n"+key)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function handleAPI(request,env,context={}){
 try{
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,""),method=request.method;
  if(!["GET","POST","DELETE"].includes(method))return json({error:"지원하지 않는 요청입니다."},405);
  if(method!=="GET"){
    if((request.headers.get("Origin")&&request.headers.get("Origin")!==url.origin)||request.headers.get("Sec-Fetch-Site")==="cross-site")fail(403,"다른 사이트에서 보낸 요청은 처리할 수 없어요.");
  }
  const db=env.DB;if(!db)fail(503,"데이터베이스 연결이 준비되지 않았어요.");
  const identity=context.identity??null;
  const me=identity?await db.prepare("SELECT id,role,name,created_at FROM users WHERE id=?").bind(identity.id).first():null;
  const auth=()=>{if(!identity)fail(401,"로그인 후 이용해 주세요.");return identity;};
  const member=(role)=>{auth();if(!me)fail(403,"판매자 또는 구매자로 회원가입을 완료해 주세요.");if(role&&me.role!==role)fail(403,role==="seller"?"판매자만 이용할 수 있어요.":"구매자만 이용할 수 있어요.");return me;};
  const accessible=async(idea)=>{
    if(isOperator(identity,env))return true;
    if(me?.id===idea.seller_id)return true;
    if(!me||me.role!=="buyer")return false;
    if((await reviewState(db,idea.id)).status!=="approved")return false;
    if(idea.status==="sold")return Boolean(await db.prepare("SELECT 1 FROM licenses l LEFT JOIN refunds r ON r.order_id=l.order_id WHERE l.idea_id=? AND l.user_id=? AND r.id IS NULL").bind(idea.id,me.id).first());
    return Boolean(await db.prepare("SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL").bind(idea.id,me.id).first());
  };
  const recordAccess=async(ideaId,kind)=>{
    if(!identity)return;
    const record=await db.prepare("SELECT version,content_hash FROM idea_quality WHERE idea_id=?").bind(ideaId).first();
    await db.prepare("INSERT OR IGNORE INTO access_records(id,user_id,idea_id,kind,actor_role,version,content_hash,first_accessed_at) VALUES(?,?,?,?,?,?,?,?)").bind("access-"+crypto.randomUUID(),identity.id,ideaId,kind,isOperator(identity,env)?"operator":me?.role||"member",record?.version||1,record?.content_hash??null,now()).run();
  };
  const valuations=await handleValuations({path,method,request,url,db,identity,env,context,member,bodyJSON,json});if(valuations)return valuations;
  const sharing=await handleSharing({path,method,request,url,db,member,identity,env,bodyJSON,json});if(sharing)return sharing;
  const operation=await handleOperations({path,method,request,env,context,db,identity,me,member,bodyJSON,json});if(operation)return operation;
  const listing=await handleListings({path,method,request,db,member,bodyJSON,json});if(listing)return listing;
  if(path==="/api/config"&&method==="GET"){
    const commerce=await commerceSettings(db);
    return json({platformNotice:PLATFORM_NOTICE,categories:CATEGORIES,taxonomy:CATALOG,kindGroups:KIND_GROUPS,domains:DOMAINS,taxonomyVersion:TAXONOMY_VERSION,maturities:MATURITIES,priceGuidance:{version:PRICE_GUIDE_VERSION,mode:"advisory",levels:PRICE_LEVELS},paymentMode:env.PAYMENTS_MODE==="test"?"test":"disabled",termsVersion:TERMS_VERSION,viewPledge:VIEW_PLEDGE,usePledge:USE_PLEDGE,testNotice:TEST_NOTICE,devMode:Boolean(context.devMode),commerce,sellerTerms:{version:SELLER_TERMS_VERSION,text:sellerTermsText(commerce)},auth:publicAuthSettings(env,context.authBackend||"sites")});
  }
  if(path==="/api/me"&&method==="GET")return json({authenticated:Boolean(identity),profile:me,isAdmin:isOperator(identity,env),auth:publicAuthSettings(env,context.authBackend||"sites"),signInUrl:"/signin-with-chatgpt?return_to="+encodeURIComponent("/#join"),signOutUrl:"/signout-with-chatgpt?return_to=/"});
  if(path==="/api/signup"&&method==="POST"){
    auth();if(me)fail(409,"이미 회원가입한 계정이에요. 가입 역할은 변경할 수 없어요.");
    const data=await bodyJSON(request);
    if(!["seller","buyer"].includes(data.role))fail(400,"판매자 또는 구매자를 선택해 주세요.");
    const name=typeof data.name==="string"?data.name.trim():"";
    if(name.length<2||name.length>24)fail(400,"이름은 2~24자로 입력해 주세요.");
    try{await db.prepare("INSERT INTO users(id,role,name,created_at) VALUES(?,?,?,?)").bind(identity.id,data.role,name,now()).run();}
    catch{fail(409,"이미 회원가입한 계정이에요. 새로고침해 주세요.");}
    return json({profile:{id:identity.id,role:data.role,name}},201);
  }
  if(path==="/api/ideas"&&method==="GET"){
    const rows=await db.prepare(publicSelect+" WHERE COALESCE(r.status,'approved')='approved' ORDER BY i.created_at DESC LIMIT 300").all();
    return json({ideas:rows.results.map(row=>publicIdea(row))});
  }
  if(["/api/discovery","/api/discovery/suggest"].includes(path)&&method==="GET"){
    let filters;try{filters=parseDiscoveryFilters(url.searchParams,{strict:true});}catch(error){fail(400,error.message);}
    // Only explicit public projections of approved listings enter the search engine.
    // Paid text, private images, seller review reasons and pending items are excluded.
    const rows=await db.prepare(publicSelect+" WHERE COALESCE(r.status,'approved')='approved'").all();
    const catalog=rows.results.map(row=>publicIdea(row));
    return path.endsWith("/suggest")?json({suggestions:suggestCatalog(catalog,filters.q,filters)}):json(searchCatalog(catalog,filters));
  }
  if(path==="/api/uploads"&&method==="GET"){
    member("seller");
    await flushUploadCleanup(db,env.BUCKET,me.id);
    const rows=await db.prepare("SELECT id,kind,size,created_at FROM uploads WHERE owner_id=? AND idea_id IS NULL ORDER BY created_at DESC").bind(me.id).all();
    return json({uploads:rows.results.map(img=>({...img,url:"/api/images/"+img.id})),limit:15});
  }
  if(path==="/api/uploads"&&method==="POST"){
    member("seller");if(!env.BUCKET)fail(503,"이미지 저장소 연결이 준비되지 않았어요.");
    await flushUploadCleanup(db,env.BUCKET,me.id);
    const kind=url.searchParams.get("kind");if(!["public","private"].includes(kind))fail(400,"이미지 공개 범위를 선택해 주세요.");
    const bytes=await readLimited(request,5*1024*1024),type=imageType(bytes);
    if(!type||type!==request.headers.get("Content-Type"))fail(400,"PNG, JPG, WebP 이미지만 업로드할 수 있어요.");
    const id="image-"+crypto.randomUUID(),key="ideas/"+id;
    const reserved=await db.prepare("INSERT INTO uploads(id,owner_id,kind,object_key,content_type,size,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM uploads WHERE owner_id=? AND idea_id IS NULL)<15").bind(id,me.id,kind,key,type,bytes.length,now(),me.id).run();
    if(!reserved.meta.changes)fail(429,"등록하지 않은 이미지가 많아요. 기존 이미지를 삭제하거나 등록을 완료해 주세요.");
    try{await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});}
    catch(error){await discardTemporaryUpload(db,env.BUCKET,id,me.id);throw error;}
    return json({id,url:"/api/images/"+id,kind},201);
  }
  const uploadMatch=path.match(/^\/api\/uploads\/([a-zA-Z0-9-]+)$/);
  if(uploadMatch&&method==="DELETE"){
    member("seller");const img=await db.prepare("SELECT * FROM uploads WHERE id=? AND owner_id=? AND idea_id IS NULL").bind(uploadMatch[1],me.id).first();
    if(!img)fail(404,"삭제할 임시 이미지를 찾을 수 없어요.");
    if(!env.BUCKET)fail(503,"이미지 저장소 연결이 준비되지 않았어요.");
    if(!await discardTemporaryUpload(db,env.BUCKET,img.id,me.id))fail(409,"이미 등록에 사용된 이미지예요. 등록 자료는 삭제하지 않았어요.");
    return json({deleted:true});
  }
  const imageMatch=path.match(/^\/api\/images\/([a-zA-Z0-9-]+)$/);
  if(imageMatch&&method==="GET"){
    const img=await db.prepare("SELECT * FROM uploads WHERE id=?").bind(imageMatch[1]).first();
    if(!img)fail(404,"이미지를 찾을 수 없어요.");
    let allowed=isOperator(identity,env)||me?.id===img.owner_id;
    if(img.idea_id){const idea=await db.prepare("SELECT * FROM ideas WHERE id=?").bind(img.idea_id).first();allowed=allowed||(img.kind==="public"&&(await reviewState(db,img.idea_id)).status==="approved")||Boolean(idea&&img.kind==="private"&&await accessible(idea));}
    if(!allowed)fail(403,"이미지 열람 권한이 없어요.");
    if(!env.BUCKET)fail(503,"이미지 저장소 연결이 준비되지 않았어요.");
    const object=await env.BUCKET.get(img.object_key);if(!object)fail(404,"이미지를 찾을 수 없어요.");
    if(img.idea_id&&img.kind==="private")await recordAccess(img.idea_id,"image");
    return new Response(object.body,{headers:{"Content-Type":img.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
  }
  const match=path.match(/^\/api\/ideas\/([a-zA-Z0-9-]+)(?:\/(details|checkout|bookmark))?$/);
  if(match){
    const [,id,action]=match,idea=await db.prepare("SELECT * FROM ideas WHERE id=?").bind(id).first();
    if(!idea)fail(404,"아이디어를 찾을 수 없어요.");
    const review=await reviewState(db,id);
    if(review.status!=="approved"&&me?.id!==idea.seller_id&&!isOperator(identity,env))fail(404,"공개된 아이디어를 찾을 수 없어요.");
    if(!action&&method==="GET"){
      const row=await db.prepare(publicSelect+" WHERE i.id=?").bind(id).first();
      const detail=await db.prepare("SELECT deliverables FROM idea_details WHERE idea_id=?").bind(id).first();
      const version=await db.prepare("SELECT version FROM idea_quality WHERE idea_id=?").bind(id).first();
      const patent=await patentRecord(db,id);
      return json({idea:publicIdea(row,me?.id===idea.seller_id||isOperator(identity,env)),patentDisclosure:publicPatent(patent),...(me?.id===idea.seller_id||isOperator(identity,env)?{patentPrivate:privatePatent(patent)}:{}),canView:await accessible(idea),own:me?.id===idea.seller_id,exclusive:me?.id===idea.exclusive_buyer_id&&await accessible(idea),deliverables:JSON.parse(detail.deliverables),commerce:await listingCommerce(db,id),canEdit:me?.id===idea.seller_id&&await listingEditable(db,id,me.id),registrationVersion:version?.version||0});
    }
    if(action==="details"&&method==="GET"){
      auth();if(!await accessible(idea))fail(403,idea.status==="sold"?"독점 사용권이 판매되어 상세 내용을 열람할 수 없어요.":"열람권 결제 후 상세 내용을 볼 수 있어요.");
      const details=await db.prepare("SELECT problem,solution,audience,execution,deliverables FROM idea_details WHERE idea_id=?").bind(id).first();
      const images=await db.prepare("SELECT id FROM uploads WHERE idea_id=? AND kind='private' ORDER BY created_at").bind(id).all();
      const quality=await db.prepare("SELECT originality,validation_note,risks,content_hash,version,created_at FROM idea_quality WHERE idea_id=?").bind(id).first();
      await recordAccess(id,"detail");
      return json({details:{...details,quality,deliverables:JSON.parse(details.deliverables),images:images.results.map(x=>({id:x.id,url:"/api/images/"+x.id}))}});
    }
    if(action==="bookmark"&&(method==="POST"||method==="DELETE")){
      member();
      if(method==="POST")await db.prepare("INSERT OR IGNORE INTO bookmarks(user_id,idea_id) VALUES(?,?)").bind(me.id,id).run();
      else await db.prepare("DELETE FROM bookmarks WHERE user_id=? AND idea_id=?").bind(me.id,id).run();
      return json({saved:method==="POST"});
    }
    if(action==="checkout"&&method==="POST"){
      member("buyer");const input=await bodyJSON(request);
      if(!["view","use"].includes(input.kind))fail(400,"구매할 권리를 선택해 주세요.");
      if(input.agree!==true||input.termsVersion!==TERMS_VERSION)fail(400,"최신 서약 내용을 확인하고 동의해 주세요.");
      const key=request.headers.get("Idempotency-Key");
      if(!key||!/^[a-zA-Z0-9-]{8,128}$/.test(key))fail(400,"결제 요청 식별자가 올바르지 않아요.");
      const oid=await orderID(me.id,key),prior=await db.prepare("SELECT * FROM orders WHERE id=?").bind(oid).first();
      if(prior){if(prior.idea_id!==id||prior.kind!==input.kind)fail(409,"이미 사용한 결제 요청 식별자예요.");if(await db.prepare("SELECT 1 FROM refunds WHERE order_id=?").bind(oid).first())fail(409,"환불된 결제 요청입니다. 새 결제 화면에서 다시 확인해 주세요.");return json({order:prior,duplicate:true,testNotice:TEST_NOTICE});}
      if(env.PAYMENTS_MODE!=="test")fail(503,"실제 결제 서비스가 아직 연결되지 않았어요. 지금은 구매할 수 없습니다.");
      if(idea.seller_id===me.id)fail(403,"내 아이디어는 구매할 수 없어요.");
      if(idea.status!=="active"||review.status!=="approved")fail(409,"현재 구매할 수 없는 아이디어예요.");
      if(await db.prepare("SELECT 1 FROM cases WHERE idea_id=? AND user_id=? AND kind IN ('refund','dispute') AND status IN ('open','reviewing')").bind(id,me.id).first())fail(409,"진행 중인 환불·분쟁 문의를 먼저 확인해 주세요.");
      const grant=await db.prepare("SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL").bind(id,me.id).first();
      if(input.kind==="view"&&grant)return json({alreadyOwned:true,testNotice:TEST_NOTICE});
      if(input.kind==="use"&&!grant)fail(403,"상세 열람권을 먼저 구매해 주세요.");
      const patent=await patentRecord(db,id),patentDisclosure=publicPatent(patent),patentGuard=patentPurchaseGuard(patent,id);
      if((patent||input.patentStamp!==undefined)&&input.patentStamp!==patentDisclosure.stamp)fail(409,"특허·권리 안내가 변경됐어요. 최신 구매 화면에서 다시 확인해 주세요.");
      const time=now(),amount=input.kind==="view"?idea.view_price:idea.use_price;
      const insertOrder=db.prepare("INSERT OR IGNORE INTO orders(id,user_id,idea_id,kind,amount,mode,status,created_at) SELECT ?,?,?,?,?,'test','paid',? WHERE EXISTS(SELECT 1 FROM ideas WHERE id=? AND status='active') AND NOT EXISTS(SELECT 1 FROM idea_reviews WHERE idea_id=? AND status!='approved') AND NOT EXISTS(SELECT 1 FROM cases WHERE idea_id=? AND user_id=? AND kind IN ('refund','dispute') AND status IN ('open','reviewing'))"+(input.kind==="view"?" AND NOT EXISTS(":" AND EXISTS(")+"SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL) AND "+patentGuard.sql).bind(oid,me.id,id,input.kind,amount,time,id,id,id,me.id,id,me.id,...patentGuard.params);
      const stmts=[insertOrder];
      stmts.push(db.prepare("INSERT OR IGNORE INTO order_patent_disclosures(order_id,snapshot,policy_version,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND idea_id=? AND user_id=?)").bind(oid,JSON.stringify(patentDisclosure),patentDisclosure.policyVersion,time,oid,id,me.id));
      const guidance=priceGuideFor(publicIdea(await db.prepare(publicSelect+" WHERE i.id=?").bind(id).first()));
      stmts.push(db.prepare("INSERT OR IGNORE INTO order_price_guidance(order_id,guidance,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND idea_id=? AND user_id=?)").bind(oid,JSON.stringify(guidance),time,oid,id,me.id));
      if(input.kind==="view")stmts.push(db.prepare("INSERT INTO view_grants(idea_id,user_id,order_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND idea_id=? AND user_id=? AND kind='view') ON CONFLICT(idea_id,user_id) DO UPDATE SET order_id=excluded.order_id,created_at=excluded.created_at WHERE EXISTS(SELECT 1 FROM refunds WHERE order_id=view_grants.order_id)").bind(id,me.id,oid,time,oid,id,me.id));
      else{
        stmts.push(db.prepare("UPDATE ideas SET status='sold',exclusive_buyer_id=?,license_order_id=? WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND idea_id=? AND user_id=? AND kind='use') AND EXISTS(SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL)").bind(me.id,oid,id,oid,id,me.id,id,me.id));
        stmts.push(db.prepare("INSERT OR IGNORE INTO licenses(idea_id,user_id,order_id,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM ideas WHERE id=? AND exclusive_buyer_id=? AND license_order_id=?)").bind(id,me.id,oid,time,id,me.id,oid));
      }
      stmts.push(db.prepare("INSERT OR IGNORE INTO pledges(order_id,user_id,idea_id,kind,version,text,agreed_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND idea_id=? AND user_id=? AND kind=?)").bind(oid,me.id,id,input.kind,TERMS_VERSION,input.kind==="view"?VIEW_PLEDGE:USE_PLEDGE,time,oid,id,me.id,input.kind));
      stmts.push(...financialStatements(db,{orderId:oid,ideaId:id,buyerId:me.id,kind:input.kind,amount,time,settings:await listingCommerce(db,id)}));
      await db.batch(stmts);
      const order=await db.prepare("SELECT * FROM orders WHERE id=?").bind(oid).first();
      if(!order){
        const latestPatent=await patentRecord(db,id);if(publicPatent(latestPatent).stamp!==patentDisclosure.stamp)fail(409,"특허·권리 안내가 변경돼 결제를 진행하지 않았어요. 최신 자료를 다시 확인해 주세요.");
        if(input.kind==="view"&&await db.prepare("SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL").bind(id,me.id).first())return json({alreadyOwned:true,testNotice:TEST_NOTICE});
        fail(409,"다른 구매자가 먼저 사용권을 구매했어요. 결제는 발생하지 않았습니다.");
      }
      if(order.idea_id!==id||order.kind!==input.kind)fail(409,"이미 사용한 결제 요청 식별자예요.");
      return json({order,testNotice:TEST_NOTICE},201);
    }
  }
  const receipt=path.match(/^\/api\/orders\/([a-zA-Z0-9-]+)$/);
  if(receipt&&method==="GET"){
    member();
    const order=await db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").bind(receipt[1],me.id).first();
    if(!order)fail(404,"내 결제 기록을 찾을 수 없어요.");
    const pledge=await db.prepare("SELECT version,text,agreed_at,kind FROM pledges WHERE order_id=? AND user_id=?").bind(order.id,me.id).first();
    const financials=await db.prepare("SELECT gross,commission_bps,platform_fee,seller_amount,hold_until FROM order_financials WHERE order_id=?").bind(order.id).first();
    const refund=await db.prepare("SELECT created_at,reason,gross_reversal FROM refunds WHERE order_id=?").bind(order.id).first();
    const access=await db.prepare("SELECT MIN(first_accessed_at) AS firstAccessedAt FROM access_records WHERE idea_id=? AND user_id=?").bind(order.idea_id,me.id).first();
    const idea=await db.prepare(publicSelect+" WHERE i.id=?").bind(order.idea_id).first();
    const hasView=Boolean(await db.prepare("SELECT 1 FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.idea_id=? AND v.user_id=? AND r.id IS NULL").bind(order.idea_id,me.id).first());
    const hasUse=Boolean(await db.prepare("SELECT 1 FROM licenses l LEFT JOIN refunds r ON r.order_id=l.order_id WHERE l.idea_id=? AND l.user_id=? AND r.id IS NULL").bind(order.idea_id,me.id).first());
    const guidance=await db.prepare("SELECT guidance FROM order_price_guidance WHERE order_id=?").bind(order.id).first();
    const patent=await db.prepare("SELECT snapshot FROM order_patent_disclosures WHERE order_id=?").bind(order.id).first();
    return json({order:{...order,title:idea.title,effective_status:refund?"refunded":"paid"},pledge,financials,refund,patentDisclosure:patent?JSON.parse(patent.snapshot):null,priceGuide:guidance?JSON.parse(guidance.guidance):null,firstAccessedAt:access.firstAccessedAt,access:buyerAccess(idea,{hasView,hasUse,hasOrders:true,orderId:order.id})});
  }
  if(path==="/api/account"&&method==="GET"){
    member();
    const b=await db.prepare("SELECT idea_id FROM bookmarks WHERE user_id=?").bind(me.id).all();
    const views=await db.prepare("SELECT v.idea_id FROM view_grants v LEFT JOIN refunds r ON r.order_id=v.order_id WHERE v.user_id=? AND r.id IS NULL").bind(me.id).all();
    const licenses=await db.prepare("SELECT l.idea_id FROM licenses l LEFT JOIN refunds r ON r.order_id=l.order_id WHERE l.user_id=? AND r.id IS NULL").bind(me.id).all();
    const rows=await db.prepare(publicSelect+" WHERE i.seller_id=? ORDER BY i.created_at DESC").bind(me.id).all();
    const editable=me.role==="seller"?await editableListingIds(db,me.id):new Set();
    const orders=await db.prepare("SELECT o.id,o.idea_id,i.title,o.kind,o.amount,o.mode,o.status,o.created_at,CASE WHEN r.id IS NULL THEN 'paid' ELSE 'refunded' END AS effective_status FROM orders o JOIN ideas i ON i.id=o.idea_id LEFT JOIN refunds r ON r.order_id=o.id WHERE o.user_id=? ORDER BY o.created_at DESC").bind(me.id).all();
    const purchased=await db.prepare(publicSelect+" WHERE EXISTS(SELECT 1 FROM orders o WHERE o.idea_id=i.id AND o.user_id=?) ORDER BY i.created_at DESC").bind(me.id).all();
    const bookmarked=await db.prepare(publicSelect+" WHERE COALESCE(r.status,'approved')='approved' AND EXISTS(SELECT 1 FROM bookmarks b WHERE b.idea_id=i.id AND b.user_id=?) ORDER BY i.created_at DESC").bind(me.id).all();
    const access=Object.fromEntries(purchased.results.map(idea=>[idea.id,buyerAccess(idea,{hasView:views.results.some(v=>v.idea_id===idea.id),hasUse:licenses.results.some(l=>l.idea_id===idea.id),hasOrders:true,orderId:orders.results.find(o=>o.idea_id===idea.id)?.id})]));
    return json({access,favorites:b.results.map(x=>x.idea_id),viewed:views.results.map(x=>x.idea_id),licensed:licenses.results.map(x=>x.idea_id),selling:rows.results.map(row=>({...publicIdea(row,true),canEdit:editable.has(row.id)})),bookmarkedIdeas:bookmarked.results.map(row=>publicIdea(row)),purchasedIdeas:purchased.results.map(row=>publicIdea(row)),orders:orders.results});
  }
  fail(404,"요청한 기능을 찾을 수 없어요.");
 }catch(error){if(error instanceof AppError)return json({error:error.message},error.status);console.error("seed API error",error.name);return json({error:"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."},500);}
}
