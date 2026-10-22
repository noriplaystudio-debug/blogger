import {DatabaseSync} from "node:sqlite";
import {createPortableAuth} from "./runtime.mjs";
const path=process.env.AUTH_DATABASE_PATH||".sites-runtime/auth.sqlite";
export const auth=await createPortableAuth(new DatabaseSync(path),process.env);
