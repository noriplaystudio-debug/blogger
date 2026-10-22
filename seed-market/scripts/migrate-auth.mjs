import {spawnSync} from "node:child_process";
try{process.loadEnvFile(".env.local");}catch(error){if(error.code!=="ENOENT")throw error;}
const {authSettings}=await import("../auth/settings.mjs");
if(!authSettings(process.env,"better-auth").ready)throw new Error("Run npm run auth:setup and configure a valid application URL and server secret first.");
const result=spawnSync(process.platform==="win32"?"npx.cmd":"npx",["--yes","auth@1.7.11","migrate","--config","./auth/cli.mjs"],{stdio:"inherit",env:process.env});
if(result.error)throw result.error;
process.exitCode=result.status??1;
