# Blogger 자동화 에이전트: 프로젝트 결정·장애·개선 이력

마지막 확인: 2026-10-28 (Asia/Seoul)

이 문서는 프로젝트 대화에서 전달된 이력 요약과 현재 체크아웃의 파일·Git 기록을 함께 정리한다. 채팅 전체 원문을 빠짐없이 가져온 문서는 아니다. 따라서 과거 대화에서만 확인된 사실과 코드에서 검증된 사실을 구분하며, 이후 작업 때마다 새 근거로 갱신한다.

## 작업 전 판단 기준

- 사용자 최우선 목표는 자동 글 작성·게시 흐름을 안정화하는 것이다. 주간 계획만 성공하거나 게시 작업을 건너뛰는 것은 완료가 아니다.
- 주간 계획 → 일일 작업 선택 → 자료 조사 → 작성 → 독립 검수/근거 감사 → Blogger 저장 또는 승인된 공개까지 단계별 상태와 실패 이유를 추적한다.
- 출처 조건은 과거 오류를 줄이기 위해 크게 완화하라는 요구가 있었다. 먼저 공공기관·공식 원문, 다음 관련 홈페이지, 마지막으로 신뢰 가능한 공개 게시글·기사 순으로 찾고, 핵심 주장을 확인하는 출처 하나라도 확보되면 범위를 좁혀 진행하는 방향이 합의됐다. 찾지 못한 사실은 추측하지 않는다.
- 출처 부족 항목 하나가 전체 계획/일일 실행을 막지 않게 한다. 대체 주제·다른 글 방향을 시도하고, 끝내 불가능한 항목만 격리하며 나머지 작업을 계속한다.
- API/모델 응답 형식 오류, 본문 잘림, 타임아웃, 새로고침·재부팅 후 진행 상태 소실은 반복된 장애다. 오류 복구가 불가능한 경우 원고와 진단 정보를 보존하고, 실패 지점부터 재개할 수 있어야 한다.
- 장문 글의 분량은 최초 생성 단계부터 요구 조건을 만족해야 한다. 단순 후처리나 재시도만으로 해결됐다고 보지 말고 Blogger에 저장되는 실제 결과를 확인한다.
- 자동화가 글 작성·게시를 건너뛰거나 사용자 승인 없이 공개 범위를 바꾸는 방식으로 오류를 숨기지 않는다. 임시글 저장과 공개는 구분한다.
- 사용자는 점검뿐 아니라 원인 분석, 수정, 검증을 이어서 수행하고, 배포 요청/승인 범위가 명확한 경우 배포 상태까지 확인해 알려주길 원한다. 배포 여부를 추측해서 보고하지 않는다.

## 과거 장애 및 개선 흐름

아래의 초기 이력은 프로젝트에 포함된 이전 대화들의 요약에 근거한다. 원문별 날짜·로그는 현재 문맥만으로 모두 대조하지 못했으므로 세부 재현 조건을 만들어내지 않는다.

| 이슈 | 확인된 과거 증상 | 이후 반영/기준 | 현재 상태 |
| --- | --- | --- | --- |
| 계획 생성 JSON 모드와 웹 검색 충돌 | `400 Web Search cannot be used with JSON mode` | 계획 생성에서 검색 응답과 구조화 출력을 함께 강제하지 않는 설계 필요 | 현재 실제 요청 설정 점검 필요 |
| JSON 파싱 실패·응답 잘림 | 긴 JSON 배열/원고 파싱 실패, 설명문 응답, 본문 잘림 | JSON 자동 복구·필드 복구·본문 길이 제한을 처음 작성 프롬프트부터 반영 | 코드에 `jsonrepair`, 복구 코드 흔적 있음; 실제 전체 경로 검증 필요 |
| 조사·작성 작업 멈춤/타임아웃 | `working` 장기 지속, 조사 상태 소실, 축소 설정에서도 시간 초과 | 비동기 작업/상태 보존, stale 작업 복구, 재시도와 진행 표시 | Cron/worker 및 stale 복구 흔적 있음; 운영 성공은 로그 확인 필요 |
| 근거 차단 과다 | 계획 또는 게시가 출처 부족으로 반복 차단 | 근거 조건을 크게 완화하고 단일 확인 가능 출처로 주장 범위를 좁힘 | 최신 커밋과 코드에서 1개 출처 기준 확인; README에는 예전 다중 출처 기준이 남아 문서 불일치 |
| Blogger 연결 혼선 | `connected`로 표시되어도 목록 조회 실패, invalid argument, 반복 연결 유도 | 실제 목록 API 진단과 OAuth 오류를 구분하고 무조건 재인증을 요구하지 않음 | README에 최소 목록 요청 및 오류 구분 안내; 실제 연결은 운영 환경에서 별도 확인 |
| 검수 후 NEEDS_REVIEW 반복 | 재검수로 완료 가능한지 불명확, JSON 형식만 실패해 초안 유실 우려 | 완성 원고 보존, 자동 복구, NEEDS_REVIEW 임시글 저장 지원; 공개는 승인 분리 | README에 기능 설명 있음; 현재 런타임 동작은 해당 경로 테스트 필요 |
| 중간 정지/재개와 대량 작업 안정성 | 동시 작성 중 중단 곤란, 재부팅 뒤 이어가기 요구 | 영속 상태와 실패 작업만 재개, 오류 항목 격리 후 나머지 계속 | 현재 저장소 구조 및 운영 DB 상태 확인 필요 |
| 글 발행 일정 실패 우려 | 주간 계획은 있어도 일일 자동 게시가 되지 않을 수 있음 | 계획 생성과 일일 cron/worker 실행을 별도 헬스체크로 검증 | 코드에 매일 09:00(KST), worker, 재시도 경로 선언; 실제 Vercel 스케줄·환경변수·Blogger 권한 미확인 |

