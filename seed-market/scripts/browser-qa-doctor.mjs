// Environment preflight: actual browser → owned loopback app → rendered UI.
// Passing this check does not pass the seller/buyer transaction scenarios.
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {diagnoseQAError,loadQABrowser,qaRoot,requireQANode,startQAServer} from "./browser-qa-runtime.mjs";

const runId="doctor-"+Date.now()+"-"+randomUUID().slice(0,8);
const output=resolve(qaRoot,".sites-runtime/browser-qa",runId);
const report={issueId:"QA-ENV-001",kind:"environment-preflight",runId,status:"running",phase:"runtime",scope:"same environment: Chromium → loopback HTTP → isolated app → home/menu",businessScenariosVerified:false,checks:[],steps:[],screenshots:[],traces:[],pageErrors:[],startedAt:new Date().toISOString()};
let browser,server,context,page,runtime;
await mkdir(output,{recursive:true});
async function check(name,work){
 try{const detail=await work();report.checks.push({name,status:"passed",...(detail?{detail}:{})});return true;}
 catch(error){report.checks.push({name,status:"blocked",...diagnoseQAError(error,name)});return false;}
}
async function shot(name){const path=resolve(output,name+".png");await page.screenshot({path,fullPage:true,timeout:10000});report.screenshots.push(path);}
try{
 requireQANode();
 await check("browser-runtime",async()=>{runtime=await loadQABrowser();report.browser=runtime.metadata;return runtime.metadata;});
 if(runtime)await check("browser-launch",async()=>{browser=await runtime.chromium.launch(runtime.launchOptions);return {version:browser.version()};});
 // Server readiness is independent, so missing Chromium cannot hide bind failures.
 await check("server-start",async()=>{server=startQAServer(runId);report.server={base:server.base,runtime:server.runtime};return await server.ready();});
 if(!browser||report.checks.some(item=>item.status==="blocked")){
  report.status="blocked";report.phase="preflight";process.exitCode=2;
 }else{
  report.phase="browser-app-connection";
  context=await browser.newContext({viewport:{width:1365,height:900},locale:"ko-KR"});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.route("**/*",route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
  page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror",error=>report.pageErrors.push(error.message));
  const response=await page.goto(server.base,{waitUntil:"domcontentloaded",timeout:10000});
  report.checks.push({name:"browser-app-connection",status:"passed",detail:{httpStatus:response.status()}});
  report.phase="app-render";
  if(!response?.ok())throw new Error("Browser home HTTP status: "+response?.status());
  await page.locator("#idea-grid .idea-card").first().waitFor({state:"visible"});
  await shot("00-home");report.steps.push({name:"실제 홈의 아이디어 카드 표시",status:"passed"});
  await page.setViewportSize({width:390,height:844});
  await page.locator("#menu-toggle").click();await page.locator("#mobile-nav").waitFor({state:"visible"});
  await shot("01-mobile-menu");report.steps.push({name:"모바일 크기에서 실제 메뉴 클릭",status:"passed"});
  if(report.pageErrors.length)throw new Error("Uncaught browser JavaScript error: "+report.pageErrors.join("; "));
  report.status="passed";report.phase="completed";
 }
}catch(error){
 report.status=report.phase==="app-render"?"failed":"blocked";process.exitCode=report.status==="blocked"?2:1;
 report.error=report.status==="blocked"?diagnoseQAError(error,report.phase):{code:"APP_RENDER_OR_INTERACTION_FAILED",message:error.message};
 if(page)try{await shot("failure");await writeFile(resolve(output,"failure.html"),await page.content());}catch{}
}finally{
 if(context)try{const path=resolve(output,"preflight-trace.zip");await context.tracing.stop({path});report.traces.push(path);}catch{}
 if(browser)try{await browser.close();}catch{}
 if(server){await server.stop();await writeFile(resolve(output,"server.log"),server.output||"Server exited without output; see result.json for exit status.\n");}
 report.passedSteps=report.steps.length;report.finishedAt=new Date().toISOString();
 await writeFile(resolve(output,"result.json"),JSON.stringify(report,null,2));
 await writeFile(resolve(qaRoot,".sites-runtime/browser-qa/latest-doctor.json"),JSON.stringify(report,null,2));
 for(const item of report.checks)console.log("QA "+item.status.toUpperCase()+" "+item.name+(item.code?": "+item.code:""));
 console.log("QA DOCTOR "+report.status.toUpperCase()+"; UI steps="+report.passedSteps+"; business scenarios are not verified.");
 console.log("Doctor result: "+resolve(output,"result.json"));
}
