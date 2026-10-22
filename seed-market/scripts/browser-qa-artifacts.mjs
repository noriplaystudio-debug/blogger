import {copyFileSync,existsSync,mkdirSync,readFileSync,realpathSync} from "node:fs";
import {basename,dirname,extname,resolve,sep} from "node:path";

// Export only evidence named by a generated report, never the test database,
// upload originals or arbitrary paths provided in an error message.
export function exportQAEvidence(resultPath,destination){
 const report=JSON.parse(readFileSync(resultPath,"utf8"));
 const sourceDirectory=realpathSync(dirname(resultPath));
 const files=[{path:resultPath,name:"result.json"}];
 for(const [field,extension] of [["screenshots",".png"],["traces",".zip"]]){
  for(const path of report[field]||[]){
   const resolved=realpathSync(path);
   if(!resolved.startsWith(sourceDirectory+sep)||extname(path)!==extension)throw new Error("Unsafe QA evidence path: "+path);
   files.push({path:resolved,name:basename(path)});
  }
 }
 for(const name of ["server.log","failure.html"]){
  const path=resolve(sourceDirectory,name);
  if(existsSync(path)){
   if(!realpathSync(path).startsWith(sourceDirectory+sep))throw new Error("Unsafe QA evidence link: "+name);
   files.push({path,name});
  }
 }
 if(new Set(files.map(item=>item.name)).size!==files.length)throw new Error("Duplicate QA evidence filename");
 mkdirSync(destination,{recursive:true});
 for(const file of files)copyFileSync(file.path,resolve(destination,file.name));
 return {status:report.status,phase:report.phase,passedSteps:report.passedSteps||0,files:files.map(file=>file.name)};
}