## 현재 체크아웃에서 확인한 사실 (2026-09-30)

- 저장소: `noriplaystudio-debug/blogger` 프로젝트로 식별된 로컬 Git 체크아웃. 현재 브랜치 `main`; `origin/main`보다 1개 커밋 앞서 있음.
- 최근 커밋: `fd29c5b Relax source requirements to one verified source`; 부모/원격 기준 커밋은 `23c8e9d Update resilience fixture for 1500-character article minimum`.
- `lib/production.ts`의 조사 프롬프트는 공공/공식 자료 → 관련 홈페이지 → 공개 게시글·기사 순으로 찾고, 핵심 사실을 직접 확인 가능한 출처 하나를 충분 조건으로 삼는다. 출처로 확인되지 않는 필수 내용은 조사 전체를 실패시키지 않고 지원 불가로 표시한다.
- 같은 파일의 최종 근거 감사 프롬프트도 핵심 사실을 확인하는 출처 하나로 충분하다고 안내한다.
- `app/api/cron/daily`, `article-worker`, 주중/당일 retry 경로 및 `recoverStaleArticleJobs(15)` 관련 코드를 검색에서 확인했다. 이는 코드 경로의 존재를 뜻하며, Vercel에서 오늘 실제 실행되었다는 증거는 아니다.
- `lib/models.ts`에서 모델 요청 timeout 90초와 JSON 복구 코드가 확인됐다. `README.md`는 자동 복구·NEEDS_REVIEW·stale 작업 복구 등을 기능으로 설명한다.
- 문서 불일치: `README.md`의 편집 안전장치에는 서로 다른 출처 2곳 이상/1차 출처 1곳 필수라고 적힌 구형 문구가 있다. 최근 커밋과 `lib/production.ts`의 프롬프트는 출처 1개로 완화되어 있다. README 내용을 코드 기준으로 갱신해야 한다.
- 이 체크아웃만으로 Vercel 운영 환경변수, Cron 실행 로그, 데이터베이스 큐 상태, 실제 Blogger OAuth 유효성, 예약 발행 결과는 확인하지 못했다. 점검/배포 시 이들을 별도 확인해야 한다.
- 2026-09-30 13:34 KST에 Vercel Production의 공개 `/api/automation/health`를 조회했다. `automation.enabled=true`, `autoPublish=true`, 하루 목표 7건이었지만 `latestDailyRun`은 10:25 KST 시작, `status=success`인데 처리/성공 0건이었다. 상태 집계는 `working=7`, `stale_working=7`, 최근 worker run은 실패 20건, 최근 발행/저장 감사 활동은 9월 27일의 `draft_created`만 표시됐다. 월 AI 비용 추정/기록 105,000원, 설정 예산 100,000원이며 `pausedByConfiguredLimit=true`였으나 코드상 cron은 이를 advisory로 처리한다. `/api/automation/health`는 집계값을 반환하므로 성공 상태만 보고 발행 성공으로 간주하면 안 된다.
- 2026-09-30 13:34 KST에 Vercel 런타임 로그를 00:00–04:30 UTC 구간으로 검색했으며 daily/worker 요청 로그가 없었다. `vercel.json`은 매일 00:00 UTC(09:00 KST) daily cron과 09:20, 09:40, 10:00, 17:50 KST retry를 선언한다. 로그 결과가 비어 있으면 해당 시간대가 로그에 기록되지 않은 것이며, 이 확인에서는 오전 9시 cron 호출 성공을 입증할 기록을 찾지 못했다.
- Vercel 프로젝트 설정 조회에서 배포 보호 SSO가 `all_except_custom_domains`로 켜져 있고 프로젝트에는 `vercel.app` 배포 별칭만 확인됐다. 내부 worker 호출은 현재 요청의 `vercel.app` origin으로 POST를 보내며 Vercel 보호 우회 헤더를 보내지 않았다. 프로젝트에 자동화 우회 비밀키가 설정돼 있는지는 사용 가능한 프로젝트 조회 결과로 확인하지 못했다.

## 계속 업데이트하는 규칙

