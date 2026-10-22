declare namespace Cloudflare {
  interface Env { DB:D1Database; BUCKET:R2Bucket; PAYMENTS_MODE?:string; }
}
declare module "*.html?raw" {const content:string;export default content;}
