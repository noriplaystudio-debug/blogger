import {fail} from "./policy.mjs";
import {isOperator,iso} from "./commerce.mjs";
import {CATALOG,TOPICS,MATURITY_LABELS} from "../public/assets/catalog.js";
import {SHARE_LICENSES} from "../public/assets/sharing-policy.js";
import {VALUE_QUESTION_VERSION,VALUE_QUESTION,VALUE_NOTICE,VALUE_LIMIT,VALUE_THRESHOLDS} from "../public/assets/valuation-policy.js";
import {shareValueHash,publicValueSummary,calibrationGroups,valueSummaryCSV} from "./valuation-data.mjs";

const MAX_REPORT_ROWS=20000;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const privateOpinion=row=>({id:row.id,shareId:row.share_id,sourceHash:row.source_hash,sourceVersion:row.source_version,questionVersion:row.question_version,title:row.source_title,sourceCategory:row.source_category,sourceTopic:row.source_topic,sourceLicense:row.source_license,sourceLicenseText:row.source_license_text,sourceTermsVersion:row.source_terms_version,maturity:row.maturity,viewAmount:row.view_amount,useAmount:row.use_amount,reason:row.reason,state:row.state,moderation:row.moderation,moderationReason:row.moderation_reason,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at});
const publicOpinion=row=>({id:row.id,maturity:row.maturity,viewAmount:row.view_amount,useAmount:row.use_amount,reason:row.reason,updatedAt:row.updated_at});
function pageNumber(url){const n=Number(url.searchParams.get("page")||1);if(!Number.isSafeInteger(n)||n<1||n>10000)fail(400,"페이지를 확인해 주세요.");return n;}
function revision(input){if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail(400,"의견 버전을 확인해 주세요.");return input.expectedRevision;}
function opinionInput(input){
  if(input.agree!==true||input.questionVersion!==VALUE_QUESTION_VERSION)fail(400,"의견 공개와 가격 기준 검토에 사용하는 안내를 확인해 주세요.");
  if(!Object.hasOwn(MATURITY_LABELS,input.maturity))fail(400,"자료를 보고 판단한 완성도를 선택해 주세요.");
  const amount=key=>{const value=input[key];if(value===null||value===undefined)return null;if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>VALUE_LIMIT)fail(400,"금액 의견은 0~100,000,000원의 정수로 입력해 주세요.");return value;};
  const viewAmount=amount("viewAmount"),useAmount=amount("useAmount");
  if(viewAmount===null&&useAmount===null)fail(400,"열람료 또는 추가 사용료 중 하나 이상 의견을 입력해 주세요. 무료가 적절하면 0원을 입력하세요.");
  const reason=input.reason===undefined?"":input.reason;
  if(typeof reason!=="string"||reason.trim().length>1000)fail(400,"금액을 고른 이유는 최대 1,000자로 입력해 주세요.");
  return {maturity:input.maturity,viewAmount,useAmount,reason:reason.trim(),questionVersion:VALUE_QUESTION_VERSION};
}
export async function handleValuations({path,method,request,url,db,identity,env,context,member,bodyJSON,json}){
  const publicMatch=path.match(/^\/api\/shares\/([a-zA-Z0-9-]+)\/value-opinions$/),withdraw=path.match(/^\/api\/value-opinions\/([a-zA-Z0-9-]+)\/withdraw$/),moderate=path.match(/^\/api\/admin\/value-opinions\/([a-zA-Z0-9-]+)\/moderate$/);
  if(!publicMatch&&!withdraw&&!path.startsWith("/api/admin/value-opinions")&&path!=="/api/value-opinions/mine")return null;
  const admin=()=>{if(!identity)fail(401,"로그인 후 이용해 주세요.");if(!isOperator(identity,env))fail(403,"운영자만 이용할 수 있어요.");};
  const time=iso(context);
  if(publicMatch){
    const share=await db.prepare("SELECT * FROM shared_ideas WHERE id=?").bind(publicMatch[1]).first();
    const owner=share?.author_id===identity?.id,operator=isOperator(identity,env);
    if(!share||(share.status!=="published"&&!owner&&!operator))fail(404,"공개된 나눔 글을 찾을 수 없어요.");
    const sourceHash=await shareValueHash(share);
    if(method==="GET"){
      const requestedPage=pageNumber(url),rows=await db.prepare("SELECT o.* FROM share_value_opinions o WHERE o.share_id=? AND o.source_hash=? AND o.question_version=? AND o.state='active' AND o.moderation='normal' AND o.user_id!=? ORDER BY o.updated_at DESC,o.id LIMIT ?").bind(share.id,sourceHash,VALUE_QUESTION_VERSION,share.author_id,MAX_REPORT_ROWS+1).all();
      const valid=rows.results.filter(row=>!isOperator({id:row.user_id},env));
      if(rows.results.length>MAX_REPORT_ROWS)fail(422,"의견이 많아 별도 집계가 필요해요. 운영자에게 문의해 주세요.");
      const entries=valid,pages=Math.max(1,Math.ceil(entries.length/10)),page=Math.min(requestedPage,pages);
      const mine=identity?await db.prepare("SELECT * FROM share_value_opinions WHERE share_id=? AND user_id=? AND source_hash=? AND question_version=?").bind(share.id,identity.id,sourceHash,VALUE_QUESTION_VERSION).first():null;
      return json({shareId:share.id,title:share.title,sourceHash,sourceVersion:share.version,questionVersion:VALUE_QUESTION_VERSION,question:VALUE_QUESTION,notice:VALUE_NOTICE,sourcePreview:{summary:share.summary,body:share.body,licenseText:share.license_text},canSubmit:share.status==="published"&&!owner&&!operator,own:owner,
        summary:publicValueSummary(valid),entries:entries.slice((page-1)*10,page*10).map(publicOpinion),page,pages,mine:mine?privateOpinion(mine):null});
    }
    if(method==="POST"){
      const me=member();if(owner)fail(403,"자신의 나눔 글에는 가격 의견을 등록할 수 없어요.");if(operator)fail(403,"운영자 계정은 가격 의견에 참여하지 않아요.");
      if(share.status!=="published")fail(409,"공개 중인 나눔 글에만 의견을 남길 수 있어요.");
      const input=await bodyJSON(request),expected=revision(input),data=opinionInput(input);
      if(input.sourceHash!==sourceHash||input.expectedShareVersion!==share.version)fail(409,"나눔 글의 내용이나 공개 상태가 바뀌었어요. 최신 글을 보고 다시 의견을 남겨주세요.");
      const prior=await db.prepare("SELECT * FROM share_value_opinions WHERE share_id=? AND user_id=? AND source_hash=? AND question_version=?").bind(share.id,me.id,sourceHash,VALUE_QUESTION_VERSION).first(),payloadHash=await digest(JSON.stringify(data));
      if(prior?.moderation==="excluded")fail(409,"운영 검토로 집계에서 제외된 의견이에요. 내 의견에서 처리 사유를 확인해 주세요.");
      if(prior?.state==="active"&&prior.payload_hash===payloadHash)return json({opinion:privateOpinion(prior),duplicate:true});
      if(expected!==(prior?.revision||0))fail(409,"이미 의견이 변경됐어요. 현재 의견을 다시 불러와 주세요.");
      const id=prior?.id||"opinion-"+crypto.randomUUID(),token=crypto.randomUUID(),guard="EXISTS(SELECT 1 FROM shared_ideas WHERE id=? AND status='published' AND version=?)",params=[share.id,share.version];
      const source=db.prepare("INSERT INTO share_value_sources(share_id,content_hash,source_version,updated_at) SELECT ?,?,?,? WHERE "+guard+" ON CONFLICT(share_id) DO UPDATE SET content_hash=excluded.content_hash,source_version=excluded.source_version,updated_at=excluded.updated_at").bind(share.id,sourceHash,share.version,time,...params);
      const statement=prior?
        db.prepare("UPDATE share_value_opinions SET maturity=?,view_amount=?,use_amount=?,reason=?,state='active',revision=revision+1,payload_hash=?,write_token=?,updated_at=? WHERE id=? AND user_id=? AND revision=? AND moderation='normal' AND "+guard).bind(data.maturity,data.viewAmount,data.useAmount,data.reason,payloadHash,token,time,id,me.id,expected,...params):
        db.prepare("INSERT OR IGNORE INTO share_value_opinions(id,share_id,user_id,source_hash,source_version,source_title,source_category,source_topic,source_license,source_license_text,source_terms_version,question_version,maturity,view_amount,use_amount,reason,role_snapshot,state,moderation,revision,payload_hash,write_token,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active','normal',1,?,?,?,? WHERE "+guard+" AND (SELECT count(*) FROM share_value_opinions WHERE user_id=? AND created_at>=?)<100").bind(id,share.id,me.id,sourceHash,share.version,share.title,share.category,share.topic,share.license,share.license_text,share.terms_version,VALUE_QUESTION_VERSION,data.maturity,data.viewAmount,data.useAmount,data.reason,me.role,payloadHash,token,time,time,...params,me.id,new Date(Date.parse(time)-86400000).toISOString());
      await db.batch([source,statement,db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,'value.opinion',?,?,? WHERE EXISTS(SELECT 1 FROM share_value_opinions WHERE id=? AND write_token=?)").bind("event-"+crypto.randomUUID(),me.id,id,JSON.stringify({shareId:share.id,sourceHash,sourceVersion:share.version,questionVersion:VALUE_QUESTION_VERSION,maturity:data.maturity,viewAmount:data.viewAmount,useAmount:data.useAmount,role:me.role,previousRevision:prior?.revision||0}),time,id,token)]);
      const saved=await db.prepare("SELECT * FROM share_value_opinions WHERE share_id=? AND user_id=? AND source_hash=? AND question_version=?").bind(share.id,me.id,sourceHash,VALUE_QUESTION_VERSION).first();
      if(!saved){if((await db.prepare("SELECT count(*) AS n FROM share_value_opinions WHERE user_id=? AND created_at>=?").bind(me.id,new Date(Date.parse(time)-86400000).toISOString()).first()).n>=100)fail(429,"새 가격 의견은 하루 100개까지 남길 수 있어요.");fail(409,"글의 공개 상태가 바뀌었어요. 최신 내용을 다시 확인해 주세요.");}
      if(saved.write_token!==token){if(saved.state==="active"&&saved.moderation==="normal"&&saved.payload_hash===payloadHash)return json({opinion:privateOpinion(saved),duplicate:true});fail(409,"글이나 의견이 변경됐어요. 최신 내용을 다시 확인해 주세요.");}
      return json({opinion:privateOpinion(saved)},prior?200:201);
    }
    return null;
  }
  if(path==="/api/value-opinions/mine"&&method==="GET"){
    const me=member(),page=pageNumber(url),total=(await db.prepare("SELECT count(*) AS n FROM share_value_opinions WHERE user_id=?").bind(me.id).first()).n,pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
    const rows=await db.prepare("SELECT o.*,s.status AS share_status,c.content_hash AS current_hash FROM share_value_opinions o JOIN shared_ideas s ON s.id=o.share_id LEFT JOIN share_value_sources c ON c.share_id=s.id WHERE o.user_id=? ORDER BY o.updated_at DESC,o.id LIMIT 20 OFFSET ?").bind(me.id,(current-1)*20).all();
    return json({opinions:rows.results.map(row=>({...privateOpinion(row),counted:row.share_status==="published"&&row.current_hash===row.source_hash&&row.question_version===VALUE_QUESTION_VERSION&&row.state==="active"&&row.moderation==="normal"&&!isOperator(identity,env)})),page:current,pages,total});
  }
  if(withdraw&&method==="POST"){
    const me=member(),input=await bodyJSON(request),expected=revision(input),row=await db.prepare("SELECT * FROM share_value_opinions WHERE id=? AND user_id=?").bind(withdraw[1],me.id).first();
    if(!row)fail(404,"내 가격 의견을 찾을 수 없어요.");if(row.state==="withdrawn")return json({withdrawn:true,duplicate:true});
    const result=await db.batch([db.prepare("UPDATE share_value_opinions SET state='withdrawn',revision=revision+1,write_token=?,updated_at=? WHERE id=? AND user_id=? AND revision=?").bind(crypto.randomUUID(),time,row.id,me.id,expected),db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,'value.withdraw',?,'{}',? WHERE changes()=1").bind("event-"+crypto.randomUUID(),me.id,row.id,time)]);
    if(!result[0].meta.changes)fail(409,"의견이 변경됐어요. 최신 상태를 확인해 주세요.");return json({withdrawn:true});
  }
  if(!path.startsWith("/api/admin/value-opinions"))return null;
  admin();
  if(moderate&&method==="POST"){
    const input=await bodyJSON(request),expected=revision(input),reason=typeof input.reason==="string"?input.reason.trim():"";
    if(!["exclude","restore"].includes(input.action)||reason.length<10||reason.length>1000)fail(400,"집계 제외·복구와 10~1,000자의 처리 사유를 입력해 주세요.");
    const result=await db.batch([db.prepare("UPDATE share_value_opinions SET moderation=?,moderation_reason=?,moderation_by=?,moderation_at=?,revision=revision+1 WHERE id=? AND revision=?").bind(input.action==="exclude"?"excluded":"normal",reason,identity.id,time,moderate[1],expected),db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1").bind("event-"+crypto.randomUUID(),identity.id,"value."+input.action,moderate[1],JSON.stringify({reason}),time)]);
    if(!result[0].meta.changes)fail(409,"의견이나 처리 상태가 바뀌었어요. 새로고침해 주세요.");return json({updated:true});
  }
  if(path==="/api/admin/value-opinions"&&method==="GET"){
    const page=pageNumber(url),total=(await db.prepare("SELECT count(*) AS n FROM share_value_opinions").first()).n,pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
    const rows=await db.prepare("SELECT * FROM share_value_opinions ORDER BY updated_at DESC,id LIMIT 20 OFFSET ?").bind((current-1)*20).all();
    return json({opinions:rows.results.map(privateOpinion),total,page:current,pages});
  }
  const adminDetail=path.match(/^\/api\/admin\/value-opinions\/([a-zA-Z0-9-]+)$/);
  if(adminDetail&&method==="GET"&&!["summary","export"].includes(adminDetail[1])){
    const row=await db.prepare("SELECT * FROM share_value_opinions WHERE id=?").bind(adminDetail[1]).first();
    if(!row)fail(404,"가격 의견을 찾을 수 없어요.");return json({opinion:privateOpinion(row)});
  }
  if(["/api/admin/value-opinions/summary","/api/admin/value-opinions/export"].includes(path)&&method==="GET"){
    const filters={category:url.searchParams.get("category")||"all",topic:url.searchParams.get("topic")||"all",maturity:url.searchParams.get("maturity")||"all",license:url.searchParams.get("license")||"all",role:url.searchParams.get("role")||"all",days:Number(url.searchParams.get("days")??90)};
    for(const [key,choices] of [["category",CATALOG],["topic",TOPICS],["maturity",MATURITY_LABELS],["license",SHARE_LICENSES]])if(filters[key]!=="all"&&!Object.hasOwn(choices,filters[key]))fail(400,"통계 필터를 확인해 주세요.");
    if(!["all","buyer","seller"].includes(filters.role)||![0,30,90,365].includes(filters.days)||filters.category!=="all"&&filters.topic!=="all"&&TOPICS[filters.topic].category!==filters.category)fail(400,"통계 기간·역할·종류를 확인해 주세요.");
    const where=["s.status='published'","o.source_hash=c.content_hash","o.question_version=?","o.state='active'","o.moderation='normal'","o.user_id!=s.author_id"],params=[VALUE_QUESTION_VERSION];
    for(const [key,column] of [["category","s.category"],["topic","s.topic"],["maturity","o.maturity"],["license","s.license"],["role","o.role_snapshot"]])if(filters[key]!=="all"){where.push(column+"=?");params.push(filters[key]);}
    if(filters.days){where.push("o.updated_at>=?");params.push(new Date(Date.parse(time)-filters.days*86400000).toISOString());}
    const rows=await db.prepare("SELECT o.share_id,o.user_id,o.maturity,o.view_amount,o.use_amount,s.author_id,s.category,s.topic,s.license,s.terms_version FROM share_value_opinions o JOIN shared_ideas s ON s.id=o.share_id JOIN share_value_sources c ON c.share_id=s.id WHERE "+where.join(" AND ")+" ORDER BY o.id LIMIT ?").bind(...params,MAX_REPORT_ROWS+1).all();
    if(rows.results.length>MAX_REPORT_ROWS)fail(422,"집계 대상이 20,000개를 넘어요. 기간·분야를 좁혀 다시 조회해 주세요. 일부 자료만으로 통계를 만들지 않았어요.");
    const eligible=rows.results.filter(row=>!isOperator({id:row.user_id},env));
    const report={generatedAt:time,questionVersion:VALUE_QUESTION_VERSION,currency:"KRW",source:"free-sharing-hypothetical-opinions",automaticPriceChange:false,filters,thresholds:VALUE_THRESHOLDS,
      note:"무료 나눔 글에 대한 가정 의견입니다. 실제 거래가나 구매 의사 확약이 아닙니다. 분야·참여자가 판단한 완성도·이용 조건별로 나누며 권장 상한액은 자동 변경하지 않습니다.",
      totals:{opinions:eligible.length,participants:new Set(eligible.map(row=>row.user_id)).size,ideas:new Set(eligible.map(row=>row.share_id)).size,creators:new Set(eligible.map(row=>row.author_id)).size},groups:calibrationGroups(eligible)};
    if(path.endsWith("/export")){
      const format=url.searchParams.get("format")||"csv";if(!["csv","json"].includes(format))fail(400,"CSV 또는 JSON 형식을 선택해 주세요.");
      return new Response(format==="csv"?valueSummaryCSV(report):JSON.stringify(report,null,2),{headers:{"Content-Type":format==="csv"?"text/csv; charset=utf-8":"application/json; charset=utf-8","Cache-Control":"private, no-store","Content-Disposition":'attachment; filename="seed-community-price-summary.'+format+'"',"X-Content-Type-Options":"nosniff"}});
    }
    return json(report);
  }
  return null;
}