코드 변경이나 운영 장애를 다룰 때마다 이 파일의 상단에 최신 확인일을 갱신하고, 표의 기존 항목을 실제 근거에 맞게 업데이트한다. 새 오류/개선은 다음 형식으로 `변경 기록` 아래에 추가한다.

### 항목 템플릿

```text
### YYYY-MM-DD — 짧은 제목
- 증상/요구:
- 확인 근거: 파일·커밋·로그·화면 등
- 원인: 확인된 경우만 기재; 미확인이면 명시
- 변경:
- 검증: 실행한 명령/수동 확인과 결과
- 배포: 미배포 / 배포 ID·URL·상태 / 운영 확인 결과
- 후속 확인:
```

## 변경 기록

### 2026-10-28 — Seed v5.4 PC Work handoff and real browser verification
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/40530146532 ; tested source 660bbdc44d0a3c4fb19e297b472befa963ee9c20.
- 확인: 정적 64모듈·API/DB/템플릿 9묶음·QA 도구 검사, 실제 doctor 2단계·공지 포함 전체 18단계 모두 통과. pageErrors 0, 실제 PNG 19개·원본 trace 7개. Chrome 155.0.8059.39 / Playwright 1.62.1 / Node 24.21.0.
- 증거: 검토본 12745094573 ZIP 체크섬·무결성·경로 검사 및 공지/공보 입력 화면 확인. 원본 12746990375에 trace 보존. 상세 기록 seed-market/docs/QA_IDEA_SHARING_V5_4.md.
- 인계: 사용자의 PC Work 요청에 따라 v5.4 소스 ZIP·전문 프롬프트·실행 가이드·파일 manifest 제공. 실제 호스팅 ID는 QA 사본에서 제거하고 비밀·DB·업로드·캐시·비공개 아이디어 자료 제외. 추출 사본에서도 정적/9묶음/QA 도구 통과. Work 자체 재검증은 미실행이며 GitHub 통과와 구분.
- 변경: 이번 후속 커밋은 문서·검증 기록만 갱신, 검사한 앱·테스트 코드는 동일.
- 배포: QA 브랜치만 갱신. 서비스·원격 DB 미배포, Blogger 운영·main·중지된 자동화 변경 없음.


### 2026-10-28 — Seed v5.4 idea-sharing notices and nonblocking patent references
- 요구: 10/27 사용자 결정으로 특허 유사성/미확인을 거래 차단에 쓰지 않고 참고 문헌으로 안내. 열람료로 구체적인 기획 자료를 검토하는 공유소의 목적과 판매/구매 공지를 반영. 10/28 PC Work 검증 ZIP·프롬프트·가이드 요청.
- 원인/근거: v5.3에는 권리 확인·전문가 상태를 승인/구매 조건으로 삼는 로직이 존재. 플랫폼 목적과 일치하도록 사용자가 정책 변경을 지시함.
- 변경: seed-market/ 특허 정보/기록 선택 입력·모든 참고 상태 승인/구매 허용, 공개/등록공보 구분·현재 존속 미검증·원문/확인일·주문 고정 기록, 공통 공지·새 동의 전문/버전, 사이트 내 단독 이용 조건, PC Work 인계 문서. 일반 자료 심사·원장·동시 변경·접근 제어 보존.
- 검증: 로컬 정적 64모듈·API/DB/템플릿 9묶음·QA 도구 검사 통과. 공지 포함 18단계 원격 실제 화면 검사는 이 커밋에서 실행 후 기록.
- 법률 문구: 약관규제법 6/7조·전자상거래법 17/35조 공식 원문 확인. 권리/성과 미보증과 법정 책임·소비자 권리 보존 구분. 전면 면책/계약 전체 무효/일괄 환불 불가로 작성하지 않음.
- 배포: 허용된 QA 브랜치만 반영. 서비스·원격 DB·Blogger 운영·main·중지된 자동화 변경 없음. Work 인계 사본은 호스팅 ID 제거·비밀/사용자 자료 제외 후 제공 예정.


### 2026-10-22 — Seed v5.3 rights review verified in real browser
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39748164227 ; tested source 548baefbc34915573f1f9c05aa3887dbe8742f45.
- 확인: 정적 62모듈·API/SQLite/템플릿 9묶음·QA 도구 검사, 실제 doctor 2단계·이용 흐름 17단계 모두 통과. 새 권리 신고·별도 동의·심사 없는 승인 거부·공개/결제 고지·주문 당시 안내 포함. pageErrors 0. 의도된 응답 유실/400/외부 자원 차단 메시지는 기록 유지.
- 증거: 실제 PNG 18개·원본 trace 7개. 원본 12412656251(35,426,688 bytes)은 GitHub 보존, 작은 검토본 12412621308(12,535,953 bytes)을 내려받아 SHA-256/ZIP 무결성/경로 검사 및 실제 화면 확인. 자세한 기록 seed-market/docs/QA_PATENT_V5_3.md.
- 변경: 검증/특허 운영 문서와 이력만 갱신. 검사한 앱·테스트 소스는 변경하지 않음.
- 한계: 수동 자료 대조. KIPRIS 자동 조회·변리사 법률 판단·실제 OAuth/PG/권리 이전·실물 휴대폰 검증 아님.
- 배포: QA 브랜치만 갱신. 서비스·원격 DB 미배포, Blogger 운영·main·중지된 자동화 변경 없음.


