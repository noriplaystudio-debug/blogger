import {createServer} from "node:http";
import {readFile,mkdir,writeFile,unlink} from "node:fs/promises";
import {resolve,dirname,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {createLocalDB} from "../server/sqlite.mjs";
import {handleAPI} from "../server/api.mjs";
import {seedExamples} from "../server/seed.mjs";
import {DatabaseSync} from "node:sqlite";
import {createPortableAuth} from "../auth/runtime.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const browserQA=process.env.SEED_BROWSER_QA==="1";
if(!browserQA)try{process.loadEnvFile(resolve(root,".env.local"));}catch(error){if(error.code!=="ENOENT")throw error;}
const runtime=resolve(root,process.env.SEED_PREVIEW_RUNTIME||".sites-runtime");
const port=Number(process.env.SEED_PREVIEW_PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("SEED_PREVIEW_PORT must be between 1024 and 65535");
if(browserQA&&!runtime.startsWith(resolve(root,".sites-runtime")+"/"))throw new Error("Browser QA must use an isolated .sites-runtime subdirectory");
if(browserQA){process.env.AUTH_MODE="sites";process.env.PAYMENTS_MODE="test";}
const external=process.env.AUTH_MODE==="better-auth";
const imageDirectory=resolve(runtime,external?"market-images":"images");
await mkdir(imageDirectory,{recursive:true});
const db=createLocalDB(external?resolve(root,process.env.APP_DATABASE_PATH||".sites-runtime/market.sqlite"):resolve(runtime,"local.sqlite"));
const authDatabase=external?new DatabaseSync(resolve(root,process.env.AUTH_DATABASE_PATH||".sites-runtime/auth.sqlite")):null;
const portableAuth=external?await createPortableAuth(authDatabase,process.env):null;
if(!external)await seedExamples(db);
for(const [id,role,name] of (external?[]:[["dev-seller","seller","테스트 판매자"],["dev-buyer-a","buyer","테스트 구매자 A"],["dev-buyer-b","buyer","테스트 구매자 B"],["dev-operator","buyer","테스트 운영자"]])){
 await db.prepare("INSERT OR IGNORE INTO users(id,role,name,created_at) VALUES(?,?,?,?)").bind(id,role,name,new Date().toISOString()).run();
}
const bucket={
 async put(key,body){await writeFile(resolve(imageDirectory,key.replaceAll("/","_")),body);},
 async get(key){try{return {body:new Uint8Array(await readFile(resolve(imageDirectory,key.replaceAll("/","_"))))};}catch{return null;}},
 async delete(key){try{await unlink(resolve(imageDirectory,key.replaceAll("/","_")));}catch{}}
};
const sessions=new Map();
const accounts=new Set(["dev-seller","dev-buyer-a","dev-buyer-b","dev-new","dev-new-seller","dev-new-buyer","dev-operator"]);
const appEnv={...process.env,DB:db,BUCKET:bucket,PAYMENTS_MODE:process.env.PAYMENTS_MODE||"test",ADMIN_USER_IDS:external?(process.env.ADMIN_USER_IDS||""):[process.env.ADMIN_USER_IDS,"dev-operator"].filter(Boolean).join(",")};
function send(response,res){
 const headers=Object.fromEntries([...response.headers].filter(([key])=>key!=="set-cookie"));
 const cookies=response.headers.getSetCookie?.()||[];
 if(cookies.length)headers["set-cookie"]=cookies;
 res.writeHead(response.status,headers);
 return response.arrayBuffer().then(body=>res.end(new Uint8Array(body)));
}
const server=createServer(async(req,res)=>{
 try{
  const host=req.headers.host||"127.0.0.1:4173";
  const origin=external?new URL(process.env.BETTER_AUTH_URL).origin:"http://"+host;
  const url=new URL(req.url,origin);
  if(external?host!==new URL(origin).host:!["127.0.0.1","localhost","[::1]"].includes(url.hostname)){res.writeHead(403);res.end("Unexpected host");return;}
  if(url.origin!==origin){res.writeHead(403);res.end();return;}
  if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
  const cookies=(req.headers.cookie??"").split(";").map(x=>x.trim());
  const session=cookies.find(x=>x.startsWith("seed_dev_session="))?.slice(17);
  if(!external&&url.pathname==="/__dev/login"&&req.method==="GET"){
    if(req.headers["sec-fetch-site"]==="cross-site"){res.writeHead(403);res.end();return;}
    const account=url.searchParams.get("account");
    if(!accounts.has(account)){res.writeHead(400);res.end();return;}
    const token=crypto.randomUUID();sessions.set(token,account);
    res.writeHead(303,{"Location":"/#join","Set-Cookie":"seed_dev_session="+token+"; Path=/; HttpOnly; SameSite=Strict","Cache-Control":"no-store"});res.end();return;
  }
  if(!external&&url.pathname==="/__dev/logout"){sessions.delete(session);res.writeHead(303,{"Location":"/","Set-Cookie":"seed_dev_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"});res.end();return;}
  if(url.pathname.startsWith("/api/")){
    const chunks=[];let size=0;
    for await(const c of req){size+=c.length;if(size>6*1024*1024){res.writeHead(413);res.end();return;}chunks.push(c);}
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v&&!k.startsWith("oai-authenticated-user-"))headers.set(k,Array.isArray(v)?v.join(","):v);}
    const request=new Request(url,{method:req.method,headers,...(!["GET","HEAD"].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    if(url.pathname.startsWith("/api/auth/")){
      const response=portableAuth?await portableAuth.handler(request):new Response(JSON.stringify({error:"독립 인증 모드가 아직 활성화되지 않았습니다."}),{status:503,headers:{"Content-Type":"application/json"}});
      await send(response,res);return;
    }
    const sessionData=portableAuth?await portableAuth.api.getSession({headers:request.headers}):null;
    const identity=portableAuth?(sessionData?{id:"auth-"+sessionData.user.id,email:sessionData.user.email}:null):(sessions.has(session)?{id:sessions.get(session),email:"local@seed.test"}:null);
    const response=await handleAPI(request,appEnv,{identity,devMode:!external,authBackend:external?"better-auth":"sites"});
    await send(response,res);return;
  }
  let file;
  if(url.pathname==="/")file=resolve(root,"ui/index.html");
  else if(url.pathname.startsWith("/assets/")){file=resolve(root,"public","."+decodeURIComponent(url.pathname));if(!file.startsWith(resolve(root,"public/assets")+"/")){res.writeHead(403);res.end();return;}}
  else{res.writeHead(404);res.end("Not found");return;}
  const data=await readFile(file);const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml"};
  res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(data);
 }catch(error){console.error(error.name);res.writeHead(500);res.end("Local preview error");}
});
server.on("error",error=>{console.error("seed preview start failed: "+error.code);db.close();authDatabase?.close();process.exitCode=1;});
server.listen(port,"127.0.0.1",()=>console.log("seed local preview: http://127.0.0.1:"+port));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>{db.close();authDatabase?.close();process.exit(0);}));
