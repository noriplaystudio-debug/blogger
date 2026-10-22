// Shared infrastructure only: no business assertions and no external dev-login URL.
import {spawn} from "node:child_process";
import {constants} from "node:fs";
import {access,readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

export const qaRoot=fileURLToPath(new URL("../",import.meta.url));
export const toolsDirectory=resolve(qaRoot,"tools/browser-qa");
const toolsManifest=JSON.parse(await readFile(resolve(toolsDirectory,"package.json"),"utf8"));
export const playwrightVersion=toolsManifest.dependencies.playwright;
export const browserCache=process.env.PLAYWRIGHT_BROWSERS_PATH||resolve(qaRoot,".sites-runtime/browser-tools/browsers");
export const delay=ms=>new Promise(done=>setTimeout(done,ms));

export class QAEnvironmentError extends Error {
 constructor(code,message,remedy){super(message);this.name="QAEnvironmentError";this.code=code;this.remedy=remedy;}
}

export function requireQANode(){
 const [major,minor]=process.versions.node.split(".").map(Number);
 if(major<22||(major===22&&minor<13))throw new QAEnvironmentError("NODE_VERSION_UNSUPPORTED","Node.js 22.13 이상이 필요합니다.","Node.js 22.13 이상인 동일 실행 환경에서 다시 실행하세요.");
}

export function diagnoseQAError(error,phase="browser-launch"){
 if(error instanceof QAEnvironmentError)return {code:error.code,message:error.message,remedy:error.remedy};
 const message=String(error?.message||error).slice(-5000);
 if(phase==="chromium-install"&&/central directory|not a zip file|file is truncated|invalid zip/i.test(message))return {code:"CHROMIUM_ARCHIVE_INVALID",message,remedy:"Chromium 다운로드 아카이브가 유효하지 않습니다. 중단 기록과 설치 로그를 보존하고, 브라우저가 포함된 QA 이미지 또는 유효한 공식 캐시를 사용하세요. 네트워크 원인은 아직 확정하지 않습니다."};
 if(phase?.endsWith("-install"))return {code:/EPERM|EACCES|Operation not permitted|Permission denied/.test(message)?"QA_INSTALL_ACCESS_DENIED":"QA_INSTALL_FAILED",message,remedy:"설치 출력의 네트워크·프록시·인증서·쓰기 권한을 확인하세요. 허용된 동일 환경에서 npm run qa:prepare를 다시 실행하세요."};
 if(/Executable doesn't exist|ENOENT/.test(message))return {code:"BROWSER_BINARY_MISSING",message,remedy:"npm run qa:prepare로 고정 버전 Chromium을 설치하세요. 별도 Chromium은 SEED_BROWSER_EXECUTABLE에 지정하세요."};
 if(/missing dependencies|error while loading shared libraries|cannot open shared object file/i.test(message))return {code:"BROWSER_SYSTEM_DEPENDENCIES_MISSING",message,remedy:"Chromium 시스템 라이브러리가 있는 실행 이미지를 사용하거나, 환경 정책에 따라 npm run qa:prepare -- --with-deps를 실행하세요."};
 if(/Operation not permitted|Permission denied|EPERM|EACCES|No usable sandbox/i.test(message))return {code:phase==="server-start"?"SERVER_BIND_DENIED":"BROWSER_EXECUTION_DENIED",message,remedy:"브라우저 실행과 루프백 HTTP를 허용하는 동일 격리 환경에서 재실행하세요. 실행 정책이나 개발 로그인 보호를 해제하지 마세요."};
 if(/EADDRINUSE/.test(message))return {code:"SERVER_PORT_IN_USE",message,remedy:"SEED_BROWSER_PORT에 비어 있는 1024~65535 포트를 지정하세요. 기존 프로세스에는 연결하지 않습니다."};
 if(/ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_CONNECTION_CLOSED|fetch failed/.test(message))return {code:"BROWSER_APP_UNREACHABLE",message,remedy:"앱과 Playwright를 같은 실행 환경에서 실행하세요. 다른 환경의 computer-use 브라우저에 셸의 localhost를 전달하지 마세요."};
 return {code:phase==="server-start"?"SERVER_START_FAILED":"BROWSER_LAUNCH_FAILED",message,remedy:"result.json과 server.log를 확인하세요. 환경 차단은 UI 통과로 처리하지 않습니다."};
}

export async function loadQABrowser(){
 requireQANode();
 // Explicit configuration wins. Never silently fall back after a bad override.
 let entry=process.env.SEED_PLAYWRIGHT_PATH;
 if(entry)entry=resolve(qaRoot,entry);
 else{
  const candidates=[resolve(toolsDirectory,"node_modules/playwright/index.mjs")];
  try{candidates.push(createRequire(import.meta.url).resolve("playwright"));}catch{}
  candidates.push("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
  for(const candidate of candidates){try{await access(candidate);entry=candidate;break;}catch{}}
 }
 if(!entry)throw new QAEnvironmentError("PLAYWRIGHT_MISSING","Playwright 모듈이 없습니다.","npm run qa:prepare를 실행하세요. 웹앱 전체 의존성 설치는 필요 없습니다.");
 let manifest;
 try{manifest=JSON.parse(await readFile(resolve(dirname(entry),"package.json"),"utf8"));}
 catch{throw new QAEnvironmentError("PLAYWRIGHT_PATH_INVALID","Playwright 경로를 읽을 수 없습니다: "+entry,"SEED_PLAYWRIGHT_PATH를 Playwright의 index.mjs로 지정하거나 해제 후 npm run qa:prepare를 실행하세요.");}
 if(manifest.name!=="playwright"||manifest.version!==playwrightVersion)throw new QAEnvironmentError("PLAYWRIGHT_VERSION_MISMATCH","Playwright "+playwrightVersion+"이 필요합니다. 선택된 버전: "+String(manifest.version),"SEED_PLAYWRIGHT_PATH를 해제하고 npm run qa:prepare를 실행하거나 고정 버전 모듈을 지정하세요.");
 // The installer and runner share this path, regardless of their login user.
 process.env.PLAYWRIGHT_BROWSERS_PATH=browserCache;
 const module=await import(pathToFileURL(entry).href);
 const chromium=module.chromium||module.default?.chromium;
 if(!chromium)throw new QAEnvironmentError("PLAYWRIGHT_PATH_INVALID","선택한 모듈에 Chromium 드라이버가 없습니다.","npm run qa:prepare를 실행하고 올바른 Playwright 모듈을 지정하세요.");
 const override=process.env.SEED_BROWSER_EXECUTABLE;
 const executable=override?resolve(qaRoot,override):chromium.executablePath();
 try{await access(executable,constants.X_OK);}
 catch{throw new QAEnvironmentError("BROWSER_BINARY_MISSING","실행 가능한 Chromium이 없습니다: "+executable,"npm run qa:prepare로 해당 버전 Chromium을 설치하세요. 별도 Chromium은 SEED_BROWSER_EXECUTABLE에 실행 파일을 지정하세요.");}
 return {chromium,launchOptions:{headless:true,executablePath:executable,timeout:10000},metadata:{playwrightVersion:manifest.version,modulePath:entry,browserSource:override?"explicit-executable":"pinned-playwright",executablePath:executable,browserCache}};
}

export function startQAServer(runId){
 requireQANode();
 if(!/^(run|doctor)-[a-zA-Z0-9-]+$/.test(runId))throw new QAEnvironmentError("INVALID_RUN_ID","격리 실행 ID가 잘못되었습니다.","QA 스크립트를 통해 새 실행을 시작하세요.");
 const port=Number(process.env.SEED_BROWSER_PORT||4189);
 if(!Number.isInteger(port)||port<1024||port>65535)throw new QAEnvironmentError("INVALID_QA_PORT","SEED_BROWSER_PORT는 1024~65535 정수여야 합니다.","비어 있는 유효한 포트를 지정하세요.");
 const base="http://127.0.0.1:"+port;
 const runtime=".sites-runtime/browser-qa/"+runId+"/data";
 const child=spawn(process.execPath,["scripts/dev-server.mjs"],{cwd:qaRoot,env:{...process.env,SEED_BROWSER_QA:"1",SEED_PREVIEW_RUNTIME:runtime,SEED_PREVIEW_PORT:String(port),AUTH_MODE:"sites",PAYMENTS_MODE:"test"},stdio:["ignore","pipe","pipe"]});
 let output="",spawnError;
 const closed=new Promise(done=>child.once("close",done));
 child.on("error",error=>{spawnError=error;});
 const capture=chunk=>{output=(output+chunk).slice(-100000);};
 child.stdout.on("data",capture);child.stderr.on("data",capture);
 const running=()=>child.exitCode===null&&child.signalCode===null&&!spawnError;
 return {process:child,base,runtime,get output(){return output;},async ready(){
  const end=Date.now()+10000;
  while(Date.now()<end){
   if(!running()){
    await Promise.race([closed,delay(500)]);
    if(!spawnError&&!output)throw new QAEnvironmentError("SERVER_PROCESS_EXITED_WITHOUT_LOG","서버 자식 프로세스가 출력 없이 종료됐습니다 (code="+child.exitCode+", signal="+child.signalCode+").","SEED_BROWSER_QA=1과 별도 SEED_PREVIEW_RUNTIME으로 서버를 직접 실행해 출력과 Node 자식 프로세스 실행 제한을 확인하세요.");
    throw spawnError||new Error("Preview server exited (code="+child.exitCode+", signal="+child.signalCode+"): "+(output.slice(-3000)||"no server output"));
   }
   // Do not mistake an already-running process for our isolated test server.
   if(output.includes("seed local preview: "+base)){
    try{
     const response=await fetch(base+"/api/config",{signal:AbortSignal.timeout(500)});
     if(response.ok){const config=await response.json();if(config.paymentMode!=="test"||config.devMode!==true)throw new QAEnvironmentError("UNEXPECTED_QA_SERVER","테스트 결제·개발 모드인 서버가 아닙니다.","외부 서버를 연결하지 말고 격리 QA 서버를 사용하세요.");return {base,runtime,paymentMode:config.paymentMode,devMode:config.devMode};}
    }catch(error){if(error instanceof QAEnvironmentError)throw error;}
   }
   await delay(80);
  }
  throw new QAEnvironmentError("SERVER_READINESS_TIMEOUT","테스트 서버가 10초 내 준비되지 않았습니다. "+output.slice(-2000),"server.log와 실행 환경의 루프백 HTTP 허용 여부를 확인하세요.");
 },async stop(){
  if(!running())return;
  const exited=new Promise(done=>child.once("exit",done));
  child.kill("SIGTERM");await Promise.race([exited,delay(2000)]);
  if(running()){child.kill("SIGKILL");await Promise.race([exited,delay(1000)]);}
 }};
}