### 2026-10-22 — Seed QA Korean font download
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39747369688 (aa7e640931dd1127108950f022d100dec2514edd). 한글 글꼴 다운로드 3분 시간 초과로 앱/브라우저 검사는 실행 전 중단.
- 원인: Ubuntu 미러에서 61.2MB fonts-noto-cjk 다운로드가 완료되지 않음. 기능 오류/성공으로 판정하지 않음.
- 변경: QA 워크플로에서 공식 Noto CJK 고정 커밋의 4.6MB 한국어 폰트와 라이선스를 제한 시간 내 받고 Git blob SHA를 대조. 글꼴 존재 검사 유지. 전체 증거 외에 작은 스크린샷/결과 아티팩트도 보존.
- 검증: YAML/포함 shell 구문, 정적 62모듈, QA 도구 검사 통과. 후속 실제 검사로 확인.
- 배포: QA 브랜치만 반영, 앱 기능 소스·서비스/DB·Blogger 운영·main·예약 중단 상태 변경 없음.


### 2026-10-22 — Seed v5.3 patent rights review workflow
- 요구: 판매 등록에서 특허권 관련 검토가 가능하도록 시스템 반영.
- 근거/원인: 기존 Seed 소스에는 일반 창작·품질 심사만 있고 특허 현황·거래 권한·등록 가능성·침해 검토의 구분과 주문 당시 특허 안내 기록이 없었음.
- 변경: seed-market/에서 판매자 신고·별도 동의, 운영자 자료 대조 및 보완/전문가 상태 승인 차단, 구매 전 고지·안내 버전 검사·주문 고정 기록·비공개 권리 자료 격리, DB 버전/CAS 검사. 새 스키마·특허 통합 검사·17단계 실제 브라우저 시나리오·공식 근거 문서 포함.
- 검증: 로컬 정적 62모듈·API/DB/템플릿 9묶음·QA 도구 검사 통과. 이번 커밋에서 GitHub 실제 브라우저 전체 재실행 후 결과 기록. 이전 v5.2.0 성공을 새 기능의 검증으로 간주하지 않음.
- 범위: KIPRIS는 공식 검색·수동 대조와 서버 키 준비 상태만 제공. 자동 조회·전문가 법률 판단·실제 권리 이전은 미연결.
- 배포: 허용된 codex/seed-market-qa 브랜치 소스만 반영. 서비스·원격 DB·Blogger 운영·main·중지된 자동화 변경 없음.


### 2026-10-22 — Seed real browser QA 17/17 passed
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39740383010; tested source e6d9b15c67359f27dd814d3b2661992ef9145042.
- 확인: GitHub doctor와 전체 17단계 모두 성공. 정적 57모듈·서버/API/DB/템플릿 8묶음·QA 도구 검사 성공. 실제 스크린샷 17개·trace 7개, pageErrors 0. 아티팩트 12408349474 ZIP 체크섬 및 무결성 확인.
- 수정 결과: 거래/문의/나눔 버튼 선택 범위, 모바일 필터 열기 순서와 한글 캡처 환경 보완을 실제 재실행으로 검증. 서비스 거래·가격·권한 로직 변경 없음.
- 변경: seed-market 검증/운영 문서·README와 이 이력만 갱신. 검사한 소스 커밋과 증거를 보존하며 이번 후속 커밋은 문서만 변경.
- 한계: 390x844 모바일 에뮬레이션. 실물 휴대폰·실제 OAuth·PG·송금·법적 권리 이전은 별도이며 미검증.
- 배포: 서비스 미배포. QA 브랜치만 갱신, Blogger 운영·main·중지된 예약 자동화 변경 없음. QA-ENV-001은 GitHub에서 해결됐으며 Work/Codex 자체 제한은 별도.


### 2026-10-22 — Seed mobile filter journey
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39739631872; source 757e852e790334b7a83855d71661d5b96ffd3405. doctor·16/17단계 통과, 나눔/의견/운영 통계까지 실제 UI 확인.
- 원인: 마지막 모바일 검사에서 닫힌 상세 필터의 선택 항목을 바로 조작하려 해 대기 종료. 접힌 필터는 정상 UI임.
- 변경: 실제 summary 클릭으로 필터를 열고 종류 선택·서버 응답·카드 로딩 뒤 다음 동작. 강제 클릭·검사 생략 없음.
- 검증: 정적 검사 통과. 새 Actions에서 전체 17단계 결과 확인.
- 배포: QA 브랜치 도구 보완만 수행. 서비스 배포·기존 Blogger·main·예약 중단 상태 변경 없음.


