# PC에서 새 Work 채팅으로 검증하기 · seed v5.4.0

인계일: 2026-10-28 (Asia/Seoul). 이 문서와 함께 제공하는 `seed-market-v5.4.0-work-handoff.zip`을 사용하세요. v5.0~v5.3 인계 ZIP은 이번 특허·공지 정책과 다릅니다.

## 사용자가 할 일

1. PC에서 검증용 **새 Work 채팅**을 엽니다. 일반 채팅이 아니라 파일·코드 실행과 브라우저 도구를 사용할 수 있는 Work 환경인지 확인하세요.
2. `seed-market-v5.4.0-work-handoff.zip` 한 개를 첨부합니다. 압축을 풀어서 파일을 하나씩 첨부할 필요는 없습니다.
3. 함께 제공한 `seed-market-v5.4.0-work-prompt.txt`의 전문을 복사해 메시지로 보냅니다. 이 문서의 짧은 설명만 보내지 마세요.
4. Work가 반환하는 **QA 보고서 MD와 체크리스트 JSON**을 내려받아 원래 Codex 채팅에 첨부합니다. 실패가 있으면 관련 스크린샷·로그·trace도 함께 전달하면 됩니다.

GitHub Compare, PR 병합, Vercel 배포, API 키 입력, 실제 회원정보·카드번호는 이번 검증에 필요하지 않습니다. 과거 마스크 아이디어의 비공개 등록 자료도 첨부하지 않습니다.

PC로 Work를 여는 것과 Work 내부의 실행 머신은 다릅니다. PC라는 이유만으로 Work의 Docker·Chromium·localhost 접근 제한이 풀리는 것은 아닙니다. 아래 사전 점검으로 실제 실행 가능 여부를 확인하고 막히면 환경 차단으로 보고합니다. 최신 원격 검증 결과는 ZIP 안 `seed-market/docs/VALIDATION.md`를 참고하며 Work에서 재현하지 않은 성공을 Work의 성공으로 옮겨 적지 않습니다.

## ZIP 구성과 현재 범위

- `QA_METADATA.json`: 버전·스냅샷·실제 확인한 소스/검사 결과·배포 상태.
- `SOURCE_MANIFEST.json`: ZIP 안 소스 파일의 SHA-256·크기. 자체 확인용이며 서명 인증은 아닙니다.
- `seed-market/`: 실행 소스, 격리 API/DB 검사, 실제 브라우저 러너와 문서.
- `seed-market/.openai/hosting.json`: 실제 호스팅 ID를 제거한 `QA_ONLY_NOT_A_SITE` 검증용 사본. 배포용이 아닙니다. 원본 사이트 식별자를 변경한 운영 소스가 아닙니다.

인증키·`.env.local`·DB·업로드·브라우저 캐시·node_modules·Git 인증·실제 사용자 데이터는 제외합니다. 실제 OAuth/PG/송금·KIPRIS 자동 조회·법률 판단·서비스 배포는 범위 밖입니다.

## Work가 실행할 순서

압축을 새 디렉터리에 풀고 `seed-market/`에서 실행합니다. Node.js 22.13 이상이 필요하며 24 권장입니다. 앱 전체 `npm install`이나 Docker 빌드는 시작하지 않습니다.

```sh
node --version
npm run check
npm test
npm run qa:tools-test
```

각 명령의 종료 코드를 확인합니다. 이는 서버·DB·템플릿 검사이며 화면 동작 통과를 뜻하지 않습니다.

실제 브라우저는 **현재 실행 머신에 있는 도구부터 확인**합니다. 실행 가능한 Chrome/Chromium이 있으면 그 정확한 경로를 `SEED_BROWSER_EXECUTABLE`에 지정하고, Playwright 1.62.1이 이미 있으면 `SEED_PLAYWRIGHT_PATH`에 해당 `index.mjs`를 지정합니다. 버전이 다르면 임의로 검사를 완화하지 않습니다.

Chrome은 있지만 고정 Playwright 드라이버만 없다면 다음 설치를 한 번 실행합니다. Chromium은 내려받지 않습니다.

```sh
npm install --prefix tools/browser-qa --ignore-scripts --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
```

예를 들어 실제 발견된 브라우저 경로가 `/usr/bin/google-chrome`인 경우에만 다음과 같이 지정합니다. 경로를 추측해서 복사하지 않습니다.

