import {readFile,writeFile,mkdir} from "node:fs/promises";
import {randomBytes} from "node:crypto";
await mkdir(".sites-runtime",{recursive:true});
let contents;
try{contents=await readFile(".env.local","utf8");}catch(error){if(error.code!=="ENOENT")throw error;contents=await readFile(".env.example","utf8");}
if(!/^BETTER_AUTH_SECRET=.+$/m.test(contents)){
  const secret=randomBytes(48).toString("base64url");
  contents=contents.replace(/^BETTER_AUTH_SECRET=.*$/m,"BETTER_AUTH_SECRET="+secret);
}
await writeFile(".env.local",contents,{mode:0o600});
console.log("Created/updated ignored .env.local. No credential values were printed.");
console.log("Register provider apps, enter their keys in server environment settings, then migrate the independent auth database.");