### 2026-10-22 — Seed sharing toolbar selection
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39738990201; source 673546b1fc869f13f88d2ebf3abac1167b2e0e3e. doctor·한글 글꼴 준비·11/17단계 통과.
- 원인: 정상적으로 닫힌 모달의 share-mine 버튼이 DOM에 남아 전역 선택자가 목록 버튼과 함께 두 개를 찾음. trace와 실패 HTML로 확인.
- 변경: 나눔 목록 이동 선택자를 #sharing으로 한정. 실제 캡처에서 한글 표시도 확인. 서비스 로직 변경 없음.
- 검증: 로컬 정적 검사 통과. 다음 Actions에서 나눔 검토·금액 의견·모바일까지 후속 확인.
- 배포: QA 브랜치만 갱신, 서비스 배포 없음. 기존 Blogger·main·중지된 예약 자동화 유지.


### 2026-10-22 — Seed support selector and Korean QA fonts
- 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39738321563; source 4308200cdbc2616ddbc4d7a649130183086a0916. doctor·8/17단계 통과, 거래 확인 수정 검증.
- 원인: 문의 action이 푸터와 계정 모달에 중복되어 러너가 선택 실패. 실제 캡처에는 한글 글꼴 누락도 확인.
- 변경: 문의 버튼은 모달 범위로 한정하고 CI에서 한국어 글꼴을 확인/준비. 첫 원격 검사의 실제 결과와 후속 조건을 앱 문서에 기록.
- 검증: 로컬 소스 검사 통과. 수정 후 실제 UI 결과와 한글 캡처는 새 Actions 실행에서 확인.
- 배포: QA 브랜치만 갱신. 기존 Blogger·main·운영 배포·중지된 예약 자동화 변경 없음.


### 2026-10-22 — Seed browser runner receipt selection
- 증상/요구: 사용자가 QA 워크플로를 등록해 실제 판매자·구매자 검증을 요청함.
- 확인 근거: https://github.com/noriplaystudio-debug/blogger/actions/runs/39735641576; source de09435bb52680ae446815b3c0ccfb4dd776b9d6. doctor 통과, 거래 흐름 7/17 통과, 8단계 strict mode 실패.
- 원인: 보관함의 그림과 거래 확인 버튼이 같은 주문 ID/action을 가져 러너가 두 버튼을 선택함. 제품 결함으로 판정하지 않음.
- 변경: seed-market/tests/browser.test.mjs 거래 확인을 패널·주문 ID·버튼 이름으로 한정. 전용 워크플로는 등록된 QA 소스 커밋을 직접 검사하는 일반 CI로 전환. 앱 검증/이력 문서 갱신.
- 검증: 로컬 57개 모듈·서버/API/DB/템플릿 8묶음·QA 도구 검사 통과. 수정 후 브라우저 전체 결과는 새 Actions 실행에서 확인.
- 배포: 사이트 미배포. 기존 Blogger 코드·main·운영 배포·예약 중단 상태는 유지.


### 2026-10-22 — Seed market QA source bootstrap
- 증상/요구: 사용자가 blogger 저장소에서 아이디어 마켓 자동 검증을 요청함.
- 확인 근거: Seed QA source snapshot 498614f1c438b0bdaafd76f274ff2ba1d17c179930415d18acc9ed9a299a0add; https://github.com/noriplaystudio-debug/blogger/actions/runs/39735641576
- 원인: 기존 Work는 브라우저 실행 전 차단됐으며 연결 도구의 파일 쓰기는 완료 확인을 받지 못함. 제품 결함은 아직 미확인.
- 변경: seed-market/ 소스를 QA 브랜치에만 등록. 기존 Blogger 앱·main·운영 데이터·예약 중단 상태 유지.
- 검증: 체크섬과 허용 파일 경로 확인. 실제 API·브라우저 결과는 위 Actions 실행에서 후속 확인.
- 배포: Blogger 운영 배포는 수행하지 않음.
- 후속 확인: doctor와 17단계 UI 결과·스크린샷·trace를 확인하기 전 QA-ENV-001을 닫지 않음.


