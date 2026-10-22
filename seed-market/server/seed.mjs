import {SAMPLES} from "./demo-data.mjs";
import {DEFAULT_COMMERCE} from "./commerce.mjs";
import {SELLER_TERMS_VERSION,sellerTermsText} from "./policy.mjs";
import {TYPE_EXAMPLES} from "./type-examples.mjs";
import {TAXONOMY_VERSION} from "../public/assets/catalog.js";
const originalTypes=[
 ["software","software-ai",["work"]],["service","service-local",["local","culture"]],["business","business-b2b",["environment","work"]],
 ["writing","writing-publish",["culture"]],["service","service-matching",["community","learning"]],["software","software-app",["living"]],
 ["business","business-revenue",["food","local"]],["software","software-work",["work"]],["writing","writing-publish",["culture","local"]]
];
export const EXAMPLES=Object.freeze([...SAMPLES.map((idea,index)=>({...idea,category:originalTypes[index][0],topic:originalTypes[index][1],domainIds:originalTypes[index][2]})),...TYPE_EXAMPLES]);
export async function seedExamples(db){
  const time=new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO users(id,role,name,created_at) VALUES('sample-creator','seller','seed 샘플 스튜디오',?)").bind(time).run();
  for(const [index,idea] of EXAMPLES.entries()){
    if(await db.prepare("SELECT 1 FROM ideas WHERE id=?").bind(idea.id).first())continue;
    await db.batch([
      db.prepare("INSERT INTO ideas(id,seller_id,title,summary,category,maturity,view_price,use_price,tags,is_sample,art,created_at) VALUES(?,'sample-creator',?,?,?,?,?,?,?,1,?,?)").bind(idea.id,idea.title,idea.summary,idea.category,index%3===0?"professional":index%3===1?"developed":"seed",Math.round(idea.price/10000)*1000,idea.price,JSON.stringify(idea.tags),idea.art,time),
      db.prepare("INSERT INTO idea_details(idea_id,problem,solution,audience,execution,deliverables) VALUES(?,?,?,?,?,?)").bind(idea.id,idea.body?.problem||"이 아이디어의 배경과 의도를 담은 샘플 기획입니다.",idea.body?.solution||idea.plan,idea.body?.audience||"새로운 구상의 활용 가능성을 검토하는 창작자와 실행자.",idea.body?.execution||idea.plan,JSON.stringify(idea.deliverables)),
      db.prepare("INSERT INTO idea_taxonomy(idea_id,topic) VALUES(?,?)").bind(idea.id,idea.topic),
      db.prepare("INSERT INTO idea_classification(idea_id,kind,topic,domains,version,confirmed_at) VALUES(?,?,?,?,?,?)").bind(idea.id,idea.category,idea.topic,JSON.stringify(idea.domainIds),TAXONOMY_VERSION,time),
      db.prepare("INSERT INTO idea_reviews(idea_id,status,reason,created_at) VALUES(?,'approved','서비스 흐름을 위한 창작 샘플입니다.',?)").bind(idea.id,time),
      db.prepare("INSERT INTO listing_terms(idea_id,view_bps,use_bps,hold_days,version,text,agreed_at) VALUES(?,?,?,?,?,?,?)").bind(idea.id,DEFAULT_COMMERCE.viewBps,DEFAULT_COMMERCE.useBps,DEFAULT_COMMERCE.holdDays,SELLER_TERMS_VERSION,sellerTermsText(DEFAULT_COMMERCE),time)
    ]);
  }
}
