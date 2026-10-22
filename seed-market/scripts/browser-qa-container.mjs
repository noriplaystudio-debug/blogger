import {spawnSync} from "node:child_process";
import {appendFileSync,closeSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,statSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {exportQAEvidence} from "./browser-qa-artifacts.mjs";
import {qaRoot} from "./browser-qa-runtime.mjs";

const platform=process.env.SEED_QA_PLATFORM||"container";
const output=resolve(process.env.SEED_QA_ARTIFACTS_DIR||resolve(qaRoot,".sites-runtime/qa-artifacts"),(platform==="container"?"container-":"ci-")+Date.now()+"-"+randomUUID().slice(0,8));
mkdirSync(output,{recursive:true});
const report={issueId:"QA-ENV-001",kind:platform==="container"?"container-qa":"browser-qa",platform,status:"running",phase:"doctor",browserImage:process.env.SEED_QA_BROWSER_IMAGE||"unspecified",browserDownloadsDuringRun:false,startedAt:new Date().toISOString(),...((process.env.SEED_QA_SOURCE_SHA||process.env.GITHUB_SHA)?{commit:process.env.SEED_QA_SOURCE_SHA||process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID}:{})};
function save(){const path=resolve(output,"summary.json");writeFileSync(path+".tmp",JSON.stringify(report,null,2));renameSync(path+".tmp",path);}
function run(name,script,latest,timeout){
 const started=Date.now();
 console.log("QA "+platform+": "+name+"; log: "+resolve(output,name+".log"));
 const fd=openSync(resolve(output,name+".log"),"w");
 let child;
 try{child=spawnSync(process.execPath,[script],{cwd:qaRoot,env:process.env,stdio:["ignore",fd,fd],timeout});}finally{closeSync(fd);}
 const result={exitCode:child.status,signal:child.signal,...(child.error?{error:child.error.message}:{})};
 const path=resolve(qaRoot,".sites-runtime/browser-qa",latest);
 if(existsSync(path)&&statSync(path).mtimeMs>=started){
  const raw=JSON.parse(readFileSync(path,"utf8"));
  // The latest file contains the originating run ID; evidence stays in that run.
  if(!/^(doctor|run)-[a-zA-Z0-9-]+$/.test(raw.runId))throw new Error("Invalid QA run ID");
  const original=resolve(qaRoot,".sites-runtime/browser-qa",raw.runId,"result.json");
  Object.assign(result,exportQAEvidence(original,resolve(output,name)));
 }else result.error=result.error||"No fresh result JSON was produced; previous runs are not reused.";
 return result;
}
save();
try{
 report.doctor=run("doctor","scripts/browser-qa-doctor.mjs","latest-doctor.json",45000);save();
 if(report.doctor.exitCode!==0||report.doctor.status!=="passed"){
  report.status=report.doctor.status==="failed"?"failed":"blocked";report.journey={status:"not-run"};process.exitCode=report.status==="blocked"?2:1;
 }else{
  report.phase="journey";save();
  report.journey=run("journey","tests/browser.test.mjs","latest-result.json",300000);
  report.status=report.journey.exitCode===0&&report.journey.status==="passed"?"passed":report.journey.status==="blocked"?"blocked":"failed";
  process.exitCode=report.status==="passed"?0:report.status==="blocked"?2:1;
 }
}catch(error){report.status="blocked";report.error=error.message;process.exitCode=2;}
finally{
 report.finishedAt=new Date().toISOString();save();
 console.log("QA "+platform+" "+report.status.toUpperCase()+": "+resolve(output,"summary.json"));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,["### seed 실제 브라우저 검사","","| 범위 | 상태 | 실제 통과 단계 |","| --- | --- | --- |","| 환경·홈·메뉴 | "+(report.doctor?.status||"not-run")+" | "+(report.doctor?.passedSteps||0)+" |","| 판매자·구매자·운영자·모바일 | "+(report.journey?.status||"not-run")+" | "+(report.journey?.passedSteps||0)+" |","","실제로 생성된 증거는 seed-market-qa 아티팩트에서 확인합니다. API 검사만으로 화면 통과를 판정하지 않습니다.",""].join("\n"));
}