### 2026-10-01 — 예약 자동화 유지보수 일시 중단
- 증상/요구: 반복적인 작성·근거·형식 오류로 게시 성공률이 낮고 API 호출 비용이 누적되어, 오류를 충분히 개선하기 전까지 자동 등록과 예약 실행을 중단하기로 함.
- 확인 근거: 중단 직전 Production health에서 `published=0`, `working=0`, `needs_review=3`, `source_blocked=10`, `errors=15`를 확인했고 최근 worker 오류에 1,500자 미만, 필수 내용 누락, 출처 확보 실패, 제목 누락 등이 남아 있었음.
- 원인: 단일 원인이 아니라 작성 길이/필수 내용/근거 연결/제목·구조 생성 실패가 복합적으로 남아 있어 반복 재시도가 비용 대비 성공률을 낮추는 상태.
- 변경: `vercel.json`에서 모든 Vercel Cron 일정을 제거하고, `lib/cron.ts`의 공통 Cron 진입점에 `AUTOMATION_MAINTENANCE_PAUSED=true` 차단을 추가해 실수 또는 외부 호출로도 예약 작업이 AI 호출을 시작하지 못하게 함. health 응답에 `maintenancePaused`를 노출하고 README에 유지보수 중단 상태를 문서화함. 대기 작업·기존 원고·진단 데이터는 삭제하지 않음.
- 검증: 회귀 검증 스크립트를 유지보수 모드에서도 통과하도록 갱신했고, Production health에서 `automation.maintenancePaused=true` 확인.
- 배포: GitHub `main` 최신 누적 커밋 `b2bea8ad5afdbde55ae646b956ee45b1c1e65479`, Vercel Production `dpl_ERJezf32UA11ZRG7v3xrFBEhegfe` = READY. 운영 주소 `https://google-blogger-agent-final-v26.vercel.app`.
- 후속 확인: 예약 자동화는 다시 켜지 않는다. 먼저 최근 실패 유형을 분리해 회귀 테스트를 추가하고, 비용이 통제된 단건 수동 테스트로 조사→작성→부분수정→검수→Blogger 저장/공개 전체 흐름의 성공을 확인한 뒤 사용자 승인 후 재개한다.

### 2026-10-01 — 상시형 검색 수요·API 비용 보호 개선
- 증상/요구: 사용자가 API 잔액을 충전한 뒤에도 높은 비용과 과거 반복 오류를 우려. 단발성 스포츠·연예·사회 이슈 대신 최근 한 달 관심 신호와 반복 검색 수요에 기반한 정보형 블로그 계획 요청.
- 확인 근거: 현재 체크아웃 `lib/planning.ts`, `lib/production.ts`, 일일 cron/worker 코드, 2026-10-01 02:14 KST Production health. 당시 최근 worker 오류는 Anthropic 잔액 부족이었고 이전 기록에는 OpenAI 잔액 부족이 있었다. health의 `aiCostWon`은 설정 단가 기반 추정 ledger로 실제 공급자 청구액이 아니다.
- 원인: 계획 프롬프트가 스포츠·연예·사회 실시간 이슈를 허용했고 카테고리 단계에서 상시형/실시간형을 섞을 수 있었다. 기본 주간 계획에서 최종 수량보다 많은 후보를 키워드 조사해 검색 API 호출을 늘릴 수 있었다. 일일 cron은 공통 공급자 실패를 알기 전 작업자를 병렬 호출했다. 당일 후속 cron이 잔여 작업을 다시 실행할 수도 있었다. 앱은 공급자 실청구/토큰 사용량을 읽지 않는다.
- 변경: 신규 계획은 evergreen 정보·설명·문제 해결형만 생성하고 최근 30일 공개 신호와 12개월 반복성을 사용한다. 정확한 월 검색량은 Google Ads/Naver 광고 도구가 제공하지 않는 한 null 처리하며, 수치 조작을 금지한다. 단계별 출력·검색 후보 수를 줄였고, 상시 계획은 요청한 카테고리 수까지만 키워드 조사해 불필요한 추가 검색 단계를 줄인다. 저신뢰도 점수 하나만으로 주제를 버리지 않고 실제 관심 신호 URL 부재만 키워드 계획 탈락 사유로 삼는다. 일일 worker는 첫 결과를 확인하고 공통 오류면 나머지 작업을 대기 상태로 돌리며, 같은 날 후속 cron에서 추가 API 호출을 막는다. health에서 활성 작성·검수·조사 모델과 추정 비용 기준을 식별할 수 있게 했다. 화면과 README에 실청구액과 추정 ledger를 명확히 구분했다. README의 실시간 배분·다중 출처 필수 문구도 실제 동작/새 요구에 맞게 정정했다.
- 검증: `npm run check` 통과(자동화 요구 20/20, API 계약 검사, 글 생성 복구 검사, Next.js production build 및 타입 검사). API 생성/게시 호출은 청구와 공개 게시를 일으킬 수 있어 수행하지 않았다.
- 배포: GitHub `main` 커밋 `4ca99f45e346959f52d03edc72ab0044a9f07378`; Vercel Production `dpl_7JNCqnmgT4adhwnBadV9pffPQwkA`, `READY` — https://google-blogger-agent-final-v26.vercel.app.
- 운영 확인: 2026-10-01 02:44 KST health 응답 200. 자동화/자동공개 활성, 일 7건, Blogger 보호 우회 설정 확인. 현재 저장 계획은 카테고리 5개·키워드 25개·주간 용량 50/목표49. 미처리 대기30, 진행0, 준비0, 출처차단6, 과거 오류14, 발행0. 최근 일일 run은 충전 전에 난 7/7 Anthropic 잔액 오류로 실패 상태였으며, 신규 circuit-breaker 실행은 아직 발생하지 않아 충전이 반영됐는지는 확인되지 않았다.
- 후속 확인: 사용자 충전 사실은 전달받았지만 공급자 잔액/청구 계정은 이 세션에서 조회할 수 없다. 자동 게시를 유발할 수 있는 생성·일일 실행 테스트는 호출하지 않았다. 다음 예약 실행에서 첫 작업 결과, 후속 보류 여부, 게시 상태를 확인해야 한다. 실제 API 비용은 OpenAI/Anthropic 사용량 페이지에서 대조해야 한다.

