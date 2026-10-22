import {fail} from "./policy.mjs";
export const DEFAULT_COMMERCE = Object.freeze({viewBps:1000,useBps:1000,holdDays:7});
export const iso=(context={})=>new Date(context.clock?context.clock():Date.now()).toISOString();
export function isOperator(identity,env={}){
  return Boolean(identity?.id&&String(env.ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean).includes(identity.id));
}
export async function commerceSettings(db){
  const row=await db.prepare("SELECT view_bps,use_bps,hold_days FROM platform_settings WHERE id='default'").first();
  return row?{viewBps:row.view_bps,useBps:row.use_bps,holdDays:row.hold_days}:DEFAULT_COMMERCE;
}
export async function listingCommerce(db,id){
  const row=await db.prepare("SELECT view_bps,use_bps,hold_days FROM listing_terms WHERE idea_id=?").bind(id).first();
  return row?{viewBps:row.view_bps,useBps:row.use_bps,holdDays:row.hold_days}:commerceSettings(db);
}
export function amounts(gross,bps){
  if(!Number.isSafeInteger(gross)||gross<0||!Number.isSafeInteger(bps)||bps<0||bps>5000)fail(400,"수수료 계산 값을 확인해 주세요.");
  const platformFee=Math.floor(gross*bps/10000);
  return {gross,commissionBps:bps,platformFee,sellerAmount:gross-platformFee};
}
export function financialStatements(db,{orderId,ideaId,buyerId,kind,amount,time,settings}){
  const bps=kind==="view"?settings.viewBps:settings.useBps;
  const value=amounts(amount,bps);
  const until=new Date(Date.parse(time)+settings.holdDays*86400000).toISOString();
  return [
    db.prepare("INSERT OR IGNORE INTO order_financials(order_id,seller_id,gross,commission_bps,platform_fee,seller_amount,hold_until) SELECT o.id,i.seller_id,?,?,?,?,? FROM orders o JOIN ideas i ON i.id=o.idea_id WHERE o.id=? AND o.idea_id=? AND o.user_id=? AND o.kind=?").bind(value.gross,bps,value.platformFee,value.sellerAmount,until,orderId,ideaId,buyerId,kind),
    db.prepare("INSERT OR IGNORE INTO settlement_items(order_id) SELECT order_id FROM order_financials WHERE order_id=?").bind(orderId)
  ];
}
export async function reviewState(db,id){
  const row=await db.prepare("SELECT status,reason,reviewed_at FROM idea_reviews WHERE idea_id=?").bind(id).first();
  return row||{status:"approved",reason:null,reviewed_at:null};
}
export async function notRefunded(db,orderId){
  return !await db.prepare("SELECT 1 FROM refunds WHERE order_id=?").bind(orderId).first();
}
export const eligibleSQL="s.payout_id IS NULL AND s.voided_at IS NULL AND f.hold_until<=? AND NOT EXISTS(SELECT 1 FROM cases c JOIN orders co ON co.id=f.order_id WHERE (c.idea_id=co.idea_id OR c.order_id=co.id) AND c.status IN ('open','reviewing'))";
export async function sellerFinance(db,sellerId,time){
  const result=await db.prepare("SELECT COALESCE(SUM(f.gross),0) AS gross,COALESCE(SUM(f.platform_fee),0) AS commission,COALESCE(SUM(CASE WHEN s.voided_at IS NULL THEN f.platform_fee ELSE 0 END),0) AS netCommission,COALESCE(SUM(f.seller_amount),0) AS sellerTotal,COALESCE(SUM(CASE WHEN s.voided_at IS NOT NULL THEN f.gross ELSE 0 END),0) AS refundedGross FROM order_financials f JOIN settlement_items s ON s.order_id=f.order_id WHERE f.seller_id=?").bind(sellerId).first();
  const ready=await db.prepare("SELECT COALESCE(SUM(f.seller_amount),0) AS amount FROM order_financials f JOIN settlement_items s ON s.order_id=f.order_id WHERE f.seller_id=? AND "+eligibleSQL).bind(sellerId,time).first();
  const payouts=await db.prepare("SELECT id,amount,status,created_at,paid_at FROM payout_requests WHERE seller_id=? ORDER BY created_at DESC").bind(sellerId).all();
  const items=await db.prepare("SELECT o.id,o.idea_id,o.kind,o.created_at,f.gross,f.commission_bps,f.platform_fee,f.seller_amount,f.hold_until,s.payout_id,s.voided_at,i.title FROM order_financials f JOIN orders o ON o.id=f.order_id JOIN settlement_items s ON s.order_id=f.order_id JOIN ideas i ON i.id=o.idea_id WHERE f.seller_id=? ORDER BY o.created_at DESC LIMIT 300").bind(sellerId).all();
  return {...result,available:ready.amount,payouts:payouts.results,items:items.results,mode:"test",note:"PG 비용·세금 차감 전의 테스트 정산 예상액입니다."};
}
