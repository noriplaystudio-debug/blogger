# 실제 브라우저 검증 · QA-ENV-001

2026-10-21 보고서 반영 · v5.0.3 · **이슈 미해결, 실제 화면 통과 0개**

Work 보고서의 v5.0.1 검사에서는 서버가 실행됐지만 computer-use 브라우저가 `ERR_CONNECTION_REFUSED`로 접속하지 못했습니다. 브라우저와 셸의 네트워크가 분리됐다는 설명은 가설입니다. Playwright도 Chromium 실행 파일이 없어 중단됐습니다. 재현된 제품 오류는 없었습니다.

v5.0.2 재검증에서는 서버 준비가 통과했지만 Chromium 다운로드의 ZIP 서명 오류와 도구 실행 중단으로 설치를 완료하지 못했습니다. `setup-result.json`도 생성되지 않았습니다. 제품 화면이나 거래 동작을 추측으로 수정하지 않았습니다.

v5.0.3은 중단 기록과 아카이브 오류 진단을 보완하고 [브라우저 포함 이미지 실행 경로](QA_CONTAINER.md)를 추가합니다. **다운로드 실패가 반복되는 환경은 먼저 해당 문서의 실행 조건을 확인합니다.** 이곳에서는 Docker 접속도 차단돼 이미지 빌드·브라우저 실행을 검증하지 못했습니다. 실행 도구 준비를 QA-ENV-001 해결이나 화면 검사 통과로 취급하지 않습니다.

## 같은 실행 환경에서 시작

Node.js 22.13 이상이 필요합니다. ZIP의 `seed-market/`에서 차례대로 실행합니다.

```sh
npm run qa:prepare
npm run qa:doctor
npm run test:browser
```

각 명령의 종료 코드를 확인하고 다음 단계로 넘어갑니다. `qa:doctor`가 통과해야 전체 화면 검사에 진행합니다. 앱 서버를 별도로 띄울 필요가 없습니다. doctor와 전체 러너가 **자신의 Node 프로세스와 같은 실행 환경에서** Playwright 및 테스트 서버를 시작하고 종료합니다. 셸의 localhost를 다른 환경의 computer-use 브라우저에 전달하는 방식은 사용하지 않습니다.

`qa:prepare`는 `tools/browser-qa/package.json`의 **Playwright 1.62.1**만 설치합니다. 웹앱 전체 의존성은 설치하지 않습니다. 같은 버전 CLI로 정식 Chromium을 내려받고, 드라이버가 제공하는 실행 파일 경로를 명시적으로 사용합니다. 별도 headless-shell 캐시에 의존하지 않습니다. npm 캐시와 Chromium은 `.sites-runtime/browser-tools/`에 보관하며 배포·인계 ZIP에서 제외합니다. 설치는 네트워크 및 설치 권한이 필요하며 실패하면 `blocked`입니다.

설치 명령을 시작하기 전에 `.sites-runtime/browser-qa/setup-*/result.json`과 최신 `setup-result.json`을 저장합니다. 단계·출력은 원자적 교체와 실행별 `setup.log`로 남깁니다. `SIGINT`·`SIGTERM`을 처리하면 `QA_SETUP_INTERRUPTED`를 기록합니다. **SIGKILL·도구 강제 중단·머신 소실에서는 최종 기록을 보장할 수 없습니다.** 이미 저장한 `running`과 마지막 단계가 남으며 이를 설치 완료로 판정하지 않습니다.

Chromium ZIP 서명·잘림 오류가 나오면 `CHROMIUM_ARCHIVE_INVALID`를 남기고 설치 자식 프로세스를 중단합니다. `0 MiB` 문자열만으로 손상 원인을 단정하지 않습니다. 이미 공식 Chromium이 준비된 환경에서는 `qa:prepare -- --offline`으로 네트워크 설치 없이 파일·버전만 확인할 수 있습니다.

Chromium 시스템 라이브러리가 없으면 브라우저가 준비된 실행 이미지를 사용합니다. 시스템 패키지 설치를 허용하는 환경에서는 다음 명령도 제공하지만, 기본 준비 명령은 시스템 패키지를 설치하지 않습니다.

