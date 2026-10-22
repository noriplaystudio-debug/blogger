# 브라우저가 포함된 QA 실행 환경 · v5.0.3

QA-ENV-001은 미해결입니다. 이 문서의 이미지 빌드와 실제 브라우저 실행은 현재 Codex 환경에서 수행하지 못했습니다. Docker daemon은 실행 중이지만 소켓 접속이 `operation not permitted`로 차단됐고 작업 사용자는 UID 1000입니다. daemon 재시작으로 해결했다고 판단하지 않으며, 이곳에서 이미지 pull·빌드·실행은 하지 않았습니다.

v5.0.2 Work 보고서에서는 서버는 정상 시작했지만 Chromium 다운로드가 유효한 ZIP으로 준비되지 않았습니다. 같은 설치를 반복하기보다 **Chromium이 미리 포함된 실행 이미지 또는 이미 유효한 공식 브라우저 캐시가 있는 환경**을 사용합니다.

## 필요한 실행 조건

- Docker daemon 사용 권한과 공식 이미지 레지스트리 접근. `docker info`가 먼저 통과해야 합니다.
- 빌드 때 공식 Playwright 이미지와 고정 버전 npm 패키지 접근. 기본 이미지 태그는 `mcr.microsoft.com/playwright:v1.62.1-noble`이며 현재 환경에서는 태그 pull도 확인하지 못했습니다. digest를 검증·고정했다고 주장하지 않습니다.
- `.sites-runtime/qa-artifacts` 출력 디렉터리에 쓰기 권한.

이 조건이 없고 같은 실행 환경의 유효한 Chromium도 없다면 화면 검사를 재시도하지 않고 부족한 실행 조건을 보고합니다. CUA 브라우저와 셸의 localhost 공유, 권한 해제, 개발 로그인 공개를 해결 방법으로 가정하지 않습니다.

## Docker 사용 가능한 환경에서

`seed-market/`에서 실행합니다. 네트워크가 필요한 단계는 이미지 pull·빌드뿐이며 Chromium ZIP을 별도로 내려받지 않습니다. 빌드는 이미지의 Node 버전·SDK 버전·미리 설치된 Chromium 파일을 확인하고 맞지 않으면 실패합니다. 실제 브라우저 실행 여부는 이후 doctor가 확인합니다.

```sh
docker info
docker build --file Dockerfile.browser-qa --tag seed-market-qa:5.0.3 .
mkdir -p .sites-runtime/qa-artifacts
docker run --rm --init --network none --shm-size=1g \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$PWD/.sites-runtime/qa-artifacts,dst=/qa-output" \
  seed-market-qa:5.0.3
```

각 단계 성공을 확인한 뒤 다음 명령으로 진행합니다. 테스트 중에는 포트를 공개하지 않고 같은 컨테이너의 루프백에서 앱과 Chromium이 통신합니다. 컨테이너 런타임의 외부 네트워크는 끕니다. 실제 인증키나 `.env.local`, 테스트 전용 개발 로그인 경로를 외부 사이트에 연결하지 않습니다.

관리형 환경에서 프록시 CA가 필요하면 기존 Docker 프록시 설정을 유지하고 빌드 명령에 세션의 CA를 secret으로 전달합니다. `CODEX_PROXY_CERT`가 실제로 제공된 환경에서만 다음 변형을 사용합니다.

```sh
docker build --secret "id=proxy_ca,src=$CODEX_PROXY_CERT" \
  --file Dockerfile.browser-qa --tag seed-market-qa:5.0.3 .
```

CA는 해당 npm 설치 단계에서만 사용하며 이미지에 복사하지 않습니다. TLS 검증을 끄지 않습니다. 레지스트리 접근 자체가 거부되면 지원되는 환경 설정이 필요합니다.

## 실행 순서와 증거

컨테이너는 `qa:doctor` → 성공한 경우에만 전체 `test:browser` 순서로 실행합니다. 시작 전에 `summary.json`을 남깁니다. 이전 실행의 결과 파일을 재사용하지 않습니다.

`.sites-runtime/qa-artifacts/container-*/`에 다음을 보관합니다.

- `summary.json`: 환경 검사와 전체 여정의 상태·종료 코드, 실제 통과 단계, 내보낸 증거 목록.
- `doctor.log`, 실행한 경우 `journey.log`.
- `doctor/`, 실행한 경우 `journey/`: 원본 결과 JSON과 실제 생성된 스크린샷·trace·서버 로그·실패 HTML.

원본 JSON의 절대 경로는 컨테이너 내부 경로입니다. 외부 증거는 단계별 폴더의 같은 파일명과 summary의 파일 목록으로 찾습니다. 테스트 DB, 원본 업로드, 등록용 참고 이미지 fixture는 내보내지 않습니다. 컨테이너 제거 시 내부 임시 데이터도 제거됩니다. 출력 디렉터리만 결과로 공유합니다.

0 = 전체 자동화 성공, 1 = 화면 검사 실패, 2 = 환경/실행 차단입니다. doctor 통과만으로 전체 거래가 검증됐다고 표현하지 않습니다. 손상된 다운로드에 접근하지 않는 경로를 준비한 것과 실제 이미지 실행 성공도 구별합니다.

## 이미 브라우저가 준비된 환경

Docker 없이도 같은 실행 환경에 Playwright 1.62.1과 유효한 Chromium이 제공된다면 명시적 모듈·실행 파일 또는 `PLAYWRIGHT_BROWSERS_PATH`를 설정하고 다음을 순서대로 실행할 수 있습니다.

```sh
npm run qa:prepare -- --offline
npm run qa:doctor
npm run test:browser
```

오프라인 준비는 네트워크 설치를 실행하지 않고 파일·버전만 확인합니다. doctor 통과 전에는 전체 검사에 진행하지 않습니다. 실제 Chromium을 준비하지 않고 임의 실행 파일이나 더미 모듈로 통과 결과를 만들지 않습니다.
