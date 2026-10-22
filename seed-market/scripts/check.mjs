import {readdirSync,readFileSync,existsSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {spawnSync} from "node:child_process";
const roots=["server","auth","scripts","public/assets","tests"];
let checked=0;
function walk(dir){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,item.name);
  if(item.isDirectory())walk(path);
  else if(/\.(mjs|js)$/.test(item.name)){
   const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
   if(result.status!==0){process.stderr.write(result.stderr||"Syntax check failed: "+path);process.exit(result.status||1);}
   const source=readFileSync(path,"utf8");
   for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']/g))if(!existsSync(resolve(dirname(path),match[1])))throw new Error("Missing relative import in "+path+": "+match[1]);
   checked++;
  }
 }
}
for(const root of roots)walk(root);
const html=readFileSync("ui/index.html","utf8");
for(const match of html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g))if(!existsSync("public"+match[1]))throw new Error("Missing public asset: "+match[1]);
const ids=Array.from(html.matchAll(/\sid="([^"]+)"/g),m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error("Duplicate static HTML IDs");
const hosting=JSON.parse(readFileSync(".openai/hosting.json","utf8"));
if(!hosting.project_id||hosting.static||hosting.d1!=="DB"||hosting.r2!=="BUCKET")throw new Error("Unexpected server hosting configuration");
console.log("Checked "+checked+" JavaScript modules, HTML assets, unique IDs and hosting bindings.");
