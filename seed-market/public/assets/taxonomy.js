// The primary axis describes the idea being sold. Industry and maturity are separate.
export const TAXONOMY_VERSION="idea-types-2026-10-v1";
export const KIND_GROUPS=Object.freeze({
  making:{label:"제품 · 기술 · 서비스",description:"만들어 쓰는 물건, 소프트웨어와 서비스"},
  creative:{label:"예술 · 콘텐츠",description:"음악부터 작품, 이야기와 공연까지"},
  experience:{label:"스포츠 · 공간 · 교육",description:"움직이고, 머물고, 배우는 경험"},
  impact:{label:"사업 · 사회 · 융합",description:"운영 방식과 사회의 새로운 가능성"}
});
const kind=(label,group,icon,color,art,description,example,topics)=>({label,group,icon,color,art,description,example,topics});
export const CATALOG=Object.freeze({
  product:kind("제품 · 발명","making","box","peach","package","물리적인 제품의 기능·구조·형태","예: 접이식 주방 도구의 구조",[
    ["product-home","생활 · 주방 · 가구",["생활용품","주방","가정용","가구"]],
    ["product-device","디지털 기기 · 가전",["전자기기","가전","디바이스"]],
    ["product-mobility","이동기기 · 모빌리티",["이동기기","자전거","모빌리티"]],
    ["product-tool","산업기기 · 도구",["공구","산업기기","작업 도구"]],
    ["product-care","의료 · 보조기기",["의료기기","보조기기","보행기"]],
    ["product-family","유아 · 반려동물 제품",["유아용품","반려동물용품"]],
    ["product-sports","스포츠 · 레저용품",["운동기구","스포츠용품","캠핑용품"]],
    ["product-fashion","패션 · 뷰티 제품",["의류","화장품","뷰티기기"]],
    ["product-food","식품 · 음료 제품",["음료","식품","간식"]],
    ["product-package","패키지 · 용기",["용기","포장 디자인","패키지"]],
    ["product-other","그 밖의 제품 · 발명",[]]]),
  software:kind("소프트웨어 · AI","making","cpu","mint","ai","프로그램의 기능과 작동 방식","예: 회의 메모 정리 앱",[
    ["software-ai","AI · 자동화",["ai","인공지능","자동화"]],
    ["software-app","웹 · 앱 · SaaS",["웹앱","앱","saas"]],
    ["software-work","업무 · 협업 도구",["업무 도구","협업","온보딩","생산성"]],
    ["software-data","데이터 · 분석",["데이터","분석"]],
    ["software-security","보안 · 개인정보",["보안","개인정보"]],
    ["software-dev","개발 도구 · API",["개발 도구","api","sdk"]],
    ["software-embedded","임베디드 · 기기 제어",["임베디드","펌웨어","기기 제어"]],
    ["software-other","그 밖의 소프트웨어",[]]]),
  service:kind("서비스 · 경험","making","users","blue","map","고객에게 제공하는 과정과 경험","예: 동네 오디오 산책 서비스",[
    ["service-care","생활 · 돌봄 서비스",["돌봄 서비스","생활 대행"]],
    ["service-local","여행 · 관광 · 로컬 경험",["산책 코스","관광","로컬 경험"]],
    ["service-matching","예약 · 중개 · 매칭",["매칭","중개","예약"]],
    ["service-rental","구독 · 대여 서비스",["대여","렌탈","구독 서비스"]],
    ["service-logistics","물류 · 배송 서비스",["배송","물류 서비스"]],
    ["service-community","커뮤니티 · 모임 경험",["커뮤니티","교류 모임"]],
    ["service-professional","전문 · 대행 서비스",["전문 서비스","대행"]],
    ["service-other","그 밖의 서비스",[]]]),
  business:kind("사업 · 창업","impact","briefcase","sand","coffee","수익을 만들고 사업을 운영하는 방식","예: 소규모 카페의 멤버십 운영 모델",[
    ["business-model","신규 사업 · 창업 모델",["사업 모델","비즈니스 모델","창업"]],
    ["business-revenue","수익 · 가격 모델",["수익 모델","가격 모델","멤버십"]],
    ["business-commerce","유통 · 커머스 운영",["유통","커머스","판매 채널"]],
    ["business-store","매장 · 프랜차이즈",["매장 운영","카페","프랜차이즈"]],
    ["business-marketing","마케팅 · 고객 확보",["마케팅","고객 확보","광고 전략"]],
    ["business-operations","조직 · 운영 프로세스",["조직 운영","업무 프로세스"]],
    ["business-b2b","B2B · 제휴",["b2b","제휴","기업 서비스"]],
    ["business-other","그 밖의 사업 기획",[]]]),
  music:kind("음악 · 사운드","creative","music","lavender","music","곡과 소리의 창작 구상","예: 곡의 멜로디·편곡 콘셉트",[
    ["music-composition","멜로디 · 작곡",["멜로디","작곡","선율"]],
    ["music-lyrics","가사 · 탑라인",["가사","탑라인"]],
    ["music-arrangement","편곡 · 프로듀싱",["편곡","프로듀싱"]],
    ["music-beat","비트 · 리듬",["비트","리듬"]],
    ["music-score","OST · BGM",["ost","bgm","배경음악"]],
    ["music-sound","효과음 · 사운드 디자인",["효과음","사운드 디자인"]],
    ["music-concept","음원 · 음악 콘텐츠 기획",["음원 기획","앨범 콘셉트"]],
    ["music-audio","오디오 콘텐츠 · 팟캐스트",["팟캐스트","오디오 콘텐츠"]],
    ["music-other","그 밖의 음악 · 사운드",[]]]),
  art:kind("미술 · 디자인 · 공예","creative","palette","peach","magazine","작품과 시각 표현의 구상","예: 전시 작품·브랜드 그래픽 콘셉트",[
    ["art-illustration","회화 · 일러스트",["회화","일러스트"]],
    ["art-sculpture","조형 · 조각 · 설치",["조각","조형","설치 작품"]],
    ["art-graphic","그래픽 · 브랜딩",["그래픽","브랜딩","로고"]],
    ["art-interface","UI · UX · 인터랙션 디자인",["ui","ux","인터랙션 디자인"]],
    ["art-craft","공예 · 메이킹",["공예","도예","메이킹"]],
    ["art-photo","사진 · 비주얼 콘셉트",["사진 콘셉트","촬영 콘셉트"]],
    ["art-character","캐릭터 · 굿즈 디자인",["캐릭터 디자인","굿즈 디자인"]],
    ["art-other","그 밖의 미술 · 디자인",[]]]),
  video:kind("영상 · 방송 · 애니메이션","creative","clapper","blue","guide","움직이는 영상의 내용과 형식","예: 숏폼 시리즈·방송 포맷",[
    ["video-film","영화 · 단편",["영화","단편영화"]],
    ["video-series","드라마 · 시리즈",["드라마","영상 시리즈"]],
    ["video-format","예능 · 방송 포맷",["예능","방송 포맷"]],
    ["video-animation","애니메이션",["애니메이션"]],
    ["video-commercial","광고 영상 · 뮤직비디오",["광고 영상","뮤직비디오"]],
    ["video-short","숏폼 · 온라인 영상",["숏폼","유튜브","온라인 영상"]],
    ["video-other","그 밖의 영상 기획",[]]]),
  writing:kind("글 · 스토리 · 출판","creative","book","sand","notes","글과 이야기의 소재·구성·세계관","예: 소설 설정·독립 매거진 구성",[
    ["writing-fiction","소설 · 세계관",["소설","소설 세계관"]],
    ["writing-script","시나리오 · 대본",["시나리오","대본"]],
    ["writing-essay","시 · 에세이",["에세이","시집"]],
    ["writing-comic","웹툰 · 만화 스토리",["웹툰","만화 스토리"]],
    ["writing-nonfiction","논픽션 · 정보 출판",["논픽션","정보 출판"]],
    ["writing-publish","독립 출판 · 매거진",["독립 출판","매거진","콘텐츠 기획","기록"]],
    ["writing-other","그 밖의 글 · 출판",[]]]),
  game:kind("게임 · 인터랙티브","creative","gamepad","mint","guide","게임의 규칙·플레이·상호작용","예: 보드게임 규칙·게임 퀘스트",[
    ["game-digital","디지털 게임 기획",["디지털 게임","모바일 게임"]],
    ["game-board","보드 · 카드게임",["보드게임","카드게임"]],
    ["game-rules","게임 규칙 · 밸런스",["게임 규칙","게임 밸런스"]],
    ["game-level","레벨 · 퀘스트 · 내러티브",["퀘스트","레벨 디자인"]],
    ["game-world","게임 캐릭터 · 세계관",["게임 캐릭터","게임 세계관"]],
    ["game-xr","XR · 인터랙티브 체험",["xr","인터랙티브 체험"]],
    ["game-other","그 밖의 게임 기획",[]]]),
  performance:kind("공연 · 무용 · 무대","creative","stage","lavender","community","무대 위 표현과 관객의 경험","예: 안무·뮤지컬·콘서트 연출",[
    ["performance-theater","연극 · 뮤지컬",["연극","뮤지컬"]],
    ["performance-dance","무용 · 안무",["무용","안무"]],
    ["performance-live","콘서트 · 라이브 연출",["콘서트","라이브 연출"]],
    ["performance-traditional","퍼포먼스 · 전통 예술",["퍼포먼스","전통 예술"]],
    ["performance-festival","축제 · 행사 연출",["축제 연출","페스티벌 연출"]],
    ["performance-immersive","무대 · 몰입형 경험",["무대 연출","몰입형 공연"]],
    ["performance-other","그 밖의 공연 기획",[]]]),
  sports:kind("스포츠 · 운동 · 레저","experience","ball","mint","sports","운동 방법·규칙·참여 경험","예: 운동 루틴·새로운 경기 규칙",[
    ["sports-training","운동 프로그램 · 트레이닝",["운동 루틴","트레이닝","운동 프로그램"]],
    ["sports-rules","종목 · 경기 규칙",["경기 규칙","스포츠 종목"]],
    ["sports-coaching","코칭 · 스포츠 교육",["스포츠 코칭","운동 지도"]],
    ["sports-event","경기 · 대회 운영",["대회 운영","경기 운영"]],
    ["sports-outdoor","아웃도어 · 레저",["아웃도어","레저","캠핑 활동"]],
    ["sports-fan","스포츠 참여 · 팬 경험",["팬 경험","스포츠 참여"]],
    ["sports-other","그 밖의 스포츠 · 운동",[]]]),
  space:kind("공간 · 건축 · 도시","experience","building","peach","map","공간의 구성·동선·활용 방식","예: 팝업 공간·공공 쉼터 구성",[
    ["space-interior","주거 · 상업 공간",["주거 공간","상업 공간"]],
    ["space-architecture","건축 · 리모델링",["건축","리모델링"]],
    ["space-layout","인테리어 · 가구 배치",["가구 배치","인테리어"]],
    ["space-public","도시 · 공공 공간",["공공 공간","도시 공간"]],
    ["space-garden","조경 · 정원",["조경","정원"]],
    ["space-exhibition","전시 · 팝업 공간",["팝업 공간","전시 공간"]],
    ["space-other","그 밖의 공간 기획",[]]]),
  education:kind("교육 · 학습","experience","graduation","blue","notes","배우는 내용·방법·교육 경험","예: 수업 커리큘럼·학습법",[
    ["education-course","수업 · 커리큘럼",["커리큘럼","수업 설계"]],
    ["education-material","교재 · 학습 콘텐츠",["교재","학습 콘텐츠"]],
    ["education-method","학습법 · 평가",["학습법","평가 방법"]],
    ["education-child","유아 · 아동 교육",["유아 교육","아동 교육"]],
    ["education-career","직무 · 평생 교육",["직무 교육","평생 교육"]],
    ["education-experience","교육 운영 · 학습 경험",["교육 운영","학습 경험"]],
    ["education-other","그 밖의 교육 기획",[]]]),
  society:kind("공공 · 사회 혁신","impact","leaf","mint","community","공공 문제와 공동체를 위한 방식","예: 자원 순환·접근성 개선 제안",[
    ["society-welfare","복지 · 돌봄 체계",["복지","돌봄 체계"]],
    ["society-community","지역 · 공동체",["공동체","지역 협력"]],
    ["society-environment","환경 · 자원 순환",["자원 순환","환경 정책"]],
    ["society-safety","재난 · 안전",["재난","공공 안전"]],
    ["society-inclusion","접근성 · 포용",["접근성","포용"]],
    ["society-policy","시민 참여 · 공공 정책",["시민 참여","공공 정책"]],
    ["society-other","그 밖의 사회 혁신",[]]]),
  research:kind("연구 · 기술 원리","making","flask","lavender","ai","기술 원리·공정·검증 방법","예: 소재 실험·생산 공정 개선",[
    ["research-process","기술 원리 · 공정",["기술 원리","생산 공정"]],
    ["research-material","소재 · 부품",["소재","부품"]],
    ["research-energy","에너지 · 환경 기술",["에너지 기술","환경 기술"]],
    ["research-bio","바이오 · 농생명",["바이오","농생명"]],
    ["research-method","실험 · 분석 방법",["실험 방법","분석 방법"]],
    ["research-tools","연구 도구 · 실증 설계",["실증 설계","연구 도구"]],
    ["research-other","그 밖의 연구 구상",[]]]),
  other:kind("복합 · 기타","impact","sparkle","sand","notes","여러 종류가 결합되거나 아직 구분하기 어려운 구상","예: 예술·기술이 결합된 복합 프로젝트",[
    ["other-cross","융합 · 복합 기획",["융합 프로젝트","복합 기획"]],
    ["other-general","그 밖의 아이디어",[]]])
});
export const TOPICS=Object.freeze(Object.fromEntries(Object.entries(CATALOG).flatMap(([category,data])=>data.topics.map(([id,label,keywords])=>[id,{id,label,category,keywords}]))));
export const DOMAINS=Object.freeze({
  living:{label:"생활 · 가족",keywords:["가족","유아","식물","생활용품"]},
  health:{label:"건강 · 의료",keywords:["건강","의료","운동","돌봄"]},
  food:{label:"식품 · 외식",keywords:["음식","식품","외식","카페"]},
  fashion:{label:"패션 · 뷰티",keywords:["패션","뷰티","화장품","의류"]},
  environment:{label:"환경 · 에너지",keywords:["친환경","순환","재사용","에너지"]},
  local:{label:"로컬 · 관광",keywords:["로컬","동네","관광","여행"]},
  work:{label:"업무 · 기업",keywords:["업무","기업","b2b","생산성","회의"]},
  learning:{label:"교육 · 성장",keywords:["교육","학습","배움","수업"]},
  culture:{label:"문화 · 여가",keywords:["음악","미술","공연","게임","출판","콘텐츠"]},
  mobility:{label:"교통 · 물류",keywords:["교통","물류","배송","모빌리티"]},
  community:{label:"지역 · 공동체",keywords:["공동체","이웃","커뮤니티"]},
  science:{label:"과학 · 산업",keywords:["과학","산업","기술 원리","실험"]},
  finance:{label:"금융 · 경제",keywords:["금융","경제","결제","회계"]},
  administration:{label:"법률 · 행정",keywords:["법률","행정","공공 정책"]},
  agriculture:{label:"농업 · 해양",keywords:["농업","농생명","해양","수산"]},
  safety:{label:"안전 · 보안",keywords:["안전","보안","재난"]}
});
export const LEGACY_CATEGORIES=Object.freeze({tech:"테크 · AI",life:"라이프스타일",content:"콘텐츠 · 디자인",social:"소셜 · 커뮤니티"});
export const LEGACY_TOPICS=Object.freeze({
  "tech-ai":"software-ai","tech-work":"software-work","tech-app":"software-app","tech-data":"software-data","tech-other":"software-other",
  "life-local":"service-local","life-hobby":null,"life-care":null,"life-green":null,"life-other":null,
  "business-local":"business-store","business-pass":"business-revenue","business-circular":"business-model",
  "content-design":"art-graphic","content-publish":"writing-publish","content-media":null,"content-creator":null,"content-other":null,
  "social-skill":null,"social-community":"service-community","social-local":null,"social-impact":"society-other","social-other":null
});
const flat=value=>String(value??"").normalize("NFKC").toLowerCase().replace(/\s+/g,"");
const hasKeyword=(text,word)=>/^[a-z0-9]+$/i.test(word)?String(text??"").normalize("NFKC").toLowerCase().split(/[^a-z0-9]+/).includes(word.toLowerCase()):flat(text).includes(flat(word));
export function inferTopic(idea){
  if(TOPICS[idea.topic]?.category===idea.category)return idea.topic;
  const topics=CATALOG[idea.category]?.topics||[],text=[idea.title,idea.summary,...(idea.tags||[])].join(" ");
  let best=topics.at(-1)?.[0]||null,score=0;
  for(const [id,,keywords] of topics){const n=keywords.reduce((sum,word)=>sum+(hasKeyword(text,word)?1:0),0);if(n>score){score=n;best=id;}}
  return best;
}
function inferDomains(idea){
  const text=[idea.title,idea.summary,...(idea.tags||[])].join(" ");
  return Object.entries(DOMAINS).map(([id,data])=>[id,data.keywords.filter(word=>hasKeyword(text,word)).length]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
}
export function classifyIdea(idea,{confirmed=false}={}){
  const original=idea.category;
  if(confirmed&&Object.hasOwn(CATALOG,original)&&TOPICS[idea.topic]?.category===original){
    return {...idea,domainIds:[...new Set((idea.domainIds||[]).filter(id=>Object.hasOwn(DOMAINS,id)))].slice(0,3),classificationSource:"seller",legacyCategory:null};
  }
  let category=Object.hasOwn(CATALOG,original)?original:null,topic=null,source="legacy-mapped";
  if(Object.hasOwn(LEGACY_TOPICS,idea.topic)&&LEGACY_TOPICS[idea.topic]){topic=LEGACY_TOPICS[idea.topic];category=TOPICS[topic].category;}
  if(!category){
    // Use only public text. These are suggestions, never an edit to a paid listing.
    const candidates=[];
    for(const [id,data] of Object.entries(CATALOG)){
      if(id==="other")continue;
      let score=0;
      for(const [,,keywords] of data.topics)for(const word of keywords){if(hasKeyword(idea.title,word))score+=4;if((idea.tags||[]).some(tag=>hasKeyword(tag,word)))score+=3;if(hasKeyword(idea.summary,word))score++;}
      if(score>=4)candidates.push({id,score});
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(candidates.length&&(!candidates[1]||candidates[0].score-candidates[1].score>=3))category=candidates[0].id;
    if(category)source="legacy-suggested";else{category="other";source="legacy-review";}
  }
  topic=topic||inferTopic({...idea,category});
  return {...idea,category,topic,domainIds:inferDomains(idea),classificationSource:source,legacyCategory:Object.hasOwn(LEGACY_CATEGORIES,original)?original:null};
}
const BASE_BRIEF=Object.freeze({problem:["배경과 해결하려는 과제","어떤 필요나 맥락에서 나온 아이디어인가요?"],solution:["핵심 아이디어와 구체적인 구성","핵심 내용, 구성과 차별점을 구체적으로 설명해 주세요."],audience:["대상과 활용 장면","누가, 어디에서, 어떤 목적으로 활용하나요?"],execution:["실행 계획과 확인 방법","준비할 자료, 실행 단계, 일정과 확인할 가설을 적어주세요."]});
const BRIEFS={
  software:{problem:["해결할 문제와 기존 도구의 한계","현재의 불편과 기존 프로그램으로 충분하지 않은 부분을 적어주세요."],solution:["기능·작동 방식과 핵심 화면","입력·처리·출력, 기능과 사용자 흐름을 구체적으로 설명해 주세요."],audience:["사용자와 이용 환경","누가 어떤 기기와 상황에서 사용하는 소프트웨어인가요?"],execution:["구현과 사용자 검증 계획","최소 구현 범위, 필요한 기술과 일정, 사용성 확인 방법을 적어주세요."]},
  service:{problem:["고객의 필요와 서비스 배경","고객이 어떤 과정에서 어려움을 겪는지 설명해 주세요."],solution:["제공 과정과 핵심 고객 경험","신청부터 제공·완료까지의 과정과 제공자의 역할을 적어주세요."],audience:["고객과 서비스 제공 환경","누구에게 어떤 지역·상황에서 제공하는 서비스인가요?"],execution:["시범 운영과 품질 확인 계획","필요 인력, 운영 단계, 확인할 조건과 고객 반응 검증을 적어주세요."]},
  business:{problem:["사업 기회와 해결하려는 문제","시장의 필요, 기존 대안과 사업을 제안하는 근거를 적어주세요."],solution:["사업 모델과 수익·운영 구조","누구에게 무엇을 팔고 어떻게 수익을 만드는지 구체적으로 설명해 주세요."],audience:["목표 고객과 시장 가정","목표 고객과 시장의 근거, 아직 확인하지 않은 가정을 구분해 주세요."],execution:["사업 실행과 수요 검증 계획","초기 실행 단계와 비용 가정, 수요와 수익 구조를 확인할 방법을 적어주세요."]},
  society:{problem:["공공 문제와 제안의 배경","누가 어떤 문제를 겪고 있으며 어떤 근거가 있는지 적어주세요."],solution:["해결 방식과 참여·운영 구조","문제를 줄이기 위한 절차와 이해관계자의 역할을 설명해 주세요."],audience:["대상자와 지역·적용 조건","영향을 받는 사람과 지역, 필요한 접근 조건을 적어주세요."],execution:["시범 적용과 효과 확인 계획","협력 주체, 적용 단계와 확인할 지표·제약을 구분해 주세요."]},
  product:{problem:["사용상의 문제와 개발 배경","기존 제품의 불편과 새 제품이 필요한 이유를 설명해 주세요."],solution:["제품 구조와 핵심 기능","형태, 부품, 작동 원리와 사용 과정을 적어주세요."],audience:["사용 대상과 사용 환경","누가 어떤 환경에서 사용하는 제품인가요?"],execution:["시제품 제작과 검증 계획","재료·제작 단계·예상 제약과 성능을 확인할 방법을 적어주세요."]},
  music:{problem:["음악의 주제와 기획 의도","분위기, 장르, 전달하려는 감정과 기획 배경을 적어주세요."],solution:["멜로디·가사·편곡의 핵심 구상","곡의 구조, 리듬, 악기와 차별점을 설명하고 제공 범위를 명시해 주세요."],audience:["청취 대상과 활용 장면","어떤 청취자나 영상·공연 등에서 활용할 음악인가요?"],execution:["음악 제작 계획과 권리 확인","제작 단계와 필요한 참여자, 참고한 자료와 권리 확인 사항을 구분해 주세요."]},
  art:{problem:["표현 의도와 참고 맥락","표현하려는 주제와 참고한 작품·자료를 구분해 설명해 주세요."],solution:["작품·디자인의 구성과 차별점","시각 요소, 형식, 재료, 구성과 고유한 표현 방식을 적어주세요."],audience:["감상·사용 대상과 전시 환경","누가 감상하거나 사용하며 어디에서 보여줄 작품인가요?"],execution:["제작·구현 계획과 권리 확인","제작 과정과 재료, 활용 범위와 권리 확인 사항을 적어주세요."]},
  video:{problem:["영상의 주제와 기획 의도","장르와 주제, 전달할 메시지를 적어주세요."],solution:["영상의 구성·포맷과 핵심 장면","흐름, 인물, 장면과 영상만의 차별점을 구체적으로 설명해 주세요."],audience:["시청 대상과 상영·배포 장면","누가 어떤 채널이나 환경에서 보는 영상인가요?"],execution:["제작 계획과 자료·권리 확인","촬영·편집 단계, 인력과 일정, 참고 자료의 권리를 설명해 주세요."]},
  writing:{problem:["이야기·출판의 주제와 창작 의도","장르, 주제, 소재와 창작 동기를 적어주세요."],solution:["줄거리·세계관·목차의 핵심 구성","인물과 전개 또는 출판물의 목차와 독창적인 구성을 적어주세요."],audience:["독자와 활용 매체","예상 독자와 책·웹툰·대본 등 활용 형태를 적어주세요."],execution:["집필·편집·제작 계획","완성까지의 단계와 제공할 원고·구성안, 권리 확인 사항을 적어주세요."]},
  game:{problem:["게임의 콘셉트와 플레이 의도","장르와 플레이어에게 줄 재미를 설명해 주세요."],solution:["플레이 방식·규칙과 핵심 시스템","플레이 흐름, 목표, 규칙과 차별점을 구체적으로 적어주세요."],audience:["플레이어와 이용 환경","예상 플레이어, 플랫폼이나 인원·장소를 적어주세요."],execution:["프로토타입과 플레이 테스트 계획","만들어 볼 최소 버전과 테스트 방법, 자료와 권리를 확인해 주세요."]},
  performance:{problem:["공연의 주제와 연출 의도","관객에게 전달할 감정과 무대의 주제를 적어주세요."],solution:["무대 구성·안무·연출의 핵심","장면, 동선, 안무와 관객 경험을 구체적으로 설명해 주세요."],audience:["관객과 공연 환경","예상 관객과 공연장·행사 환경을 적어주세요."],execution:["공연 제작과 리허설 계획","필요 인력, 무대·안전 조건과 리허설·권리 확인 계획을 적어주세요."]},
  sports:{problem:["운동·경기의 목적과 배경","어떤 참여 경험이나 운동상의 과제를 개선하나요?"],solution:["운동 프로그램·규칙과 진행 방식","운동 순서·강도 또는 경기 규칙과 차별점을 설명해 주세요."],audience:["참여 대상과 운동 환경","연령·경험 수준, 인원, 장소와 필요한 조건을 적어주세요."],execution:["시범 운영과 안전 확인 계획","진행 단계, 지도 범위, 제약과 안전 확인 방법을 적어주세요."]},
  space:{problem:["공간의 과제와 기획 의도","현재 공간의 문제와 원하는 이용 경험을 설명해 주세요."],solution:["공간 구성·동선과 핵심 설계","배치, 동선, 재료와 활용 방식을 구체적으로 적어주세요."],audience:["이용자와 입지·공간 조건","이용자와 면적·입지 등 설계의 가정을 적어주세요."],execution:["구현 단계와 조건 확인","제작·시공의 가정, 접근성·안전·허가 등 확인할 조건을 적어주세요."]},
  education:{problem:["학습 목표와 교육 배경","배워야 하는 내용과 기존 학습의 어려움을 적어주세요."],solution:["커리큘럼·교재·학습 활동 구성","학습 순서와 활동, 내용의 차별점을 설명해 주세요."],audience:["학습자와 교육 환경","학습자의 수준과 연령, 수업 환경을 적어주세요."],execution:["시범 수업과 학습 확인 계획","준비 자료, 진행 단계와 학습 결과를 확인할 방법을 적어주세요."]},
  research:{problem:["연구·기술 과제와 가설","확인하려는 기술 과제, 기존 근거와 가설을 구분해 주세요."],solution:["기술 원리·공정·실험의 핵심","원리와 절차, 차별점과 아직 확인하지 않은 부분을 설명해 주세요."],audience:["적용 대상과 연구 조건","적용 대상과 장비·환경 등 전제 조건을 적어주세요."],execution:["실험·실증 계획과 제약 확인","검증 단계와 지표, 필요한 자원·안전·권리 조건을 적어주세요."]}
};
export const briefFor=category=>({...BASE_BRIEF,...(BRIEFS[category]||{})});
export function groupedKindOptions({emptyLabel="종류를 선택하세요",includeAll=false}={}){
  // Labels and identifiers below come only from this curated registry.
  return '<option value="'+(includeAll?"all":"")+'">'+emptyLabel+'</option>'+Object.entries(KIND_GROUPS).map(([group,data])=>'<optgroup label="'+data.label+'">'+Object.entries(CATALOG).filter(([,item])=>item.group===group).map(([id,item])=>'<option value="'+id+'">'+item.label+'</option>').join("")+'</optgroup>').join("");
}
