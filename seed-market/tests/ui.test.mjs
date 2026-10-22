import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {createOperationsUI} from "../public/assets/operations.js";
import {escapeHtml as h} from "../public/assets/format.js";
import {ideaCard} from "../public/assets/cards.js";
globalThis.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
globalThis.window={location:{href:"https://seed.test/?token=test-only-token#reset-password"}};
const attack='<img src=x onerror="window.PWNED=1">';
const config={commerce:{viewBps:1000,useBps:1000,holdDays:7},sellerTerms:{version:"draft",text:"판매자 동의"},auth:{backend:"sites",emailEnabled:false,providers:[{id:"naver",label:"네이버",available:false},{id:"kakao",label:"카카오",available:false},{id:"google",label:"Google",available:false}]}};
let auth={profile:{id:"seller",role:"seller"},isAdmin:true,auth:config.auth},current,html="";
const oneCase={id:"case-1",idea_id:"idea-1",user_id:"buyer",order_id:"order-1",kind:"refund",status:"open",title:attack,requester_name:attack,reason:"내용 확인",message:attack,seller_response:attack,created_at:new Date().toISOString(),first_accessed_at:new Date().toISOString()};
const payout={id:"payout-1",amount:4500,status:"requested",seller_name:attack,created_at:new Date().toISOString()};
const overview={totals:{gross:5000,netCommission:500,refunds:0},reviews:[{id:"idea-1",status:"pending",seller:attack,title:attack,reason:attack}],cases:[oneCase],payouts:[payout],events:[{action:"idea.review",actor_id:"operator",target_id:"idea-1",detail:JSON.stringify({reason:attack}),created_at:new Date().toISOString()}]};
const finance={gross:5000,commission:500,netCommission:500,refundedGross:0,available:4500,note:"PG 비용 차감 전",payouts:[payout],items:[{id:"order-1",title:attack,kind:"view",gross:5000,commission_bps:1000,platform_fee:500,seller_amount:4500,created_at:new Date().toISOString(),hold_until:new Date().toISOString()}]};
const account={orders:[{id:"order-1",idea_id:"idea-1",title:attack,kind:"view",amount:5000,effective_status:"paid",created_at:new Date().toISOString()}]};
async function api(path){
 if(path==="/api/admin/overview")return overview;
 if(path==="/api/admin/settings")return {commerce:config.commerce,auth:{...config.auth,baseURL:"https://seed.test",secretReady:true,mailReady:false,providers:config.auth.providers.map(p=>({...p,clientKey:p.id.toUpperCase()+"_CLIENT_ID",secretKey:p.id.toUpperCase()+"_CLIENT_SECRET",callbackURL:"https://seed.test/api/auth/callback/"+p.id,portal:"https://example.invalid"}))}};
 if(path==="/api/seller/finance")return finance;
 if(path==="/api/cases")return {cases:[oneCase]};
 if(path==="/api/account")return account;
 if(path==="/api/ideas/idea-1")return {idea:{title:attack,reviewStatus:"pending"}};
 throw new Error("Unexpected test request "+path);
}
const button=(action,label,id="",classes="button")=>'<button type="button" class="'+h(classes)+'" data-action="'+h(action)+'" data-id="'+h(id)+'">'+h(label)+'</button>';
const context={api,post:async()=>({}),show:(value,view)=>{html=value;current=view;},header:(title)=>'<header><h2 id="dialog-title">'+h(title)+'</h2></header>',button,icon:()=>'<svg aria-hidden="true"></svg>',h,money:n=>String(n),toast(){},member:()=>true,getAuth:()=>auth,getConfig:()=>config,getCurrent:()=>current,refresh:async()=>{},refreshConfig:async()=>{}};
const ui=createOperationsUI(context);
await mkdir(".sites-runtime/ui-qa",{recursive:true});
async function save(name){
 assert.ok(!html.includes(attack),"Raw user markup in "+name);
 assert.ok(!/onerror="window.PWNED/.test(html),"Unescaped event attribute in "+name);
 const ids=Array.from(html.matchAll(/\sid="([^"]+)"/g),m=>m[1]);assert.equal(new Set(ids).size,ids.length,"Duplicate IDs in "+name);
 await writeFile(".sites-runtime/ui-qa/"+name+".html","<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>UI template check</title></head><body>"+html+"</body></html>");
}
for(const tab of ["reviews","cases","payouts","settings","audit"]){await ui.action("ops-admin-tab","",{dataset:{tab}});await save("admin-"+tab);}
await ui.action("ops-finance");await save("seller-finance");
await ui.action("ops-cases");await save("cases");
await ui.action("ops-case-new","idea-1");await save("case-form");
await ui.action("ops-review","idea-1");await save("review-form");
await ui.action("ops-case-decision","case-1");await save("case-decision");
await ui.action("ops-payout-decision","payout-1");await save("payout-decision");
const social=ui.socialButtons();assert.equal((social.match(/aria-disabled="true"/g)||[]).length,3);
assert.equal(ui.qualityHTML(null),"");
assert.ok(!ui.qualityHTML({originality:attack,validation_note:attack,risks:attack,version:1,content_hash:"a".repeat(64),created_at:new Date().toISOString()}).includes(attack));
console.log("PASS escaped operator/seller/buyer templates, unique IDs and inactive social login controls");
const card=ideaCard({id:"test-card",title:attack,summary:attack,seller:attack,tags:[attack],category:"software",maturity:"seed",status:"active",art:"ai",viewPrice:1000,usePrice:10000},{account:null,button,icon:()=>'<svg></svg>',money:String,compareControl:()=>""});
assert.ok(!card.includes(attack));assert.ok(card.includes(h(attack)));
console.log("PASS public card escaping without depending on authentication/config response timing");
console.log("Template checks are not a browser or OAuth integration test.");
