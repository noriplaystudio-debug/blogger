import {appendFileSync,mkdirSync,renameSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";

// Write before any installer starts. SIGKILL cannot run a finalizer, so an
// interrupted process must at least leave its last phase marked as running.
export function createSetupJournal(directory,initial){
 const runId="setup-"+Date.now()+"-"+randomUUID().slice(0,8);
 const runDirectory=resolve(directory,runId);
 mkdirSync(runDirectory,{recursive:true});
 const resultPath=resolve(runDirectory,"result.json");
 const latestPath=resolve(directory,"setup-result.json");
 const logPath=resolve(runDirectory,"setup.log");
 const report={...initial,runId,pid:process.pid,status:"running",phase:"prerequisites",startedAt:new Date().toISOString()};
 let lastSaved=0;
 function update(patch={}){
  Object.assign(report,patch,{updatedAt:new Date().toISOString()});
  const data=JSON.stringify(report,null,2)+"\n";
  for(const path of [resultPath,latestPath]){const temporary=path+"."+process.pid+".tmp";writeFileSync(temporary,data);renameSync(temporary,path);}
  lastSaved=Date.now();
 }
 update();
 return {report,resultPath,latestPath,logPath,update,append(chunk){
  appendFileSync(logPath,chunk);
  report.lastOutput=((report.lastOutput||"")+chunk).slice(-5000);
  if(Date.now()-lastSaved>=250)update();
 }};
}
