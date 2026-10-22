import {betterAuthOptions} from "./settings.mjs";
export async function createPortableAuth(database,env){
  const {betterAuth}=await import("better-auth");
  return betterAuth(betterAuthOptions(env,database));
}
