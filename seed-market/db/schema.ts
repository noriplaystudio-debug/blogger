import {sql} from "drizzle-orm";
import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,check} from "drizzle-orm/sqlite-core";
export const users=sqliteTable("users",{
 id:text("id").primaryKey(),role:text("role").notNull(),name:text("name").notNull(),createdAt:text("created_at").notNull()
},()=>[check("users_role",sql.raw("role IN ('seller','buyer')"))]);
export const ideas=sqliteTable("ideas",{
 id:text("id").primaryKey(),sellerId:text("seller_id").notNull().references(()=>users.id),title:text("title").notNull(),summary:text("summary").notNull(),category:text("category").notNull(),maturity:text("maturity").notNull(),
 viewPrice:integer("view_price").notNull(),usePrice:integer("use_price").notNull(),tags:text("tags").notNull(),status:text("status").notNull().default("active"),exclusiveBuyerId:text("exclusive_buyer_id").references(()=>users.id),licenseOrderId:text("license_order_id"),isSample:integer("is_sample").notNull().default(0),art:text("art").notNull().default("notes"),createdAt:text("created_at").notNull()
},t=>[index("ideas_category_status").on(t.category,t.status),check("ideas_view_price",sql.raw("view_price >= 1000")),check("ideas_use_price",sql.raw("use_price >= view_price")),check("ideas_status",sql.raw("status IN ('active','sold')"))]);
export const details=sqliteTable("idea_details",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),problem:text("problem").notNull(),solution:text("solution").notNull(),audience:text("audience").notNull(),execution:text("execution").notNull(),deliverables:text("deliverables").notNull()
});
export const uploads=sqliteTable("uploads",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>users.id),ideaId:text("idea_id").references(()=>ideas.id),kind:text("kind").notNull(),objectKey:text("object_key").notNull().unique(),contentType:text("content_type").notNull(),size:integer("size").notNull(),createdAt:text("created_at").notNull()
},t=>[index("uploads_idea").on(t.ideaId,t.kind),check("uploads_kind",sql.raw("kind IN ('public','private')"))]);
export const orders=sqliteTable("orders",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id),ideaId:text("idea_id").notNull().references(()=>ideas.id),kind:text("kind").notNull(),amount:integer("amount").notNull(),mode:text("mode").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull()
},t=>[index("orders_user").on(t.userId,t.createdAt),index("orders_idea").on(t.ideaId),check("orders_kind",sql.raw("kind IN ('view','use')")),check("orders_mode",sql.raw("mode = 'test'")),check("orders_status",sql.raw("status = 'paid'"))]);
export const viewGrants=sqliteTable("view_grants",{
 ideaId:text("idea_id").notNull().references(()=>ideas.id),userId:text("user_id").notNull().references(()=>users.id),orderId:text("order_id").notNull().unique().references(()=>orders.id),createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.ideaId,t.userId]})]);