### 2026-10-01 — 충전 후 일일 자동화 재실행 확인
- 증상/요구: 사용자가 OpenAI API 잔액 충전 후 자동화를 이어서 진행하고, 오류 반복이 비용 증가의 원인인지 확인 요청.
- 확인 근거: Vercel Production `/api/automation/health`를 충전 전후 조회했고, Vercel Cron Jobs 화면에서 `/api/cron/daily`를 한 차례 실행했다. 실행 전 운영 상태는 게시 0, 작업 중 0, 대기 32였으며, 설정은 자동 게시 켜짐·일 7건이었다. 실행 후 7건이 모두 `error`, `published=0`, `working=0`으로 끝났다. 최신 7건의 worker 오류는 Anthropic API 잔액 부족 응답이며, 앞선 실행 이력에는 OpenAI 잔액 부족 응답도 남아 있다.
- 원인: OpenAI 크레딧 충전은 확인할 수 없고, 앱이 실제 사용하는 계정/키의 충전 반영 여부도 이 세션에서 직접 조회할 수 없다. 다만 최신 작업은 Anthropic API 잔액 부족으로 실패했으므로 OpenAI 충전만으로 현재 작성 요청의 문제는 해결되지 않았다. 게시 실패는 확인됐으며 공개 글은 생성되지 않았다.
- 변경: 코드 변경 없음. 운영 일일 실행을 1회 재시도해 원인을 좁힘.
- 검증: 재실행 전후 헬스 조회. 전후 계측 비용 ledger는 7,000원 예상 예약으로 기록되었으며 실제 공급자 청구액은 아님. 실행은 7/7 실패, 게시 0건.
- 비용 판단: 반복 조사·작성·검수 재시도는 공급자 API 호출을 늘려 실제 비용을 만들 수 있다. 기존 대시보드의 `aiCostWon`은 작업별 설정 단가를 곱한 추정 ledger여서 실제 청구 내역과 대조하지 않고 오류 반복에 귀속할 수 없다. 이번 재실행은 7,000원 추정값을 기록했지만 7건 모두 공급자 잔액 오류로 실패했다.
- 배포: 기존 production 배포 유지; 이번 점검에서는 배포하지 않음.
- 후속 확인: 앱 설정에서 작성·검수 모델 제공자가 실제로 어떤지 확인해야 한다. Anthropic 모델을 유지하려면 해당 Anthropic 계정에 크레딧이 필요하고, OpenAI로 운영할 계획이면 설정의 작성·검수 모델을 OpenAI 계열로 선택한 뒤 올바른 OpenAI API 조직/키를 확인해야 재실행한다.

### 2026-09-30 — 과거 이력 기준 문서화
- 증상/요구: 과거 프로젝트 채팅에서 정한 요구와 오류·개선 이력이 후속 코드 작업에서 누락될 우려.
- 확인 근거: 현재 프로젝트 대화에 전달된 이전 작업 요약, `README.md`, `EVIDENCE_BENCHMARK.md`, 현재 코드 검색, Git 최근 커밋.
- 원인: 대화 원문을 매번 전부 다시 확인하는 것을 전제할 수 없고, README 일부가 코드보다 오래됨.
- 변경: 이력 문서와 저장소 작업 지침 추가. 증거 상태 구분 및 매 작업 후 갱신 규칙 명시.
- 검증: 현재 코드에서 단일 출처 기준·cron/worker 경로·JSON 복구 흔적 확인. README의 출처 기준 불일치 확인.
- 배포: 문서 변경만 수행; 아직 커밋/배포하지 않음.
- 후속 확인: 실제 Vercel 배포의 daily cron·환경변수·실행 로그와 Blogger 연결/게시 결과를 대조하고 README 구형 근거 규칙 수정.

### 2026-09-30 — 오전 9시 자동 게시 미완료 확인
- 증상/요구: 오늘 오전 9시 자동 게시가 정상 진행됐는지 확인.
- 확인 근거: Vercel Production `/api/automation/health` 응답(2026-09-30 13:34 KST), 2026-09-30 00:00–04:30 UTC Vercel runtime log 검색, `vercel.json`, `/api/cron/daily` 구현.
- 원인: 오늘의 실패 원인은 아직 확정하지 못했다. 운영 상태에는 작업 7건 stale, 최근 worker 20건 failed, 최신 daily run의 processed/successful 0건이 보인다. 오전 9시 Cron invocation 로그도 찾지 못했다. 별도로 예약 대상을 불러오지 못한 원인과 worker 실패 원인을 분리해 추가 진단해야 한다.
- 변경: 코드 변경 없음. 실제 운영 결과와 확인 한계를 이력에 기록.
- 검증: health 응답에서 autoPublish=true, 일일 목표 7, 최신 실행 10:25 KST status=success이나 processed=0/successful=0, operational working=7/stale_working=7, 최근 publication activity는 9월 27일 draft_created 확인. 따라서 오늘 공개 발행 0건으로 판정.
- 배포: 변경 없음; 현재 production deployment READY이며 health endpoint 응답 정상.
- 후속 확인: `/api/automation/status`는 인증으로 막혀 있어 크론 준비상태 상세와 작업별 오류를 확인하지 못했다. 사용자 운영 세션에서 작업 큐·실패 사유·Blogger 실제 게시글을 대조하고, Vercel Cron 실행 기록이 계속 없으면 Cron 설정/프로젝트 대상 환경을 조사한다.

