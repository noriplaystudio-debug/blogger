const PROVIDERS = [
  {id:"naver",label:"네이버",clientKey:"NAVER_CLIENT_ID",secretKey:"NAVER_CLIENT_SECRET",portal:"https://developers.naver.com/apps/#/register"},
  {id:"kakao",label:"카카오",clientKey:"KAKAO_CLIENT_ID",secretKey:"KAKAO_CLIENT_SECRET",portal:"https://developers.kakao.com/console/app"},
  {id:"google",label:"Google",clientKey:"GOOGLE_CLIENT_ID",secretKey:"GOOGLE_CLIENT_SECRET",portal:"https://console.cloud.google.com/apis/credentials"}
];
const present=(v)=>typeof v==="string"&&v.trim().length>0;
export function authSettings(env={},backend="sites"){
  let baseURL=null;
  try{
    const u=new URL(env.BETTER_AUTH_URL||"");
    const local=["localhost","127.0.0.1","[::1]"].includes(u.hostname);
    if((u.protocol==="https:"||(local&&u.protocol==="http:"))&&!u.username&&!u.password&&u.pathname==="/"&&!u.search&&!u.hash)baseURL=u.origin;
  }catch{}
  const secretReady=present(env.BETTER_AUTH_SECRET)&&env.BETTER_AUTH_SECRET.length>=32;
  const ready=Boolean(baseURL&&secretReady);
  const providers=PROVIDERS.map(p=>{
    const configured=present(env[p.clientKey])&&present(env[p.secretKey]);
    return {...p,configured,available:backend==="better-auth"&&ready&&configured,callbackURL:baseURL?baseURL+"/api/auth/callback/"+p.id:null};
  });
  let mailReady=false;
  try{mailReady=new URL(env.AUTH_MAIL_WEBHOOK_URL).protocol==="https:"&&present(env.AUTH_MAIL_WEBHOOK_SECRET);}catch{}
  const emailEnabled=env.AUTH_EMAIL_ENABLED==="true"&&ready&&mailReady&&backend==="better-auth";
  return {backend,baseURL,secretReady,ready,mailReady,emailEnabled,providers};
}
export function publicAuthSettings(env={},backend="sites"){
  const s=authSettings(env,backend);
  return {backend,emailEnabled:s.emailEnabled,providers:s.providers.map(p=>({id:p.id,label:p.label,available:p.available,configured:p.configured}))};
}
export function adminAuthSettings(env={},backend="sites"){
  const s=authSettings(env,backend);
  return {...publicAuthSettings(env,backend),baseURL:s.baseURL,secretReady:s.secretReady,mailReady:s.mailReady,providers:s.providers.map(p=>({id:p.id,label:p.label,configured:p.configured,available:p.available,clientKey:p.clientKey,secretKey:p.secretKey,callbackURL:p.callbackURL,portal:p.portal}))};
}
export function betterAuthOptions(env={},database){
  const s=authSettings(env,"better-auth");
  if(!s.ready)throw new Error("BETTER_AUTH_URL은 루트 HTTPS 주소(로컬은 HTTP 허용), BETTER_AUTH_SECRET은 32자 이상으로 설정해 주세요.");
  const socialProviders=Object.fromEntries(s.providers.filter(p=>p.available).map(p=>[p.id,{clientId:env[p.clientKey],clientSecret:env[p.secretKey]}]));
  const sendMail=async(kind,data)=>{
    if(!s.mailReady)throw new Error("인증 메일 전송이 연결되지 않았습니다.");
    const response=await fetch(env.AUTH_MAIL_WEBHOOK_URL,{method:"POST",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/json","Authorization":"Bearer "+env.AUTH_MAIL_WEBHOOK_SECRET},body:JSON.stringify({kind,email:data.user.email,name:data.user.name,url:data.url})});
    if(!response.ok)throw new Error("인증 메일을 전송하지 못했습니다.");
  };
  return {
    database,baseURL:s.baseURL,basePath:"/api/auth",secret:env.BETTER_AUTH_SECRET,
    trustedOrigins:[s.baseURL],socialProviders,
    user:{modelName:"auth_user"},session:{modelName:"auth_session",expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
    account:{modelName:"auth_account",accountLinking:{enabled:false}},
    verification:{modelName:"auth_verification"},
    rateLimit:{enabled:true,storage:"database",window:60,max:20,modelName:"auth_rate_limit"},
    emailAndPassword:{enabled:s.emailEnabled,requireEmailVerification:true,minPasswordLength:12,maxPasswordLength:128,sendResetPassword:async(data)=>sendMail("reset-password",data)},
    emailVerification:{sendOnSignUp:s.emailEnabled,autoSignInAfterVerification:false,sendVerificationEmail:async(data)=>sendMail("verify-email",data)},
    advanced:{useSecureCookies:s.baseURL.startsWith("https:")}
  };
}
