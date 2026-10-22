// Tooling regression checks only. No browser or payment flow is simulated.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {createSetupJournal} from "../scripts/browser-qa-journal.mjs";
import {diagnoseQAError,QAEnvironmentError} from "../scripts/browser-qa-runtime.mjs";
import {exportQAEvidence} from "../scripts/browser-qa-artifacts.mjs";

const temporary=mkdtempSync(resolve(tmpdir(),"seed-qa-tools-"));
const json=path=>JSON.parse(readFileSync(path,"utf8"));
try{
 const journal=createSetupJournal(resolve(temporary,"journal"),{kind:"browser-setup",issueId:"QA-ENV-001"});
 assert.equal(json(journal.resultPath).status,"running");
 assert.equal(json(journal.latestPath).phase,"prerequisites");
 // An external kill can only leave the last checkpoint: it must never say ready.
 journal.update({phase:"chromium-install"});
 assert.equal(json(journal.resultPath).status,"running");
 assert.equal(json(journal.resultPath).phase,"chromium-install");
 journal.append(Buffer.from("archive download did not complete\n"));
 const error=diagnoseQAError(new QAEnvironmentError("QA_SETUP_INTERRUPTED","SIGTERM","Check setup log"));
 journal.update({status:"blocked",error,finishedAt:new Date().toISOString()});
 assert.equal(json(journal.latestPath).error.code,"QA_SETUP_INTERRUPTED");
 assert.equal(json(journal.latestPath).status,"blocked");
 assert.match(readFileSync(journal.logPath,"utf8"),/did not complete/);
 const next=createSetupJournal(resolve(temporary,"journal"),{kind:"browser-setup"});
 assert.notEqual(next.resultPath,journal.resultPath);
 assert.equal(json(journal.resultPath).status,"blocked");
 console.log("PASS setup evidence exists before installation, survives phase checkpoints and preserves interrupted run history");

 const killedDirectory=resolve(temporary,"killed-installer");
 const script=`import {createSetupJournal} from ${JSON.stringify(new URL("../scripts/browser-qa-journal.mjs",import.meta.url).href)};const journal=createSetupJournal(${JSON.stringify(killedDirectory)},{kind:"browser-setup"});journal.update({phase:"chromium-install"});process.kill(process.pid,"SIGKILL");`;
 const killed=spawnSync(process.execPath,["--input-type=module","--eval",script],{stdio:"inherit",timeout:5000});
 assert.equal(killed.signal,"SIGKILL");
 assert.equal(json(resolve(killedDirectory,"setup-result.json")).status,"running");
 assert.equal(json(resolve(killedDirectory,"setup-result.json")).phase,"chromium-install");
 console.log("PASS real SIGKILL preserves the last checkpoint without recording success");

 const archive=diagnoseQAError(new Error("End of central directory record signature not found. Either not a zip file, or file is truncated."),"chromium-install");
 assert.equal(archive.code,"CHROMIUM_ARCHIVE_INVALID");
 assert.notEqual(diagnoseQAError(new Error("0 MiB"),"chromium-install").code,"CHROMIUM_ARCHIVE_INVALID");
 assert.equal(diagnoseQAError(new Error("connect EPERM"),"chromium-install").code,"QA_INSTALL_ACCESS_DENIED");
 console.log("PASS truncated archive has a distinct cause; zero size alone is not diagnosed as corruption");

 const run=resolve(temporary,"run");mkdirSync(resolve(run,"data"),{recursive:true});
 const resultPath=resolve(run,"result.json"),image=resolve(run,"home.png"),trace=resolve(run,"trace.zip");
 writeFileSync(image,"test evidence sentinel");writeFileSync(trace,"test evidence sentinel");
 writeFileSync(resolve(run,"data/local.sqlite"),"must not export");
 writeFileSync(resolve(run,"reference.png"),"must not export");
 writeFileSync(resolve(run,"server.log"),"test server log");
 writeFileSync(resultPath,JSON.stringify({status:"blocked",passedSteps:0,screenshots:[image],traces:[trace]}));
 const destination=resolve(temporary,"export");
 const exported=exportQAEvidence(resultPath,destination);
 assert.deepEqual(exported.files.sort(),["home.png","result.json","server.log","trace.zip"]);
 assert.equal(existsSync(resolve(destination,"data/local.sqlite")),false);
 assert.equal(existsSync(resolve(destination,"reference.png")),false);
 const outside=resolve(temporary,"secret.png");writeFileSync(outside,"must not export");
 writeFileSync(resultPath,JSON.stringify({screenshots:[outside]}));
 assert.throws(()=>exportQAEvidence(resultPath,resolve(temporary,"outside-export")),/Unsafe QA evidence path/);
 const linked=resolve(run,"linked.png");symlinkSync(outside,linked);
 writeFileSync(resultPath,JSON.stringify({screenshots:[linked]}));
 assert.throws(()=>exportQAEvidence(resultPath,resolve(temporary,"link-export")),/Unsafe QA evidence path/);
 console.log("PASS evidence export excludes DB/uploads and rejects paths or links outside the run");
 console.log("QA TOOLING CHECKS PASSED (browser environment and UI not verified)");
}finally{rmSync(temporary,{recursive:true,force:true});}
