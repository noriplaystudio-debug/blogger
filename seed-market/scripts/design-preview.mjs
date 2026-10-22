// A self-contained, clearly labelled visual artifact. No mock payment or API server.
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createLocalDB} from "../server/sqlite.mjs";
import {seedExamples} from "../server/seed.mjs";
import {handleAPI} from "../server/api.mjs";
import {ideaCard} from "../public/assets/cards.js";
import {CATALOG,KIND_GROUPS,groupedKindOptions,DOMAINS,briefFor} from "../public/assets/catalog.js";
import {studioHTML} from "../public/assets/studio.js";
import {receiptHTML} from "../public/assets/journeys.js";
import {TERMS_VERSION} from "../server/policy.mjs";
import {escapeHtml as h} from "../public/assets/format.js";
import {PRICE_LEVELS,priceGuideFor,priceGuideHTML} from "../public/assets/pricing.js";
import {shareCardsHTML} from "../public/assets/sharing.js";
import {valueFormHTML,valueResultsHTML,valueReportHTML} from "../public/assets/valuations.js";
import {publicValueSummary,calibrationGroups} from "../server/valuation-data.mjs";
import {VALUE_QUESTION_VERSION,VALUE_THRESHOLDS} from "../public/assets/valuation-policy.js";
const root=fileURLToPath(new URL("../",import.meta.url)),target=resolve(process.argv[2]||"/workspace/seed-market-v5-preview.html");
const db=createLocalDB();await seedExamples(db);
const env={DB:db,PAYMENTS_MODE:"test",ADMIN_USER_IDS:"preview-operator"};
const request=async path=>(await handleAPI(new Request("https://preview.seed.invalid"+path),env)).json();
const config=await request("/api/config"),catalog=await request("/api/discovery?limit=24");
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"/></svg>';
const money=value=>new Intl.NumberFormat("ko-KR").format(value);
const button=(action,label,id="",cls="button")=>'<button type="button" class="'+h(cls)+'" data-action="'+h(action)+'" data-id="'+h(id)+'">'+h(label)+'</button>';
const header=title=>'<div class="dialog-header"><div><span class="dialog-eyebrow">DESIGN PREVIEW · SELLER STUDIO</span><h2 id="dialog-title" tabindex="-1">'+h(title)+'</h2></div><button type="button" class="icon-button" data-preview="close" aria-label="닫기">'+icon("close")+'</button></div>';
const styles=(await Promise.all(["style.css","operations.css","experience.css","taxonomy.css","journeys.css","pricing-sharing.css","valuations.css","patents.css"].map(name=>readFile(resolve(root,"public/assets",name),"utf8")))).join("\n").replace(/@import url\(.*?\);/g,"");
let html=await readFile(resolve(root,"ui/index.html"),"utf8");
html=html.replace(/<link rel="stylesheet"[^>]*>/g,"").replace(/<script type="module"[^>]*><\/script>/g,"");
for(const name of ["idea-board.svg","favicon.svg"]){const svg=await readFile(resolve(root,"public/assets",name),"utf8");html=html.replaceAll("/assets/"+name,"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg));}
html=html.replace("</head>",'<style>'+styles+'\n.preview-strip{background:#224c3a;color:#eef6df;padding:11px 18px;display:flex;justify-content:center;gap:15px;align-items:center;font:11px/1.8 sans-serif;flex-wrap:wrap}.preview-strip strong{font-weight:600}.preview-strip button{color:#d9edb1;font:11px sans-serif;border:1px solid #6d8e58;padding:6px 10px;border-radius:5px}.preview-strip span{color:#b9cdab}.preview-details .studio-panel{animation:none}.preview-details .form-footer{display:none}.preview-details input,.preview-details textarea,.preview-details select{pointer-events:none}.preview-caption{font-size:10px;color:#95a781;padding-top:15px}.preview-details .draft-actions{display:none}.preview-details #idea-category,.preview-details #idea-topic{pointer-events:auto}</style></head>');
html=html.replace("<body>",'<body><div class="preview-strip"><strong>seed v5 · 디자인 미리보기</strong><span>아이디어 종류별 창작 샘플 · 가상 테스트 내역 · 실제 서비스 연결 없음</span><button type="button" data-preview="studio">판매 등록 화면</button><button type="button" data-preview="receipt-ended">구매 후 권한 화면</button></div>');
html=html.replace(/<div class="idea-grid" id="idea-grid" aria-busy="true"><\/div>/,'<div class="idea-grid" id="idea-grid" aria-busy="false">'+catalog.ideas.map(idea=>ideaCard(idea,{config,account:null,icon,money,button,compareControl:idea=>'<button type="button" class="compare-control" data-discover="preview-compare">'+icon("plus")+'<span>비교 담기</span></button>'})).join("")+'</div>');
html=html.replace('아이디어를 찾고 있어요…','공개 샘플 <strong>'+catalog.total+'</strong>개 · 디자인 확인용');
const categories=Object.entries(KIND_GROUPS).map(([group,data])=>'<section class="kind-family"><div class="kind-family-heading"><h3>'+h(data.label)+'</h3><p>'+h(data.description)+'</p></div><ul>'+Object.entries(CATALOG).filter(([,item])=>item.group===group).map(([id,item])=>'<li><a href="#marketplace" title="'+h(item.example)+'">'+icon(item.icon)+'<span>'+h(item.label)+'</span>'+icon("chevron")+'</a></li>').join("")+'</ul></section>').join("");
html=html.replace(/<div class="category-cards kind-directory" id="category-directory">.*?<\/div>/s,'<div class="category-cards kind-directory" id="category-directory">'+categories+'</div>');
html=html.replace('<option value="all">모든 종류</option>',groupedKindOptions({includeAll:true,emptyLabel:"모든 아이디어 종류"}));
html=html.replace('<option value="all">모든 관련 분야</option>','<option value="all">모든 관련 분야</option>'+Object.entries(DOMAINS).map(([id,data])=>'<option value="'+id+'">'+h(data.label)+'</option>').join(""));
html=html.replace('<div class="category-list" role="group" aria-label="아이디어 종류" id="category-tabs"></div>','<div class="category-list" role="group" aria-label="아이디어 종류" id="category-tabs">'+[["all",{label:"전체",icon:"grid"}],...Object.entries(CATALOG)].map(([id,data])=>'<button type="button" class="category '+(id==="all"?"active":"")+'">'+icon(data.icon)+h(data.label)+'</button>').join("")+'</div>');
// Generate fictional after-purchase states through the same API. Buttons below
// remain design-only; no request or authentication leaves this HTML file.
async function scenario(path,user,body,key){
 const response=await handleAPI(new Request("https://preview.seed.invalid"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json",...(key?{"Idempotency-Key":key}:{})}:{},...(body?{body:JSON.stringify(body)}:{})}),env,{identity:{id:user}});
 const result=await response.json();if(!response.ok)throw new Error("Preview fixture failed: "+result.error);return result;
}
for(const id of ["preview-buyer-a","preview-buyer-b"])await scenario("/api/signup",id,{role:"buyer",name:"미리보기 구매자"});
const previewIdea=catalog.ideas.find(idea=>idea.status==="active").id;
const buy=(user,kind,key)=>scenario("/api/ideas/"+previewIdea+"/checkout",user,{kind,agree:true,termsVersion:TERMS_VERSION},key);
const previewOrder=(await buy("preview-buyer-b","view","preview-b-view")).order;
await scenario("/api/ideas/"+previewIdea+"/details","preview-buyer-b");
const viewReceipt=await scenario("/api/orders/"+previewOrder.id,"preview-buyer-b");
await buy("preview-buyer-a","view","preview-a-view");await buy("preview-buyer-a","use","preview-a-use");
const endedReceipt=await scenario("/api/orders/"+previewOrder.id,"preview-buyer-b");
const support=await scenario("/api/cases","preview-buyer-b",{ideaId:previewIdea,orderId:previewOrder.id,kind:"refund",reason:"디자인 확인용 환불",message:"재열람이 종료된 가상 거래의 환불 기록과 권한 안내를 확인하기 위한 디자인 테스트입니다."});
await scenario("/api/admin/cases/"+support.id,"preview-operator",{action:"refund",resolution:"디자인 확인을 위한 가상 테스트 환불입니다. 실제 청구와 환급은 없습니다."});
const refundReceipt=await scenario("/api/orders/"+previewOrder.id,"preview-buyer-b");
const receiptScreens=Object.fromEntries([["view",viewReceipt],["ended",endedReceipt],["refund",refundReceipt]].map(([state,data])=>[state,receiptHTML(data,{button,money})]));
const studio=studioHTML({config,header,icon});
const valueDemoRows=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>({id:"demo-value-"+i+"-"+j,share_id:"demo-share-"+i,user_id:"demo-person-"+i+"-"+j,author_id:"demo-creator-"+Math.floor(i/2),category:"music",maturity:"developed",license:"discussion",terms_version:"design-preview-only",view_amount:5000+i*1000,use_amount:30000+i*10000}))).flat();
const valueDemoData={shareId:"preview-share-1",title:"생활 소리로 만드는 짧은 음악 구상 · 창작 샘플",sourceHash:"design-preview-not-a-real-document",sourceVersion:1,questionVersion:VALUE_QUESTION_VERSION,canSubmit:true,mine:null,sourcePreview:{summary:"디자인 확인용 가상 자료입니다.",body:"이 원문과 모든 통계·참여 수는 디자인 확인을 위한 창작 샘플입니다. 실제 이용자가 등록한 자료나 실제 가격 의견이 아닙니다.",licenseText:"실제 이용 허락이나 거래를 생성하지 않는 디자인 미리보기입니다."},summary:publicValueSummary(valueDemoRows.filter(row=>row.share_id==="demo-share-1")),page:1,pages:1,entries:[{id:"demo-value",maturity:"developed",viewAmount:6000,useAmount:40000,reason:"가상의 디자인 샘플 의견입니다. 실제 이용자 의견이 아닙니다.",updatedAt:new Date().toISOString()}]};
const valueDemoReport={filters:{category:"music",topic:"all",maturity:"developed",license:"discussion",role:"all",days:90},note:"디자인 확인용 가상 표본입니다. 실제 이용자 의견·시세·거래 실적이 아닙니다. 현재 권장액도 바꾸지 않습니다.",totals:{opinions:25,participants:25,ideas:5,creators:3},thresholds:VALUE_THRESHOLDS,groups:calibrationGroups(valueDemoRows),generatedAt:new Date().toISOString()};
const valuePreviewWarning='<div class="notice-box" style="margin:18px"><span>디자인 확인용 가상 표본 · 실제 이용자 의견이나 집계 결과가 아닙니다. 저장·조회·내려받기는 실제 서버에서 이용합니다.</span></div>';
const valueScreens={form:valuePreviewWarning+valueFormHTML(valueDemoData,{button}),results:valuePreviewWarning+valueResultsHTML(valueDemoData,{button}),admin:valuePreviewWarning+valueReportHTML(valueDemoReport,{button})};
const previewShares=[["product","product-home","책상 위 케이블을 정리하는 작은 생각","discussion"],["music","music-concept","생활 소리로 만드는 짧은 음악 구상","attribution"],["business","business-store","동네 가게의 빈 시간을 연결하는 제안","discussion"]].map(([category,topic,title,license],i)=>({id:"preview-share-"+i,title,category,topic,license,summary:"화면 구성을 확인하기 위한 창작 샘플입니다. 실제 이용자가 등록한 글이나 이용 허락을 받은 거래 자료가 아닙니다.",author:"디자인 미리보기 · 창작 샘플"}));
html=html.replace('<div id="sharing-grid" class="sharing-grid" aria-busy="true"></div>','<div id="sharing-grid" class="sharing-grid" aria-busy="false">'+shareCardsHTML(previewShares,{button})+'</div>').replace('나눔 글을 불러오는 중이에요…','디자인 샘플 3개 · 실제 공개 글 아님');
html=html.replace('<div id="dialog-content"></div>','<div id="dialog-content">'+studio+'</div>');
html=html.replace('</body>','<dialog id="receipt-preview-dialog" aria-labelledby="receipt-preview-title" style="width:min(760px,calc(100vw - 32px));border:0;border-radius:18px;padding:0;max-height:90vh"><div class="dialog-header"><div><span class="dialog-eyebrow">FICTIONAL TEST RECORD · DESIGN PREVIEW</span><h2 id="receipt-preview-title" tabindex="-1">구매 후 권한과 거래 기록</h2></div><button class="icon-button" type="button" data-preview="receipt-close" aria-label="거래 화면 닫기">'+icon("close")+'</button></div><div style="padding:0 32px;display:flex;gap:12px;flex-wrap:wrap"><button type="button" class="text-button" data-preview="receipt-view">열람 가능</button><button type="button" class="text-button" data-preview="receipt-ended">재열람 종료</button><button type="button" class="text-button" data-preview="receipt-refund">환불 기록</button></div><div id="receipt-preview-content"></div></dialog></body>');
html=html.replace('</body>','<dialog id="value-preview-dialog" aria-labelledby="value-preview-title" style="width:min(820px,calc(100vw - 24px));border:0;border-radius:16px;padding:0;max-height:92vh"><div class="dialog-header"><h2 id="value-preview-title" tabindex="-1">가격 의견 · 디자인 미리보기</h2><button type="button" class="icon-button" data-preview="value-close" aria-label="가격 의견 미리보기 닫기">'+icon("close")+'</button></div><div class="journey-actions" style="padding:0 20px"><button type="button" class="text-button" data-preview="value-form">의견 작성</button><button type="button" class="text-button" data-preview="value-results">모인 의견</button><button type="button" class="text-button" data-preview="value-admin">운영 통계</button></div><div id="value-preview-content"></div></dialog></body>');
html=html.replace('</body>',`<script>
const previewDialog=document.querySelector('#app-dialog'),receiptDialog=document.querySelector('#receipt-preview-dialog'),valueDialog=document.querySelector('#value-preview-dialog');
const valueScreens=${JSON.stringify(valueScreens).replace(/</g,"\\u003c")};
function showValueScreen(screen){document.querySelector('#value-preview-content').innerHTML=valueScreens[screen];if(!valueDialog.open)valueDialog.showModal();document.querySelector('#value-preview-title').focus();}
const h=${h.toString()},won=n=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const renderPriceGuide=${priceGuideHTML.toString()};
const previewPriceGuides=${JSON.stringify(Object.fromEntries(["",...Object.keys(CATALOG)].map(category=>[category,Object.fromEntries(Object.keys(PRICE_LEVELS).map(maturity=>[maturity,priceGuideFor({category,maturity})]))]))).replace(/</g,"\\u003c")};
function updatePriceGuide(){const form=document.querySelector('#idea-form'),guide=structuredClone(previewPriceGuides[form.elements.category.value||''][form.elements.maturity.value]);for(const kind of ['view','use']){const price=Number(form.elements[kind+'Price'].value);guide[kind].sellerPrice=price;guide[kind].above=price>guide[kind].recommendedMax;guide[kind].difference=Math.max(0,price-guide[kind].recommendedMax);}document.querySelector('#studio-price-guidance').innerHTML=renderPriceGuide(guide);}
document.addEventListener('input',e=>{if(e.target.closest('#idea-form')&&['viewPrice','usePrice','maturity'].includes(e.target.name))updatePriceGuide();});
document.addEventListener('change',e=>{if(e.target.closest('#idea-form')&&['category','maturity'].includes(e.target.name))updatePriceGuide();});
const receiptScreens=${JSON.stringify(receiptScreens).replace(/</g,"\\u003c")};
const previewKinds=${JSON.stringify(Object.fromEntries(Object.entries(CATALOG).map(([id,data])=>[id,{description:data.description,example:data.example,topics:data.topics.map(([topic,label])=>[topic,label]),brief:briefFor(id)}])))};
document.querySelector('#idea-category').addEventListener('change',event=>{const data=previewKinds[event.target.value],select=document.querySelector('#idea-topic');select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='세부 유형 선택';select.append(empty);if(!data)return;for(const [value,label] of data.topics){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}document.querySelector('#kind-description').textContent=data.description;document.querySelector('#kind-example').textContent=data.example;for(const [name,[label,placeholder]] of Object.entries(data.brief)){document.querySelector('label[for="idea-'+name+'"]').textContent=label+' *';document.querySelector('#idea-'+name).placeholder=placeholder;}});
function previewNotice(){const t=document.querySelector('#toast');(valueDialog.open?valueDialog:receiptDialog.open?receiptDialog:previewDialog.open?previewDialog:document.body).append(t);t.textContent='이 파일은 디자인 미리보기예요. 저장·등록·가격 의견·통계 조회와 내려받기는 실제 서버에서 이용합니다.';t.hidden=false;setTimeout(()=>t.hidden=true,4200);}
function showStudio(){previewDialog.classList.add('is-studio','preview-details');previewDialog.showModal();document.querySelector('#dialog-title').focus();}
document.addEventListener('submit',e=>{e.preventDefault();previewNotice();});
document.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;
if(b.dataset.preview==='receipt-close'){receiptDialog.close();}
else if(b.dataset.preview==='value-close'){valueDialog.close();}
else if(b.dataset.preview?.startsWith('value-')){showValueScreen(b.dataset.preview.slice(6));}
else if(b.dataset.action==='value-compose'){e.preventDefault();showValueScreen('form');}
else if(b.dataset.action==='value-results'){e.preventDefault();showValueScreen('results');}
else if(b.dataset.action==='value-admin'){e.preventDefault();showValueScreen('admin');}
else if(b.tagName==='A'&&b.getAttribute('href')?.startsWith('/api/admin/value-opinions')){e.preventDefault();previewNotice();}
else if(b.dataset.preview?.startsWith('receipt-')){const state=b.dataset.preview.slice(8);document.querySelector('#receipt-preview-content').innerHTML=receiptScreens[state];if(!receiptDialog.open)receiptDialog.showModal();document.querySelector('#receipt-preview-title').focus();}
else if(b.dataset.preview==='studio'||b.dataset.action==='create'){e.preventDefault();showStudio();}
else if(b.dataset.preview==='close'){previewDialog.close();}
else if(b.dataset.studio==='price-preset'){const form=document.querySelector('#idea-form'),guide=previewPriceGuides[form.elements.category.value||''][form.elements.maturity.value];form.elements.viewPrice.value=guide.view.recommendedMax;form.elements.usePrice.value=guide.use.recommendedMax;updatePriceGuide();}
else if(b.dataset.studio==='step'){const step=Number(b.dataset.step);document.querySelectorAll('.studio-panel').forEach((p,i)=>p.hidden=i!==step);document.querySelectorAll('.studio-step').forEach((p,i)=>{if(i===step)p.setAttribute('aria-current','step');else p.removeAttribute('aria-current');});if(step===3)document.querySelector('#studio-review').innerHTML='<p class="preview-caption">실제 작성 화면에서는 입력한 소개와 커버의 구매자 미리보기가 표시됩니다.</p>';}
else if(b.dataset.action||b.dataset.discover||b.dataset.studio){e.preventDefault();previewNotice();}
});
previewDialog.addEventListener('click',e=>{if(e.target===previewDialog)previewDialog.close();});
receiptDialog.addEventListener('click',e=>{if(e.target===receiptDialog)receiptDialog.close();});
document.querySelector('#menu-toggle').addEventListener('click',()=>{const menu=document.querySelector('#mobile-nav');menu.hidden=!menu.hidden;document.querySelector('#menu-toggle').setAttribute('aria-expanded',String(!menu.hidden));});
</script></body>`);
html=html.replace('seed v5 · 디자인 미리보기','seed v5.2 · 디자인 미리보기').replace('아이디어 종류별 창작 샘플 · 가상 테스트 내역 · 실제 서비스 연결 없음','가격 의견·운영 통계·가상 표본 · 실제 서비스 연결 없음').replace('<button type="button" data-preview="receipt-ended">구매 후 권한 화면</button>','<button type="button" data-preview="receipt-ended">구매 후 권한 화면</button><button type="button" data-preview="value-form">가격 의견 화면</button><button type="button" data-preview="value-admin">가격 기준 참고 통계</button>').replace('</head>','<style>.preview-details #idea-viewPrice,.preview-details #idea-usePrice,.preview-details input[name="maturity"]{pointer-events:auto}</style></head>');
await writeFile(target,html);db.close();console.log("Design preview written: "+target);
