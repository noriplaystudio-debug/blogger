import {fail} from "./policy.mjs";
import {commerceSettings,sellerFinance,eligibleSQL,iso,isOperator} from "./commerce.mjs";
import {adminAuthSettings} from "../auth/settings.mjs";
import {patentRecord,validatePatentReview,patentIntegrationSettings} from "./patents.mjs";
const activeCase="status IN ('open','reviewing')";
function text(value,min,max,label){
  if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)fail(400,label+"은 "+min+"~"+max+"자로 입력해 주세요.");
  return value.trim();
}
function audit(db,actor,action,target,detail,time,condition="1",params=[]){
  return db.prepare("INSERT INTO audit_events(id,actor_id,action,target_id,detail,created_at) SELECT ?,?,?,?,?,? WHERE "+condition).bind("event-"+crypto.randomUUID(),actor,action,target,JSON.stringify(detail),time,...params);
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function handleOperations({path,method,request,env,context,db,identity,me,member,bodyJSON,json}){
  const admin=()=>{if(!identity)fail(401,"로그인 후 이용해 주세요.");if(!isOperator(identity,env))fail(403,"운영자만 이용할 수 있어요.");};
  const time=iso(context);
  if(path==="/api/seller/finance"&&method==="GET"){
    member("seller");return json(await sellerFinance(db,me.id,time));
  }
  if(path==="/api/seller/payouts"&&method==="POST"){
    member("seller");if(env.PAYMENTS_MODE!=="test")fail(503,"정산 서비스가 연결되지 않았습니다.");
    const key=request.headers.get("Idempotency-Key");
    if(!key||!/^[a-zA-Z0-9-]{8,128}$/.test(key))fail(400,"정산 요청 식별자를 확인해 주세요.");
    const id="payout-"+await digest(me.id+"\n"+key),prior=await db.prepare("SELECT * FROM payout_requests WHERE id=? AND seller_id=?").bind(id,me.id).first();
    if(prior)return json({payout:prior,duplicate:true});
    const results=await db.batch([
      db.prepare("INSERT OR IGNORE INTO payout_requests(id,seller_id,amount,status,created_at) SELECT ?,?,SUM(f.seller_amount),'requested',? FROM order_financials f JOIN settlement_items s ON s.order_id=f.order_id WHERE f.seller_id=? AND "+eligibleSQL+" HAVING SUM(f.seller_amount)>0").bind(id,me.id,time,me.id,time),
      db.prepare("UPDATE settlement_items SET payout_id=? WHERE order_id IN(SELECT f.order_id FROM order_financials f JOIN settlement_items s ON s.order_id=f.order_id WHERE f.seller_id=? AND "+eligibleSQL+") AND EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND seller_id=?)").bind(id,me.id,time,id,me.id),
      audit(db,me.id,"payout.request",id,{mode:"test"},time,"EXISTS(SELECT 1 FROM payout_requests WHERE id=?)",[id])
    ]);
    const payout=await db.prepare("SELECT * FROM payout_requests WHERE id=? AND seller_id=?").bind(id,me.id).first();
    if(!payout)fail(409,"대기 기간이 끝나고 분쟁이 없는 정산 가능 금액이 없어요.");
    return json({payout,note:"요청만 접수됐습니다. 실제 송금은 발생하지 않습니다."},201);
  }
  if(path==="/api/cases"&&method==="GET"){
    member();
    const rows=await db.prepare("SELECT c.*,i.title,u.name AS requester_name,(SELECT MIN(first_accessed_at) FROM access_records a WHERE a.idea_id=c.idea_id AND a.user_id=c.user_id) AS first_accessed_at FROM cases c JOIN ideas i ON i.id=c.idea_id JOIN users u ON u.id=c.user_id WHERE c.user_id=? OR i.seller_id=? ORDER BY c.created_at DESC LIMIT 300").bind(me.id,me.id).all();
    return json({cases:rows.results});
  }
  if(path==="/api/cases"&&method==="POST"){
    member();const data=await bodyJSON(request);
    if(!["report","refund","dispute"].includes(data.kind))fail(400,"접수할 문의 유형을 선택해 주세요.");
    const reason=text(data.reason,2,120,"문의 사유"),message=text(data.message,20,4000,"상세 내용");
    const idea=await db.prepare("SELECT * FROM ideas WHERE id=?").bind(typeof data.ideaId==="string"?data.ideaId:"").first();
    if(!idea)fail(404,"아이디어를 찾을 수 없어요.");
    const purchased=await db.prepare("SELECT 1 FROM orders WHERE idea_id=? AND user_id=?").bind(idea.id,me.id).first();
    const review=await db.prepare("SELECT status FROM idea_reviews WHERE idea_id=?").bind(idea.id).first();
    if(review&&review.status!=="approved"&&!purchased&&idea.seller_id!==me.id)fail(404,"공개된 아이디어를 찾을 수 없어요.");
    let order=null;
    if(data.kind!=="report"){
      if(me.role!=="buyer")fail(403,"구매자만 거래 관련 문의를 접수할 수 있어요.");
      order=await db.prepare("SELECT * FROM orders WHERE id=? AND user_id=? AND idea_id=?").bind(typeof data.orderId==="string"?data.orderId:"",me.id,idea.id).first();
      if(!order)fail(404,"내 구매 내역을 찾을 수 없어요.");
      if(await db.prepare("SELECT 1 FROM refunds WHERE order_id=?").bind(order.id).first())fail(409,"이미 테스트 환불이 완료된 주문이에요.");
    }
    const count=await db.prepare("SELECT count(*) AS n FROM cases WHERE user_id=? AND "+activeCase).bind(me.id).first();
    if(count.n>=10)fail(429,"진행 중인 문의가 많아요. 기존 문의에서 먼저 확인해 주세요.");
    const id="case-"+crypto.randomUUID();
    try{
      await db.batch([
        db.prepare("INSERT INTO cases(id,user_id,idea_id,order_id,kind,reason,message,status,created_at) VALUES(?,?,?,?,?,?,?,'open',?)").bind(id,me.id,idea.id,order?.id??null,data.kind,reason,message,time),
        audit(db,me.id,"case.open",id,{kind:data.kind,ideaId:idea.id},time)
      ]);
    }catch(error){if(String(error.message).includes("UNIQUE"))fail(409,"같은 아이디어에 진행 중인 같은 유형의 문의가 있어요.");throw error;}
    return json({id,status:"open",note:"관련 거래 정산은 검토가 끝날 때까지 보류됩니다."},201);
  }
  const sellerReply=path.match(/^\/api\/cases\/([a-zA-Z0-9-]+)\/reply$/);
  if(sellerReply&&method==="POST"){
    member("seller");const data=await bodyJSON(request),reply=text(data.message,10,4000,"판매자 답변");
    const result=await db.batch([
      db.prepare("UPDATE cases SET seller_response=? WHERE id=? AND "+activeCase+" AND idea_id IN(SELECT id FROM ideas WHERE seller_id=?)").bind(reply,sellerReply[1],me.id),
      audit(db,me.id,"case.seller_reply",sellerReply[1],{},time,"changes()=1")
    ]);
    if(!result[0].meta.changes)fail(404,"답변할 수 있는 진행 중 문의를 찾을 수 없어요.");
    return json({updated:true});
  }
  if(!path.startsWith("/api/admin/"))return null;
  admin();
  if(path==="/api/admin/settings"&&method==="GET")return json({commerce:await commerceSettings(db),auth:adminAuthSettings(env,context.authBackend||"sites"),patent:patentIntegrationSettings(env),paymentMode:env.PAYMENTS_MODE==="test"?"test":"disabled"});
  if(path==="/api/admin/settings"&&method==="POST"){
    const data=await bodyJSON(request);
    for(const k of ["viewBps","useBps"])if(!Number.isSafeInteger(data[k])||data[k]<0||data[k]>5000)fail(400,"수수료율은 0~50% 범위의 basis point 정수로 입력해 주세요.");
    if(!Number.isSafeInteger(data.holdDays)||data.holdDays<1||data.holdDays>30)fail(400,"정산 대기 기간은 1~30일로 입력해 주세요.");
    const reason=text(data.reason,10,500,"변경 사유");
    await db.batch([
      db.prepare("INSERT INTO platform_settings(id,view_bps,use_bps,hold_days,updated_by,updated_at) VALUES('default',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET view_bps=excluded.view_bps,use_bps=excluded.use_bps,hold_days=excluded.hold_days,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(data.viewBps,data.useBps,data.holdDays,identity.id,time),
      audit(db,identity.id,"settings.change","default",{viewBps:data.viewBps,useBps:data.useBps,holdDays:data.holdDays,reason},time)
    ]);
    return json({commerce:await commerceSettings(db),appliesTo:"새로 등록되는 아이디어에 적용됩니다. 기존 판매 조건과 주문은 유지됩니다."});
  }
  if(path==="/api/admin/overview"&&method==="GET"){
    const totals=await db.prepare("SELECT COALESCE(SUM(f.gross),0) AS gross,COALESCE(SUM(f.platform_fee),0) AS commission,COALESCE(SUM(CASE WHEN r.order_id IS NOT NULL THEN f.gross ELSE 0 END),0) AS refunds,COALESCE(SUM(CASE WHEN r.order_id IS NULL THEN f.platform_fee ELSE 0 END),0) AS netCommission FROM order_financials f LEFT JOIN refunds r ON r.order_id=f.order_id").first();
    const reviews=await db.prepare("SELECT i.id,i.title,i.category,i.maturity,i.status AS sale_status,u.name AS seller,r.status,r.reason,r.created_at FROM idea_reviews r JOIN ideas i ON i.id=r.idea_id JOIN users u ON u.id=i.seller_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300").all();
    const cases=await db.prepare("SELECT c.*,i.title,u.name AS requester_name,(SELECT MIN(first_accessed_at) FROM access_records a WHERE a.idea_id=c.idea_id AND a.user_id=c.user_id) AS first_accessed_at FROM cases c JOIN ideas i ON i.id=c.idea_id JOIN users u ON u.id=c.user_id ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,c.created_at DESC LIMIT 300").all();
    const payouts=await db.prepare("SELECT p.*,u.name AS seller_name FROM payout_requests p JOIN users u ON u.id=p.seller_id ORDER BY p.created_at DESC LIMIT 300").all();
    const events=await db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100").all();
    return json({totals,reviews:reviews.results,cases:cases.results,payouts:payouts.results,events:events.results,mode:"test"});
  }
  const review=path.match(/^\/api\/admin\/ideas\/([a-zA-Z0-9-]+)\/review$/);
  if(review&&method==="POST"){
    const data=await bodyJSON(request);
    if(!["approved","rejected","suspended"].includes(data.status))fail(400,"검토 결과를 선택해 주세요.");
    const reason=text(data.reason,10,1000,"검토 사유"),id=review[1];
    const idea=await db.prepare("SELECT id FROM ideas WHERE id=?").bind(id).first();if(!idea)fail(404,"아이디어를 찾을 수 없어요.");
    const old=await db.prepare("SELECT status FROM idea_reviews WHERE idea_id=?").bind(id).first();
    const quality=await db.prepare("SELECT version FROM idea_quality WHERE idea_id=?").bind(id).first();
    if(data.expectedVersion!==(quality?.version||0))fail(409,"판매자가 등록 내용을 수정했어요. 최신 자료를 다시 확인해 주세요.");
    if(data.expectedStatus!==(old?.status||"approved"))fail(409,"다른 운영자가 검토 상태를 변경했어요. 새로고침해 주세요.");
    const patent=await patentRecord(db,id),patentReview=validatePatentReview(data.patentReview,patent,data.status),reviewToken=crypto.randomUUID(),stmts=[];
    if(patent&&patent.listing_version!==data.expectedVersion)fail(409,"특허 신고와 등록 내용의 버전이 달라요. 자료를 다시 확인해 주세요.");
    if(patentReview)stmts.push(db.prepare("UPDATE idea_patents SET review_state=?,review=?,review_token=?,reviewer_id=?,reviewed_at=?,revision=revision+1 WHERE idea_id=? AND listing_version=? AND revision=? AND EXISTS(SELECT 1 FROM idea_quality WHERE idea_id=? AND version=?) AND EXISTS(SELECT 1 FROM idea_reviews WHERE idea_id=? AND status=?)").bind(patentReview.outcome,JSON.stringify(patentReview),reviewToken,identity.id,time,id,data.expectedVersion,patent.revision,id,data.expectedVersion,id,data.expectedStatus));
    const patentGate=patent?"EXISTS(SELECT 1 FROM idea_patents WHERE idea_id=? AND listing_version=? AND "+(patentReview?"review_token=?":"revision=?")+(data.status==="approved"?" AND review_state='recorded'":"")+")":"NOT EXISTS(SELECT 1 FROM idea_patents WHERE idea_id=?)";
    const patentParams=patent?[id,data.expectedVersion,patentReview?reviewToken:patent.revision]:[id];
    const writeIndex=stmts.length;
    stmts.push(db.prepare("INSERT INTO idea_reviews(idea_id,status,reason,reviewer_id,reviewed_at,created_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT version FROM idea_quality WHERE idea_id=?),0)=? AND "+patentGate+" ON CONFLICT(idea_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at WHERE idea_reviews.status=? AND COALESCE((SELECT version FROM idea_quality WHERE idea_id=?),0)=?").bind(id,data.status,reason,identity.id,time,time,id,data.expectedVersion,...patentParams,data.expectedStatus,id,data.expectedVersion));
    stmts.push(audit(db,identity.id,"idea.review",id,{status:data.status,reason,version:data.expectedVersion,patentReview},time,"changes()=1"));
    const result=await db.batch(stmts);
    if(!result[writeIndex].meta.changes)fail(409,"검토 상태나 특허 자료가 바뀌었어요. 다시 확인해 주세요.");
    return json({status:data.status});
  }
  const decision=path.match(/^\/api\/admin\/cases\/([a-zA-Z0-9-]+)$/);
  if(decision&&method==="POST"){
    const data=await bodyJSON(request),item=await db.prepare("SELECT * FROM cases WHERE id=?").bind(decision[1]).first();
    if(!item)fail(404,"문의 내역을 찾을 수 없어요.");
    if(!["open","reviewing"].includes(item.status))fail(409,"이미 처리된 문의입니다.");
    if(!["reviewing","resolve","reject","refund"].includes(data.action))fail(400,"처리 방식을 선택해 주세요.");
    const resolution=text(data.resolution,10,2000,"처리 내용");
    if(data.action==="refund"){
      if(env.PAYMENTS_MODE!=="test")fail(503,"실제 환불 서비스가 연결되지 않았습니다.");
      if(!item.order_id||!["refund","dispute"].includes(item.kind))fail(400,"환불할 주문이 연결된 거래 문의가 아닙니다.");
      const order=await db.prepare("SELECT * FROM orders WHERE id=?").bind(item.order_id).first();
      if(!order||order.mode!=="test")fail(409,"테스트 주문만 이 화면에서 환불할 수 있어요.");
      if(order.kind==="view"&&await db.prepare("SELECT 1 FROM licenses l JOIN orders o ON o.id=l.order_id LEFT JOIN refunds r ON r.order_id=o.id WHERE l.idea_id=? AND l.user_id=? AND r.id IS NULL").bind(item.idea_id,item.user_id).first())fail(409,"독점 사용권을 보유한 거래입니다. 사용권 반환 조건부터 함께 검토해 주세요.");
      const refundId="refund-"+item.id;
      const result=await db.batch([
        db.prepare("INSERT OR IGNORE INTO refunds(id,order_id,gross_reversal,fee_reversal,seller_reversal,reason,handled_by,created_at,mode) SELECT ?,f.order_id,f.gross,f.platform_fee,f.seller_amount,?,?,?,'test' FROM order_financials f JOIN settlement_items s ON s.order_id=f.order_id WHERE f.order_id=? AND s.payout_id IS NULL AND s.voided_at IS NULL AND EXISTS(SELECT 1 FROM cases WHERE id=? AND "+activeCase+")").bind(refundId,resolution,identity.id,time,order.id,item.id),
        db.prepare("UPDATE settlement_items SET voided_at=? WHERE order_id=? AND EXISTS(SELECT 1 FROM refunds WHERE id=?)").bind(time,order.id,refundId),
        db.prepare("UPDATE cases SET status='resolved',resolution=?,closed_at=?,handled_by=? WHERE id=? AND "+activeCase+" AND EXISTS(SELECT 1 FROM refunds WHERE id=?)").bind(resolution,time,identity.id,item.id,refundId),
        audit(db,identity.id,"case.refund",item.id,{orderId:order.id,mode:"test"},time,"changes()=1")
      ]);
      if(!result[0].meta.changes)fail(409,"이미 환불됐거나 정산에 포함된 주문입니다. 진행 중 정산 요청은 먼저 취소하고, 완료된 정산은 수동 조정해 주세요.");
      return json({status:"resolved",refunded:true,note:"테스트 환불입니다. 실제 환급은 발생하지 않았고 독점 판매완료 아이디어는 자동 재판매하지 않습니다."});
    }
    const status={reviewing:"reviewing",resolve:"resolved",reject:"rejected"}[data.action],closed=["resolved","rejected"].includes(status);
    const result=await db.batch([
      db.prepare("UPDATE cases SET status=?,resolution=?,closed_at=?,handled_by=? WHERE id=? AND "+activeCase).bind(status,resolution,closed?time:null,identity.id,item.id),
      audit(db,identity.id,"case."+data.action,item.id,{resolution},time,"changes()=1")
    ]);
    if(!result[0].meta.changes)fail(409,"문의 상태가 바뀌었어요.");
    return json({status});
  }
  const payoutAction=path.match(/^\/api\/admin\/payouts\/([a-zA-Z0-9-]+)$/);
  if(payoutAction&&method==="POST"){
    if(env.PAYMENTS_MODE!=="test")fail(503,"실제 정산 서비스가 연결되지 않았습니다.");
    const data=await bodyJSON(request),id=payoutAction[1],reason=text(data.reason,10,1000,"처리 사유");
    if(!["pay","cancel"].includes(data.action))fail(400,"정산 처리 방식을 선택해 주세요.");
    const commands=[];
    if(data.action==="pay"){
      commands.push(db.prepare("UPDATE payout_requests SET status='paid',paid_at=?,handled_by=? WHERE id=? AND status='requested' AND amount=(SELECT COALESCE(SUM(f.seller_amount),0) FROM settlement_items s JOIN order_financials f ON f.order_id=s.order_id WHERE s.payout_id=payout_requests.id AND s.voided_at IS NULL) AND NOT EXISTS(SELECT 1 FROM settlement_items s JOIN orders o ON o.id=s.order_id JOIN cases c ON c.idea_id=o.idea_id OR c.order_id=o.id WHERE s.payout_id=payout_requests.id AND c.status IN ('open','reviewing'))").bind(time,identity.id,id));
      commands.push(audit(db,identity.id,"payout.test_paid",id,{reason,mode:"test"},time,"changes()=1"));
    }else{
      commands.push(db.prepare("UPDATE payout_requests SET status='cancelled',handled_by=? WHERE id=? AND status='requested'").bind(identity.id,id));
      commands.push(audit(db,identity.id,"payout.cancel",id,{reason},time,"changes()=1"));
      commands.push(db.prepare("UPDATE settlement_items SET payout_id=NULL WHERE payout_id=? AND EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND status='cancelled')").bind(id,id));
    }
    const result=await db.batch(commands);
    if(!result[0].meta.changes)fail(409,"정산 상태나 진행 중 분쟁을 다시 확인해 주세요.");
    return json({status:data.action==="pay"?"paid":"cancelled",note:"테스트 처리이며 실제 송금은 발생하지 않습니다."});
  }
  fail(404,"운영 기능을 찾을 수 없어요.");
}