export const licenses=sqliteTable("licenses",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),userId:text("user_id").notNull().references(()=>users.id),orderId:text("order_id").notNull().unique().references(()=>orders.id),createdAt:text("created_at").notNull()
});
export const pledges=sqliteTable("pledges",{
 orderId:text("order_id").primaryKey().references(()=>orders.id),userId:text("user_id").notNull().references(()=>users.id),ideaId:text("idea_id").notNull().references(()=>ideas.id),kind:text("kind").notNull(),version:text("version").notNull(),text:text("text").notNull(),agreedAt:text("agreed_at").notNull()
});
export const bookmarks=sqliteTable("bookmarks",{
 userId:text("user_id").notNull().references(()=>users.id),ideaId:text("idea_id").notNull().references(()=>ideas.id)
},t=>[primaryKey({columns:[t.userId,t.ideaId]})]);
export const platformSettings=sqliteTable("platform_settings",{
 id:text("id").primaryKey(),viewBps:integer("view_bps").notNull(),useBps:integer("use_bps").notNull(),holdDays:integer("hold_days").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull()
},()=>[check("platform_settings_id",sql.raw("id='default'")),check("platform_view_bps",sql.raw("view_bps BETWEEN 0 AND 5000")),check("platform_use_bps",sql.raw("use_bps BETWEEN 0 AND 5000")),check("platform_hold_days",sql.raw("hold_days BETWEEN 1 AND 30"))]);
export const ideaReviews=sqliteTable("idea_reviews",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),status:text("status").notNull(),reason:text("reason"),reviewerId:text("reviewer_id"),reviewedAt:text("reviewed_at"),createdAt:text("created_at").notNull()
},()=>[check("review_status",sql.raw("status IN ('pending','approved','rejected','suspended')"))]);
export const ideaQuality=sqliteTable("idea_quality",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),originality:text("originality").notNull(),validationNote:text("validation_note").notNull(),risks:text("risks").notNull(),contentHash:text("content_hash").notNull(),version:integer("version").notNull().default(1),createdAt:text("created_at").notNull()
});
export const listingTerms=sqliteTable("listing_terms",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),viewBps:integer("view_bps").notNull(),useBps:integer("use_bps").notNull(),holdDays:integer("hold_days").notNull(),version:text("version").notNull(),text:text("text").notNull(),agreedAt:text("agreed_at").notNull()
});
export const orderFinancials=sqliteTable("order_financials",{
 orderId:text("order_id").primaryKey().references(()=>orders.id),sellerId:text("seller_id").notNull().references(()=>users.id),gross:integer("gross").notNull(),commissionBps:integer("commission_bps").notNull(),platformFee:integer("platform_fee").notNull(),sellerAmount:integer("seller_amount").notNull(),holdUntil:text("hold_until").notNull()
},t=>[index("finance_seller").on(t.sellerId,t.holdUntil),check("finance_bps",sql.raw("commission_bps BETWEEN 0 AND 5000")),check("finance_conservation",sql.raw("platform_fee+seller_amount=gross"))]);
export const payoutRequests=sqliteTable("payout_requests",{
 id:text("id").primaryKey(),sellerId:text("seller_id").notNull().references(()=>users.id),amount:integer("amount").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull(),paidAt:text("paid_at"),handledBy:text("handled_by")
},()=>[check("payout_positive",sql.raw("amount>0")),check("payout_status",sql.raw("status IN ('requested','paid','cancelled')"))]);
export const settlementItems=sqliteTable("settlement_items",{
 orderId:text("order_id").primaryKey().references(()=>orderFinancials.orderId),payoutId:text("payout_id").references(()=>payoutRequests.id),voidedAt:text("voided_at")
});
export const cases=sqliteTable("cases",{
 id:text("id").primaryKey(),userId:text("user_id").notNull().references(()=>users.id),ideaId:text("idea_id").notNull().references(()=>ideas.id),orderId:text("order_id").references(()=>orders.id),kind:text("kind").notNull(),reason:text("reason").notNull(),message:text("message").notNull(),status:text("status").notNull(),resolution:text("resolution"),sellerResponse:text("seller_response"),createdAt:text("created_at").notNull(),closedAt:text("closed_at"),handledBy:text("handled_by")
},t=>[index("cases_idea_status").on(t.ideaId,t.status),uniqueIndex("cases_one_open").on(t.userId,t.ideaId,t.kind).where(sql.raw("status IN ('open','reviewing')")),check("case_kind",sql.raw("kind IN ('report','refund','dispute')")),check("case_status",sql.raw("status IN ('open','reviewing','resolved','rejected')"))]);
export const refunds=sqliteTable("refunds",{
 id:text("id").primaryKey(),orderId:text("order_id").notNull().unique().references(()=>orders.id),grossReversal:integer("gross_reversal").notNull(),feeReversal:integer("fee_reversal").notNull(),sellerReversal:integer("seller_reversal").notNull(),reason:text("reason").notNull(),handledBy:text("handled_by").notNull(),createdAt:text("created_at").notNull(),mode:text("mode").notNull()
},()=>[check("refund_mode",sql.raw("mode='test'"))]);
export const auditEvents=sqliteTable("audit_events",{
 id:text("id").primaryKey(),actorId:text("actor_id").notNull(),action:text("action").notNull(),targetId:text("target_id").notNull(),detail:text("detail").notNull(),createdAt:text("created_at").notNull()
});
export const accessRecords=sqliteTable("access_records",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),ideaId:text("idea_id").notNull().references(()=>ideas.id),kind:text("kind").notNull(),actorRole:text("actor_role").notNull(),version:integer("version").notNull(),contentHash:text("content_hash"),firstAccessedAt:text("first_accessed_at").notNull()
},t=>[uniqueIndex("access_user_idea_kind").on(t.userId,t.ideaId,t.kind),check("access_kind",sql.raw("kind IN ('detail','image')"))]);
export const ideaTaxonomy=sqliteTable("idea_taxonomy",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),topic:text("topic").notNull()
},t=>[index("taxonomy_topic").on(t.topic)]);
export const ideaClassification=sqliteTable("idea_classification",{
 ideaId:text("idea_id").primaryKey().references(()=>ideas.id),kind:text("kind").notNull(),topic:text("topic").notNull(),domains:text("domains").notNull(),version:text("version").notNull(),confirmedAt:text("confirmed_at").notNull()
},t=>[index("classification_kind_topic").on(t.kind,t.topic)]);
export const listingRequests=sqliteTable("listing_requests",{
 id:text("id").primaryKey(),sellerId:text("seller_id").notNull().references(()=>users.id),ideaId:text("idea_id").notNull().references(()=>ideas.id),kind:text("kind").notNull(),payloadHash:text("payload_hash").notNull(),version:integer("version").notNull(),token:text("token").notNull(),createdAt:text("created_at").notNull()
},t=>[index("listing_requests_seller").on(t.sellerId,t.createdAt),check("listing_request_kind",sql.raw("kind IN ('create','revise')"))]);
export const uploadCleanup=sqliteTable("upload_cleanup",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>users.id),objectKey:text("object_key").notNull(),createdAt:text("created_at").notNull()
},t=>[index("upload_cleanup_owner").on(t.ownerId,t.createdAt)]);
export const orderPriceGuidance=sqliteTable("order_price_guidance",{
 orderId:text("order_id").primaryKey().references(()=>orders.id),guidance:text("guidance").notNull(),createdAt:text("created_at").notNull()
});
export const sharedIdeas=sqliteTable("shared_ideas",{
 id:text("id").primaryKey(),authorId:text("author_id").notNull().references(()=>users.id),title:text("title").notNull(),summary:text("summary").notNull(),body:text("body").notNull(),category:text("category").notNull(),topic:text("topic").notNull(),license:text("license").notNull(),licenseText:text("license_text").notNull(),termsVersion:text("terms_version").notNull(),status:text("status").notNull(),version:integer("version").notNull().default(1),requestId:text("request_id").notNull().unique(),payloadHash:text("payload_hash").notNull(),reviewReason:text("review_reason"),reviewerId:text("reviewer_id"),reviewedAt:text("reviewed_at"),createdAt:text("created_at").notNull()
},t=>[index("shared_ideas_status_category").on(t.status,t.category,t.createdAt),index("shared_ideas_author").on(t.authorId,t.createdAt),check("shared_ideas_license",sql.raw("license IN ('discussion','attribution')")),check("shared_ideas_status",sql.raw("status IN ('pending','published','rejected','hidden')"))]);
export const shareValueSources=sqliteTable("share_value_sources",{
 shareId:text("share_id").primaryKey().references(()=>sharedIdeas.id),contentHash:text("content_hash").notNull(),sourceVersion:integer("source_version").notNull(),updatedAt:text("updated_at").notNull()
});
export const shareValueOpinions=sqliteTable("share_value_opinions",{
 id:text("id").primaryKey(),shareId:text("share_id").notNull().references(()=>sharedIdeas.id),userId:text("user_id").notNull().references(()=>users.id),sourceHash:text("source_hash").notNull(),sourceVersion:integer("source_version").notNull(),sourceTitle:text("source_title").notNull(),sourceCategory:text("source_category").notNull(),sourceTopic:text("source_topic").notNull(),sourceLicense:text("source_license").notNull(),sourceLicenseText:text("source_license_text").notNull(),sourceTermsVersion:text("source_terms_version").notNull(),questionVersion:text("question_version").notNull(),maturity:text("maturity").notNull(),viewAmount:integer("view_amount"),useAmount:integer("use_amount"),reason:text("reason").notNull(),roleSnapshot:text("role_snapshot").notNull(),state:text("state").notNull(),moderation:text("moderation").notNull(),moderationReason:text("moderation_reason"),moderationBy:text("moderation_by"),moderationAt:text("moderation_at"),revision:integer("revision").notNull(),payloadHash:text("payload_hash").notNull(),writeToken:text("write_token").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},t=>[uniqueIndex("share_value_one_current").on(t.shareId,t.userId,t.sourceHash,t.questionVersion),index("share_value_public").on(t.shareId,t.sourceHash,t.questionVersion,t.state,t.moderation),index("share_value_user").on(t.userId,t.updatedAt),index("share_value_period").on(t.questionVersion,t.updatedAt),check("share_value_maturity",sql.raw("maturity IN ('seed','developed','professional')")),check("share_value_role",sql.raw("role_snapshot IN ('seller','buyer')")),check("share_value_state",sql.raw("state IN ('active','withdrawn')")),check("share_value_moderation",sql.raw("moderation IN ('normal','excluded')")),check("share_value_revision",sql.raw("revision >= 1")),check("share_value_view",sql.raw("view_amount IS NULL OR view_amount BETWEEN 0 AND 100000000")),check("share_value_use",sql.raw("use_amount IS NULL OR use_amount BETWEEN 0 AND 100000000")),check("share_value_some_amount",sql.raw("view_amount IS NOT NULL OR use_amount IS NOT NULL"))]);