```sh
export SEED_BROWSER_EXECUTABLE=/usr/bin/google-chrome
npm run qa:doctor
```

고정 버전 도구와 Chromium이 모두 이미 준비되어 있다면 `npm run qa:prepare -- --offline`으로 준비 상태를 먼저 기록할 수도 있습니다. 브라우저가 전혀 없는 경우 `npm run qa:prepare`의 공식 다운로드를 한 번만 시도할 수 있습니다. 실행 정책 거부·손상된 ZIP·시스템 라이브러리 차단이 반복되면 추가 설치·우회 루프를 중단합니다.

`qa:doctor`가 성공한 경우에만 다음 단계로 갑니다.

```sh
npm run test:browser
```

doctor와 러너가 자신의 환경 안에서 격리 Node 서버와 Playwright 브라우저를 함께 띄우고 종료하므로 앱 서버를 따로 실행할 필요가 없습니다. 셸의 localhost를 서로 다른 머신의 computer-use 브라우저에 전달해서 접속된 것으로 가정하지 않습니다. 호스트 검사나 개발 로그인 보호를 해제하지 않습니다.

기본은 데스크톱 1365×900과 모바일 390×844 에뮬레이션입니다. 기본 18단계 통과 후, Work의 지원되는 computer-use/브라우저 조작으로 같은 서버에 실제 접근할 수 있다면 PC에서 공지 가독성·키보드 이동·긴 문헌 제목·모달 스크롤·메뉴를 추가 점검하세요. 이 추가 검사는 기본 러너가 한 것으로 기록하지 않습니다. 접속 수단이 없으면 수동 브라우저 검사는 미실행으로 남깁니다.

## 이번 버전의 핵심 합격 기준

- 공지에서 아이디어 공유소의 목적, 열람료가 기획 자료를 검토하는 대가임을 안내합니다.
- 특허 미기재·미확인·유사 문헌·전문가 상담 권장은 등록·일반 자료 승인·구매 차단 사유가 아닙니다.
- 유사 정보는 실제 원문 링크·번호·제목·국가·문헌 확인일로 안내하고 출원 공개와 등록공보를 구분합니다. 현재 유효한 권리·비침해 인증으로 표시하지 않습니다.
- 운영용 메모·권리자 정보는 구매자에게 공개하지 않습니다. 구매 당시 공개 참고 정보와 동의 문구는 거래 기록에 보존합니다.
- 전면 면책·거래 전체 무효·일괄 환불 불가로 안내하지 않습니다. 법정 책임·소비자 권리를 보존합니다.
- 별도 단독 이용권은 이 사이트의 판매완료·다른 구매자의 재열람 종료 조건이며 아이디어 자체의 법적 독점권이 아닙니다.
- 기존 판매/수정/일반 심사, 열람·단독 이용, 중복 결제 방지, 문의·환불·정산, 무료 나눔·금액 의견·통계를 검증합니다.

## 반환할 파일

Work는 날짜를 실제 실행일의 Asia/Seoul 기준으로 적고 다음을 반환합니다.

- `seed-market-v5.4.0-qa-report-YYYY-MM-DD.md`
- `seed-market-v5.4.0-qa-checklist-YYYY-MM-DD.json`
- 발견한 실패의 화면·console·응답·재현 단계, 가능한 경우 Playwright trace.

상태는 PASS / FAIL / BLOCKED / NOT_RUN으로 구분합니다. 재현되지 않은 개선 제안은 결함 확정과 구분하고, 코드 수정·배포 없이 Codex가 고칠 수 있도록 원인 근거·수정 위치·재검증 기준을 적습니다. 보고서 예시만 작성해 검증한 것처럼 보이지 않게 합니다.

## 선택: 사용자가 자신의 Windows PC에서 직접 화면 보기

Work 환경이 막혀도 사용자의 PC에서는 별도로 실행할 수 있습니다. Node.js 24를 설치한 PC에서 ZIP을 풀고 PowerShell로 `seed-market` 폴더에 들어갑니다.

```powershell
node --version
npm run dev:standalone
```

동일 PC 브라우저로 `http://127.0.0.1:4173`을 엽니다. 테스트용 가상 계정으로 확인하고 종료할 때 PowerShell에서 Ctrl+C를 누릅니다. 이 주소는 다른 머신의 Work 브라우저에서 접근 가능한 공개 주소가 아닙니다. 서버를 인터넷에 노출하거나 실제 개인정보·결제 정보를 입력하지 않습니다.