```sh
npm run qa:prepare -- --with-deps
```

기존에 제공된 도구를 사용할 때는 `SEED_PLAYWRIGHT_PATH`에 **고정 버전 Playwright의 index.mjs**, `SEED_BROWSER_EXECUTABLE`에 실행 가능한 Chromium 경로를 지정할 수 있습니다. 지정 경로가 잘못됐을 때 다른 모듈로 조용히 대체하지 않습니다. 자동으로 임의의 시스템 Chromium을 고르지 않습니다. 선택된 모듈·버전·실행 파일은 결과에 기록합니다. `PLAYWRIGHT_BROWSERS_PATH`를 지정하면 설치와 실행 모두 같은 경로를 사용해야 합니다. 비어 있는 테스트 포트는 `SEED_BROWSER_PORT`로 지정합니다(기본 4189).

## 사전 진단의 범위

`qa:doctor`는 다음 사실을 실제 실행으로 확인합니다.

1. Node 버전, 고정 Playwright 버전과 Chromium 실행 파일.
2. Chromium 실제 실행.
3. 새 격리 DB·이미지를 사용하는 자체 서버 시작과 `/api/config`의 테스트 결제·개발 모드. 이미 실행 중인 다른 서버에는 연결하지 않습니다.
4. **브라우저에서** 홈 HTTP 응답, 실제 아이디어 카드 표시, 모바일 크기에서 메뉴 클릭.
5. 홈·메뉴 스크린샷과 Playwright trace 저장.

Chromium이 없어도 독립적인 서버 시작 문제는 함께 진단합니다. 이 검사가 통과하더라도 가입·구매·환불은 검증한 것이 아니며 결과에 `businessScenariosVerified: false`를 남깁니다.

| 코드 | 다음 조치 |
|---|---|
| `PLAYWRIGHT_MISSING` / `PLAYWRIGHT_VERSION_MISMATCH` | `qa:prepare`로 고정 버전 도구 설치 또는 지정 경로 수정 |
| `BROWSER_BINARY_MISSING` | 같은 환경에서 `qa:prepare`, 설치와 실행의 캐시 경로 확인 |
| `BROWSER_SYSTEM_DEPENDENCIES_MISSING` | 브라우저 실행 이미지 또는 허용된 시스템 라이브러리 설치 |
| `BROWSER_EXECUTION_DENIED` / `SERVER_BIND_DENIED` | Chromium·루프백 서버 실행을 허용하는 환경 사용 |
| `SERVER_PROCESS_EXITED_WITHOUT_LOG` | 자식 프로세스 종료 코드 확인, 격리 설정으로 서버 직접 실행해 출력 비교 |
| `SERVER_PORT_IN_USE` | 비어 있는 `SEED_BROWSER_PORT` 사용 |
| `BROWSER_APP_UNREACHABLE` | 서버와 브라우저가 같은 실행 환경인지 확인 |
| `QA_INSTALL_ACCESS_DENIED` / `QA_INSTALL_FAILED` | 설치 결과의 네트워크·프록시·인증서·쓰기 권한 오류 확인 |
| `CHROMIUM_ARCHIVE_INVALID` | 설치 중단·로그 보존 후 사전 설치 이미지 또는 유효한 공식 캐시 사용 |
| `QA_SETUP_INTERRUPTED` | 중단 신호와 마지막 단계 확인. 완료·통과로 취급하지 않음 |

환경 진단에 실패하면 실행 정책을 우회하거나 개발 로그인 보호를 풀지 않습니다. 지원되는 실행 환경과 오류 근거를 보고합니다. 셸 서버 정상만으로 브라우저 연결 성공을 판정하지 않습니다.

## 실제 화면 전체 시나리오

`test:browser`는 실제 Chromium → 실제 루프백 HTTP → standalone API → 격리 SQLite·파일 저장소를 사용합니다. API 응답을 가짜 자료로 대체하지 않습니다. 등록·구매·검토·문의 변경은 화면을 통해 실행하고 직접 HTTP 조회는 결과 확인에만 사용합니다.

