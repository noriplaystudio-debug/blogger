# GitHub Actions에서 실제 화면 검사 · v5.2.0

## 최종 확인 · 2026-10-22 · 실제 브라우저 17/17 통과

[https://github.com/noriplaystudio-debug/blogger/actions/runs/39740383010](https://github.com/noriplaystudio-debug/blogger/actions/runs/39740383010)에서 doctor와 전체 17단계가 모두 통과했다. 검사한 소스는 `e6d9b15c67359f27dd814d3b2661992ef9145042`이며 Node 24.21.0, Chrome 155.0.8059.84, Playwright 1.62.1을 사용했다. 한국어 글꼴을 준비해 실제 캡처의 한글 표시도 확인했다. 스크린샷 17개와 trace 7개를 내려받아 결과 JSON·ZIP 무결성·아티팩트 체크섬을 확인했다.

테스트 결제 모드의 판매자·구매자 A/B·운영자, 무료 나눔·금액 의견·운영 통계, 390×844 모바일 에뮬레이션을 검증했다. 실제 OAuth·실제 결제/송금·실물 휴대폰·360px 추가 검사·서비스 배포는 이 통과 범위에 포함하지 않는다. Work/Codex 자체 실행 제한은 남아 있지만 GitHub에서 실제 브라우저 검증을 수행할 경로가 확보됐다.

아래의 통과 전 기록은 당시 상태이며 이 후속 결과와 구분한다.

## 최신 상태 · 2026-10-22

사용자가 전용 워크플로를 업로드했고 [실행 39735641576](https://github.com/noriplaystudio-debug/blogger/actions/runs/39735641576)에서 소스 등록과 실제 브라우저 doctor가 통과했다. 전체 17단계 중 7단계 통과 후 러너의 거래 기록 선택자 중복으로 중단됐다. 해당 선택자를 보완했으며 [검사 증거와 재검증 조건](QA_ACTIONS_2026_10_22.md)에 기록했다.

소스 등록 이후에는 일반 워크플로 `ci/seed-market-qa.yml`을 저장소 루트 `.github/workflows/seed-market-qa.yml`로 사용한다. 수정 소스를 이전 embedded snapshot으로 덮어쓰지 않고, QA 브랜치에 push된 정확한 커밋을 검사한다. 아래 파일 쓰기 차단 설명은 최초 등록 전의 이력이다.

대상: 사용자가 지정한 `noriplaystudio-debug/blogger` 저장소의 `codex/seed-market-qa` 브랜치. 앱은 `seed-market/`, 전용 워크플로는 루트 `.github/workflows/seed-market-qa.yml`에 둡니다. Blogger의 기존 앱·운영 설정과 main 브랜치는 수정하지 않습니다.

GitHub가 제공하는 `ubuntu-24.04` 실행 환경에는 Chrome/Chromium이 사전 설치되어 있습니다. 워크플로는 실제 실행 파일을 확인해 명시적으로 선택하고 고정 Playwright 1.62.1 드라이버만 설치합니다. Docker, Chromium ZIP 설치, 별도 테스트 사이트 배포, 운영 인증키는 필요하지 않습니다. Node.js는 실행 이미지에서 제공되는 24.21.0을 지정합니다.

공식 근거: [Ubuntu 24.04 실행 이미지](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)의 Browsers and Drivers 및 Cached Tools 항목. 실행 이미지의 브라우저 버전은 바뀔 수 있으므로 실행 로그와 doctor 결과에 실제 버전을 남깁니다. action 버전은 공식 태그의 커밋 SHA를 조회해 고정했습니다.

워크플로는 해당 QA 브랜치의 앱/워크플로 변경 push 또는 수동 실행으로 시작합니다. checkout 자격 증명을 저장하지 않고 `contents: read`만 요청합니다. 운영 비밀값과 Blogger 앱의 API는 사용하지 않습니다.

1. Node·사전 설치 브라우저 확인, QA 드라이버만 설치.
2. 정적·서버/API·DB·템플릿·도구 회귀 검사.
3. 같은 실행 환경의 실제 브라우저와 격리 서버로 doctor 실행.
4. doctor 통과 시 판매자·구매자 A/B·운영자·모바일 전체 화면 검사.
5. 성공/실패에 관계없이 생성된 결과·스크린샷·trace·로그만 아티팩트로 7일 보관.

테스트 DB·원본 업로드·`.env.local`은 아티팩트에 포함하지 않습니다. 루프백 개발 로그인과 테스트 결제만 사용합니다. 앱의 네이버·카카오·구글 실계정 OAuth, 실제 PG, 실제 휴대폰은 이 검사 범위에 포함하지 않습니다.

원격 Actions 결과를 확인하기 전에는 QA-ENV-001 해결이나 화면 17단계 통과를 선언하지 않습니다.

## 연결 도구의 파일 쓰기가 응답하지 않을 때

현재 GitHub 연결에서는 읽기와 QA 브랜치 생성이 성공했지만 Git 객체·파일 쓰기는 응답을 받지 못했고, 재조회에서도 파일 반영을 확인하지 못했습니다. 권한 오류인지 서비스 지연인지는 확정하지 않습니다. Actions 등록과 실행은 미완료입니다.

별도 제공하는 단일 등록 파일 `seed-market-qa.yml`은 검증한 소스 스냅샷을 포함합니다. 사용자가 지정된 QA 브랜치의 `.github/workflows/`에 이 파일을 한 번 등록하면, 전용 bootstrap 작업이 소스의 SHA-256을 확인해 `seed-market/`를 만들고 해당 QA 브랜치에만 커밋합니다. 이 작업만 `contents: write`를 사용하고 외부 의존성을 실행하지 않습니다. 뒤따르는 실제 검사 작업은 생성된 정확한 커밋을 checkout하고 `contents: read`로 실행합니다. 운영 토큰이나 실제 인증키는 필요 없습니다.

기존 Blogger 소스와 main은 바꾸지 않으며 저장소 AGENTS.md에 따라 변경 이력만 QA 브랜치에서 추가합니다. 이 등록 경로도 아직 GitHub에서 실행하지 않았습니다. 정상적인 파일 쓰기가 가능해지면 `ci/seed-market-qa.yml`의 일반 워크플로로 전환할 수 있습니다.
