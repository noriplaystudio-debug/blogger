# 소셜 로그인 등록과 인증키 연결 준비

네이버·카카오·구글 연동을 나중에 등록할 수 있도록 환경변수, 공급자 설정, 콜백 경로, 준비 상태 화면을 만들었습니다.
현재 실제 공급자 키는 비어 있고 실제 계정으로 로그인 검증을 하지는 않았습니다.

## 인증 구성을 먼저 구분하세요

| 구성 | 인증 | 외부 로그인 |
| --- | --- | --- |
| 기존 Sites 배포 | Sites가 인증한 ChatGPT 사용자 | 현재 연동의 활성화를 가정하지 않음 |
| 독립 Node 서버 | Better Auth 1.7.11 및 별도 인증 DB | 등록한 네이버·카카오·구글 사용 가능 |

기존 Sites에서 인증 헤더를 흉내 내거나 로그인 우회 기능을 만들지 않았습니다.
독립 모드는 서버를 직접 운영하거나 HTTPS 리버스 프록시 뒤에 둘 때 사용하는 별도 어댑터입니다.
그 모드에는 로컬 테스트 계정 로그인을 포함하지 않습니다.
영속 SQLite·이미지 디스크, 접근 제한 및 백업 구성이 필요합니다. 일시적인 함수 파일시스템에 그대로 배포하지 않습니다.

## 1. 설정 파일 만들기

    npm run auth:setup

Git에서 제외된 .env.local을 만들고 충분히 긴 임의 서버 비밀값을 생성합니다.
값은 명령 출력에 표시하지 않습니다. 기존 비밀값은 덮어쓰지 않습니다.
공급자의 실제 키는 이 파일 또는 운영 서버의 환경변수 관리 기능에만 등록하세요.

.env.example은 필요한 변수 이름만 담은 공개 예시입니다.
웹 화면에서 실제 비밀키를 조회하거나 데이터베이스에 입력하는 기능은 두지 않았습니다.

## 2. 서비스 주소와 공통 변수

독립 인증 활성화 시:

    AUTH_MODE=better-auth
    BETTER_AUTH_URL=https://최종-서비스-도메인
    BETTER_AUTH_SECRET=32자-이상의-서버-비밀값
    AUTH_DATABASE_PATH=.sites-runtime/auth.sqlite
    APP_DATABASE_PATH=.sites-runtime/market.sqlite

BETTER_AUTH_URL에는 경로·쿼리·해시 없는 서비스 원점을 지정합니다.
운영 주소는 HTTPS가 필요합니다. localhost 또는 127.0.0.1의 로컬 개발 주소만 HTTP를 허용합니다.
현재 로컬 미리보기는 http://127.0.0.1:4173 입니다.

네이버·카카오·구글은 서버에서 생성하는 아래 콜백을 각 개발자 앱에 등록합니다.

| 공급자 | Client ID 변수 | Secret 변수 | 콜백 |
| --- | --- | --- | --- |
| 네이버 | NAVER_CLIENT_ID | NAVER_CLIENT_SECRET | /api/auth/callback/naver |
| 카카오 | KAKAO_CLIENT_ID | KAKAO_CLIENT_SECRET | /api/auth/callback/kakao |
| 구글 | GOOGLE_CLIENT_ID | GOOGLE_CLIENT_SECRET | /api/auth/callback/google |

예: https://최종-서비스-도메인/api/auth/callback/google

운영 화면의 설정·로그인 탭에는 설정 여부, 변수 이름, 서비스 주소 기준 콜백과 개발자 콘솔 링크가 표시됩니다.
키가 있더라도 현재 호스팅 모드에서 활성화되지 않았거나 실제 로그인 검증을 하지 않은 상태를 구분합니다.
키 입력만으로 앱 검수나 공급자 권한 승인이 끝났다고 표시하지 않습니다.

## 3. 네이버

1. https://developers.naver.com 에서 로그인용 애플리케이션을 등록합니다.
2. 서비스 주소와 /api/auth/callback/naver가 포함된 콜백 URL을 등록합니다.
3. 로그인에 필요한 기본 프로필 동의 항목과 공개 서비스 이용 조건을 확인합니다.
4. Client ID와 Client Secret을 서버의 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET에 입력합니다.

공식 연동 안내: https://better-auth.com/docs/authentication/naver

## 4. 카카오

1. https://developers.kakao.com 에서 앱을 만듭니다.
2. 웹 플랫폼 주소, 카카오 로그인 활성화와 리다이렉트 URI를 설정합니다.
3. REST API 키를 KAKAO_CLIENT_ID에, 로그인용 Client Secret을 KAKAO_CLIENT_SECRET에 등록합니다.
4. 이메일·닉네임 등의 동의 항목이 앱에서 허용되는지 확인합니다.

