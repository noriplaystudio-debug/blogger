import {env} from "cloudflare:workers";
import {handleAPI} from "../../../server/api.mjs";
export const dynamic="force-dynamic";
function handler(request:Request){
  const id=request.headers.get("oai-authenticated-user-id");
  const email=request.headers.get("oai-authenticated-user-email");
  return handleAPI(request,env,{identity:id&&email?{id,email}:null});
}
export {handler as GET,handler as POST,handler as DELETE};