### 2026-09-30 — 일일 worker 호출 및 성공 상태 오판 수정
- 증상/요구: 주간 계획은 생성되어 있는데 일일 자동화가 글을 게시하지 않는 정확한 원인을 찾아 해결.
- 확인 근거: Production health에서 `working=7`, `stale_working=7`, daily run `success`/처리 0건; `app/api/cron/daily/route.ts`는 작업을 먼저 `working`으로 선점하고 내부 POST의 HTTP 응답을 무시했으며, worker 호출 전 daily run을 `success`로 종료함. Vercel 프로젝트 설정은 SSO 보호를 모든 비커스텀 도메인에 적용하고, worker 호출은 보호된 `vercel.app` origin으로 우회 헤더 없이 전송함. 따라서 보호 화면의 redirect/거부 응답이 작업자에게 도달하지 않아도 감지되지 않고 작업은 stale로 남을 수 있는 구조임. 개별 요청의 과거 응답 로그가 없어 실제로 차단된 응답 본문을 과거 시점까지 복원할 수는 없지만, 보호 설정과 구현 결함이 관측된 stale 작업 및 허위 성공 표기를 설명함.
- 원인: 보호된 배포 URL로 보내는 내부 worker 요청에 `VERCEL_AUTOMATION_BYPASS_SECRET`의 `x-vercel-protection-bypass` 헤더를 포함하지 않았고, HTTP redirect/비 JSON/거부 응답을 검사하지 않아 전달 실패를 성공처럼 삼켰다. 동시에 run 상태를 비동기 worker dispatch가 끝나기 전에 성공으로 기록했다.
- 변경: dispatcher가 `VERCEL_AUTOMATION_BYPASS_SECRET`을 `x-vercel-protection-bypass` 헤더로 보내고 redirect/non-JSON/거부 응답을 판별하도록 수정. 전달 실패 작업은 대기 상태로 반환. daily run은 비동기 worker 호출이 끝난 뒤 닫도록 이동. 헬스 응답에 큐·전달·실패 수치와 우회키 설정 여부(값 미노출)를 추가. worker HTTP 500/503을 성공 디스패치로만 집계하지 않고 시스템 오류/상태별로 보고하도록 추가 보완.
- 검증: `npm run check` 통과(19/19 자동화 요구, API 계약/resilience, Next.js production build 및 타입 검사). 승인 후 Vercel Deployment Protection에 자동화 우회키를 생성해 시스템 환경변수로 지정하고 Production을 재배포; 헬스 응답에서 `workerBypassConfigured=true` 확인. Vercel Cron 화면에서 `/api/cron/daily`를 1회 실행했고 runtime logs에 daily 200 및 worker 7건 도달 확인. 이 worker 7건은 모두 `503`으로 응답했고 Production health에서 `working=0`, `errors=12`(기존 5 + 신규 7), 공개 게시 0건을 확인.
- 추가 원인: 보호 차단은 해결됐지만 실제 작성 호출이 OpenAI `429 You have no credits remaining`로 7건 모두 실패했다. 따라서 현재 게시를 막는 직접 운영 조건은 OpenAI API 크레딧 잔액 부족이다. 크레딧을 추가하거나 이미 연결된 다른 공급자 모델로 설정하기 전까지 production 자동 재실행은 결과를 바꾸지 않는다.
- 배포: GitHub `main` `5677b065057f66cba79a316fc0916efb89ef69a3`의 배포 `dpl_GFkuk7ND1vk8CQgN3g4rExQpq3uL`에서 worker 호출과 배포 보호 설정을 운영 검증. 실패 상태 기록 보완 커밋 `305951f60d2d439c05627b6a54f59d1dad889907`의 Production 배포 `dpl_EKALHRw7p6LpyQZxRkdJmieY8NAu`도 `READY`.
- 후속 확인: 사용자가 OpenAI API 계정에 크레딧을 충전하거나 다른 크레딧이 있는 공급자 모델로 전환한 뒤 재실행한다. 반복 실패를 피하려고 현재는 일일 작업을 추가 수동 실행하지 않는다. 이후 daily run은 503/systemic worker 실패를 `success`로 기록하지 않도록 수정됐다.