1. 판매자 새 가입, 역할 유지, 가입 전 등록 작업 복귀.
2. 필수 항목 오류, 종류·세부 유형·관련 분야, 공개·비공개 이미지, 중복 선택, 작성 중 닫기·복원.
3. 열람료·추가 사용료·예상 정산액, 동의, 업로드·검토 요청과 비공개 상태.
4. 운영 반려, 판매자 본문·기존 이미지 수정, 재검토와 승인.
5. 구매자 검색·무료 요약, 새 구매자 가입과 구매 작업 복귀.
6. 열람권 구매·상세 본문·이미지 실제 로딩, 구매자 B도 열람.
7. 독점 사용권 구매 응답을 한 번 유실시켜 재시도·주문 중복 방지 확인.
8. 다른 유료 열람자의 화면·상세 권한 회수, 거래 기록과 문의.
9. 판매자 답변, 운영 테스트 환불, 구매자 환불 기록.
10. 판매자 정산 대기 중 요청 차단과 미사용 이미지 관리.
11. 모바일 메뉴·탐색·상세창·가로 넘침·Escape 닫기.

이 러너는 모든 수동 검사나 실제 휴대폰을 대신하지 않습니다. 오래된 심사 버전, 빠른 중복 클릭, 새로고침·뒤로가기·세션 만료 등 추가 검사는 Work 보고서에서 실제 수행 여부를 별도로 적습니다. 자동화 14단계 성공만으로 모든 기기·오류 경로가 검증됐다고 표현하지 않습니다.

## 결과·격리·이슈 종료 기준

- 설치: `.sites-runtime/browser-qa/setup-*/result.json`과 `setup.log`, 최신은 `setup-result.json`.
- 진단: `.sites-runtime/browser-qa/doctor-*/result.json`, 최신은 `latest-doctor.json`.
- 전체 검사: `.sites-runtime/browser-qa/run-*/result.json`, 최신은 `latest-result.json`.
- 각 실행 폴더: 사용 가능한 스크린샷·역할별 trace·서버 로그. 실행 실패 전에 생성되지 않은 증거를 있다고 표시하지 않습니다.
- 종료 코드: 0 = 해당 명령 범위 성공, 1 = 화면 실행 중 실패, 2 = 환경 차단. 설치 성공은 파일 준비일 뿐입니다.

두 러너 모두 `.env.local`을 읽지 않고 테스트 결제를 강제하며 새 실행 폴더만 사용합니다. 기존 DB·이미지를 건드리지 않습니다. 개발 로그인은 루프백 전용이며 외부에 공개하지 않습니다. 실제 OAuth·PG 키나 실제 사용자 자료를 넣지 않습니다.

**QA-ENV-001 종료에는** 브라우저 홈 표시, 실제 화면 동작 최소 1개, `blocked`가 아닌 결과와 스크린샷/trace가 필요합니다. doctor 성공은 환경 문제 종료 근거이며 전체 거래 여정 완료는 별도 결과가 필요합니다. 이후 화면 실패는 별도 이슈 ID와 재현 절차·증거로 기록합니다.

이전 Codex 실행에서는 npm 네트워크 연결 `EPERM`, 시스템 Chromium 실행 `setsockopt: Operation not permitted`, 직접 standalone 실행 `listen EPERM`, 자식 서버의 출력 없는 종료가 관찰됐습니다. v5.0.2 Work 보고서에서는 서버 시작이 통과했습니다. 이번 v5.0.3에서는 Docker 소켓 연결이 차단됐고 오프라인 확인에서도 고정 Chromium이 없었습니다. 실제 화면은 아직 실행하지 못했으며 필요한 실행 조건을 갖춘 환경에서 재검증해야 합니다.


v5.1은 권장액 초과 안내를 기존 판매·구매 검사에 포함하고, 무료 나눔 작성·운영 보완/승인·무료 열람/숨김의 3단계를 추가합니다. 총 14단계이며 실제 실행 결과 없이 통과했다고 표현하지 않습니다.


v5.2의 현재 브라우저 러너는 총 17단계입니다. 가격 의견 저장·수정/중복 집계 방지·모바일 작성창, 운영 통계/CSV/의견 제외, 철회를 추가했습니다. 검사 소스 추가와 실제 실행 통과는 구분합니다.