현재 공급자 라이브러리는 기본 프로필과 이메일을 사용합니다.
카카오의 이메일 제공 동의 항목은 앱의 사업자 확인 및 승인 조건을 확인해야 합니다.
임의 이메일을 만들어 사용자의 계정을 연결하는 방식으로 이 조건을 우회하지 않습니다.

공식 연동 안내: https://better-auth.com/docs/authentication/kakao

## 5. 구글

1. https://console.cloud.google.com/apis/credentials 에서 프로젝트·동의 화면·웹 OAuth 클라이언트를 설정합니다.
2. 승인된 서비스 원점과 /api/auth/callback/google이 포함된 리다이렉트 URI를 등록합니다.
3. 테스트 사용자 및 앱 게시 상태를 확인합니다.
4. Client ID와 Secret을 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET에 등록합니다.

공식 연동 안내: https://better-auth.com/docs/authentication/google

## 6. SDK 설치와 인증 DB

아직 네트워크 제한 때문에 이 작업 환경에서는 SDK 설치·실제 공급자 로그인 검증을 완료하지 못했습니다.
네트워크가 가능한 환경에서 진행합니다.

    npm install --prefer-offline --no-audit --no-fund
    npm run auth:setup
    npm run auth:migrate
    npm run dev:standalone

auth:migrate는 로컬 환경설정을 로드해 해당 Better Auth 버전의 CLI를 실행합니다.
기존 앱의 거래 DB와 별도의 인증 DB를 사용합니다.
독립 모드의 거래 DB·이미지 디렉터리도 로컬 테스트 계정의 데이터와 분리했습니다.
기존 Sites 회원과 주문이 생긴 뒤 전환한다면, 검증된 계정 매핑과 기록 이관을 별도로 계획해야 합니다. 이메일만으로 자동 이관하지 않습니다.
사용자·세션·공급자 계정·검증·요청 제한 테이블은 라이브러리의 마이그레이션으로 준비합니다.
비밀번호 해시, 세션과 OAuth 상태 검증을 직접 구현하지 않았습니다.

독립 모드에는 dev-seller 같은 테스트 로그인 경로를 활성화하지 않습니다.
실제 OAuth 사용자 ID에는 별도의 내부 식별자 접두사를 붙여 기존 Sites/개발용 ID와 섞이지 않게 합니다.
소셜 로그인은 기존 회원이면 자신의 계정으로, 처음이면 판매자·구매자 역할 선택으로 이어집니다.

## 7. 이메일·비밀번호는 선택 사항

기본값은 비활성입니다.
인증과 재설정 메일을 보내는 서버 측 전송 경로를 먼저 준비한 뒤 설정합니다.

    AUTH_EMAIL_ENABLED=true
    AUTH_MAIL_WEBHOOK_URL=https://자체-메일-전송-경로
    AUTH_MAIL_WEBHOOK_SECRET=서버-전용-인증값

메일 웹훅은 Authorization: Bearer 형식의 서버 인증값을 확인해야 합니다.
JSON으로 kind(verify-email 또는 reset-password), email, name, url을 받습니다.
해당 메일을 실제 수신자에게 전송하고 성공한 경우에만 성공 응답을 반환하도록 연결합니다.

가입 확인 메일을 인증해야 로그인할 수 있습니다.
비밀번호는 12~128자로 제한하며, 확인·재설정 화면과 데이터베이스 기반 요청 제한을 준비했습니다.
메일 전송 설정이 없으면 이메일 가입 버튼은 활성화되지 않습니다.

이메일이 같다는 이유로 다른 소셜 계정을 자동 통합하지 않습니다.
추후 계정 연결을 추가할 때에는 현재 계정과 새 공급자의 인증을 모두 확인해야 합니다.

## 8. 운영자 지정

실제 가입 후 /api/me의 본인 profile.id를 확인해 서버에서 지정합니다.

    ADMIN_USER_IDS=내부-회원-ID

여러 ID는 쉼표로 구분합니다. 계정 이름이나 브라우저의 역할 값을 사용하지 않습니다.
로컬 미리보기에는 dev-operator가 있지만 독립 인증 모드에는 자동으로 추가하지 않습니다.

## 9. 연결 후 점검

- /api/auth/ok 응답 및 인증 DB 준비.
- 공급자별 첫 가입 → 역할 선택 → 재로그인 → 기존 주문 유지.
- 로그인 취소·거부·만료 및 잘못된 콜백.
- 소셜 계정 간 이메일 중복과 계정 연결 차단.
- 로그아웃 후 상세 자료 접근 차단.
- 이메일 가입을 사용할 경우 확인 메일·재설정 메일의 실제 도착.
- 운영 도메인, HTTPS 쿠키, 프록시 Host 및 콜백의 일치.

실제 계정으로 이 절차를 통과하기 전에는 연결 완료로 취급하지 않습니다.
