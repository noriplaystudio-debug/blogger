import {CATALOG,TOPICS,DOMAINS,MATURITY_LABELS} from "../public/assets/catalog.js";
import {PLATFORM_NOTICE_TEXT} from "../public/assets/platform-policy.js";
import {PATENT_PURCHASE_NOTICE} from "../public/assets/patent-policy.js";
export const CATEGORIES = Object.freeze(Object.fromEntries(Object.entries(CATALOG).map(([id,data])=>[id,data.label])));
export const MATURITIES = MATURITY_LABELS;
export const TERMS_VERSION = "2026-10-27-sharing-draft-v3";
export const SELLER_TERMS_VERSION = "2026-10-27-seller-sharing-v2";
export function sellerTermsText(c){return "이 아이디어의 열람권 수수료는 "+c.viewBps/100+"%, 단독 이용권 수수료는 "+c.useBps/100+"%입니다. 원 미만 수수료는 내림 처리하며, 결제 후 "+c.holdDays+"일간 정산을 대기합니다. 신고·환불·분쟁 검토 중인 거래는 정산을 보류합니다. PG 비용과 세금 차감 전 예상액이며 현재는 실제 청구·송금 없는 테스트입니다. 제공할 권한이 있는 자료를 등록하고 제공 범위·출처·미확인 가설과 한계를 사실대로 안내합니다. 기존에 합의한 거래 조건과 법령상 책임은 이 안내로 소급 변경하지 않습니다.\n\n"+PLATFORM_NOTICE_TEXT;}
export const VIEW_PLEDGE = "열람료는 상세 설명·기획·참고 자료를 살펴보는 대가입니다. 자료 원문의 복제·배포·상업적 재이용은 별도로 안내된 권한과 이용 조건을 확인합니다. 일반적인 발상이나 독립적으로 만든 결과물의 권리가 구매만으로 제한되거나 새로 생긴다는 뜻은 아닙니다. 다른 구매자가 사이트 내 단독 이용권을 취득하면 기존 유료 열람자의 상세 재열람이 종료되는 조건을 확인합니다. "+PATENT_PURCHASE_NOTICE+"\n\n"+PLATFORM_NOTICE_TEXT;
export const USE_PLEDGE = "추가 단독 이용권은 이 사이트에서 해당 자료의 추가 판매와 다른 구매자의 상세 재열람을 종료하는 조건입니다. 자료를 이용할 수 있는 범위는 판매자가 실제 보유한 권리와 제공 조건에 따릅니다. 아이디어 자체나 제3자의 특허에 대한 법적 독점권을 취득하는 것은 아닙니다. "+PATENT_PURCHASE_NOTICE+"\n\n"+PLATFORM_NOTICE_TEXT;
export const TEST_NOTICE = "현재는 테스트 결제입니다. 실제 금전 청구나 법적 사용권 이전은 발생하지 않습니다. 서약 문구는 법률 검토 전 초안입니다.";
export class AppError extends Error { constructor(status,message){super(message);this.status=status;} }
export const fail=(status,message)=>{throw new AppError(status,message);};
export function validateListing(input) {
  const take=(key,min,max)=>{const value=typeof input[key]==="string"?input[key].trim():"";if(value.length<min||value.length>max)fail(400,key+" 항목은 "+min+"~"+max+"자로 입력해 주세요.");return value;};
  const result={title:take("title",6,80),summary:take("summary",30,300),problem:take("problem",50,6000),solution:take("solution",80,10000),audience:take("audience",20,2000),execution:take("execution",80,10000)};
  if(!Object.hasOwn(CATEGORIES,input.category))fail(400,"아이디어 종류를 선택해 주세요.");
  if(TOPICS[input.topic]?.category!==input.category)fail(400,"선택한 종류에 맞는 세부 유형을 골라주세요.");
  const domains=input.domainIds??[];
  if(!Array.isArray(domains)||domains.length>3||new Set(domains).size!==domains.length||domains.some(id=>typeof id!=="string"||!Object.hasOwn(DOMAINS,id)))fail(400,"관련 분야는 목록에서 최대 3개까지 선택해 주세요.");
  result.domainIds=domains;
  if(!Object.hasOwn(MATURITIES,input.maturity))fail(400,"구체화 수준을 선택해 주세요.");
  for(const key of ["viewPrice","usePrice"]){const value=Number(input[key]);if(!Number.isSafeInteger(value)||value<1000||value>100000000||value%1000!==0)fail(400,"가격은 1,000원부터 100,000,000원까지 1,000원 단위로 입력해 주세요.");result[key]=value;}
  if(result.usePrice<result.viewPrice)fail(400,"독점 사용료는 열람료 이상으로 설정해 주세요.");
  result.category=input.category;result.topic=input.topic;result.maturity=input.maturity;
  const list=(value,maxItems,maxLength,label,required=false)=>{
    if(value===undefined&&!required)return [];
    if(!Array.isArray(value)||value.some(x=>typeof x!=="string"))fail(400,label+"의 입력 형식을 확인해 주세요.");
    const items=value.map(x=>x.trim()).filter(Boolean);
    if((required&&!items.length)||items.length>maxItems||items.some(x=>x.length>maxLength))fail(400,label+"는 최대 "+maxItems+"개, 항목당 "+maxLength+"자까지 입력해 주세요.");
    return [...new Set(items)];
  };
  result.tags=list(input.tags,3,18,"태그");
  result.deliverables=list(input.deliverables,6,80,"제공 자료",true);
  if(!Array.isArray(input.imageIds)||input.imageIds.length<1||input.imageIds.length>5||new Set(input.imageIds).size!==input.imageIds.length||input.imageIds.some(x=>typeof x!=="string"||x.length>100))fail(400,"상세 이미지 1~5개를 첨부해 주세요.");
  result.imageIds=input.imageIds;result.coverId=typeof input.coverId==="string"?input.coverId:null;
  for(const [key,min,max,label] of [["originality",20,4000,"창작 근거와 출처"],["validationNote",20,4000,"검증 현황"],["risks",10,2000,"한계와 위험"]]){
    const value=typeof input[key]==="string"?input[key].trim():"";
    if(value.length<min||value.length>max)fail(400,label+"를 "+min+"~"+max+"자로 작성해 주세요.");
    result[key]=value;
  }
  return result;
}
export function imageType(bytes) {
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return "image/png";
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return "image/webp";
  return null;
}
