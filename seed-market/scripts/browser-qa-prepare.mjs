import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {browserCache,diagnoseQAError,loadQABrowser,playwrightVersion,qaRoot,QAEnvironmentError,requireQANode,toolsDirectory} from "./browser-qa-runtime.mjs";
import {createSetupJournal} from "./browser-qa-journal.mjs";

const withDeps=process.argv.slice(2).includes("--with-deps");
const offline=process.argv.slice(2).includes("--offline");
const unknown=process.argv.slice(2).filter(arg=>!["--with-deps","--offline"].includes(arg));
const journal=createSetupJournal(resolve(qaRoot,".sites-runtime/browser-qa"),{issueId:"QA-ENV-001",kind:"browser-setup",playwrightVersion,browserCache,offline,withSystemDependencies:withDeps});
const report=journal.report;
let interrupted,activeChild,forceStop;
function stopChild(){
 if(!activeChild)return;
 activeChild.kill("SIGTERM");clearTimeout(forceStop);
 forceStop=setTimeout(()=>activeChild?.kill("SIGKILL"),2000);
}
function interruption(){return new QAEnvironmentError("QA_SETUP_INTERRUPTED","설치 실행이 중단됐습니다: "+interrupted,"마지막 phase와 setup.log를 확인하세요. 설치 완료로 처리하지 않습니다. 브라우저가 준비된 실행 이미지도 사용할 수 있습니다.");}
function signalHandler(signal){
 interrupted=signal;process.exitCode=2;
 journal.update({status:"blocked",error:diagnoseQAError(interruption()),finishedAt:new Date().toISOString()});
 stopChild();
}
const handlers=new Map(["SIGINT","SIGTERM"].map(signal=>[signal,()=>signalHandler(signal)]));
for(const [signal,handler] of handlers)process.on(signal,handler);
function ensureActive(){if(interrupted)throw interruption();}
async function run(command,args,timeout,env=process.env){
 ensureActive();
 return new Promise((done,reject)=>{
  const child=spawn(command,args,{cwd:qaRoot,env,stdio:["ignore","pipe","pipe"]});
  activeChild=child;
  let timedOut=false,tail="",archiveError;
  function capture(chunk,stream){
   tail=(tail+chunk).slice(-5000);journal.append(chunk);stream.write(chunk);
   const diagnosis=diagnoseQAError(new Error(tail),report.phase);
   if(!archiveError&&diagnosis.code==="CHROMIUM_ARCHIVE_INVALID"){
    archiveError=new QAEnvironmentError(diagnosis.code,diagnosis.message,diagnosis.remedy);
    journal.update({status:"blocked",error:diagnosis});stopChild();
   }
  }
  child.stdout.on("data",chunk=>capture(chunk,process.stdout));
  child.stderr.on("data",chunk=>capture(chunk,process.stderr));
  const timer=setTimeout(()=>{timedOut=true;stopChild();},timeout);
  function cleanup(){clearTimeout(timer);clearTimeout(forceStop);if(activeChild===child)activeChild=undefined;}
  child.once("error",error=>{cleanup();reject(error);});
  child.once("close",(code,signal)=>{
   cleanup();
   if(interrupted)reject(interruption());
   else if(archiveError)reject(archiveError);
   else if(timedOut)reject(new Error("Setup timed out: "+command+"\n"+tail));
   else if(code!==0)reject(new Error("Setup command failed (code="+code+", signal="+signal+"): "+command+"\n"+tail));
   else done();
  });
 });
}
try{
 console.log("Setup journal: "+journal.resultPath);
 requireQANode();
 if(unknown.length)throw new Error("지원하지 않는 옵션: "+unknown.join(", "));
 if(offline&&withDeps)throw new Error("--offline과 --with-deps는 함께 사용할 수 없습니다.");
 if(!offline){
  console.log("Installing only QA tools: Playwright "+playwrightVersion+" (no application dependencies).");
  journal.update({phase:"playwright-install"});
  await run(process.platform==="win32"?"npm.cmd":"npm",["install","--prefix",toolsDirectory,"--cache",resolve(qaRoot,".sites-runtime/browser-tools/npm-cache"),"--ignore-scripts","--no-audit","--no-fund","--fetch-timeout=30000","--fetch-retries=0"],60000);
  ensureActive();journal.update({phase:"chromium-install"});
  console.log("Installing matching Chromium into "+browserCache);
  await run(process.execPath,[resolve(toolsDirectory,"node_modules/playwright/cli.js"),"install","--no-shell",...(withDeps?["--with-deps"]:[]),"chromium"],120000,{...process.env,PLAYWRIGHT_BROWSERS_PATH:browserCache});
 }
 ensureActive();journal.update({phase:"browser-files-check"});
 const runtime=await loadQABrowser();
 ensureActive();journal.update({browser:runtime.metadata,status:"ready",phase:"completed"});
 console.log("Browser files prepared. Next: npm run qa:doctor (installation is not a browser PASS).");
}catch(error){
 journal.update({status:"blocked",error:diagnoseQAError(error,report.phase)});process.exitCode=2;
 console.error("QA SETUP BLOCKED: "+report.error.message);
 console.error(report.error.remedy);
}finally{
 for(const [signal,handler] of handlers)process.removeListener(signal,handler);
 clearTimeout(forceStop);journal.update({finishedAt:new Date().toISOString()});
 console.log("Setup result: "+journal.resultPath);
}
