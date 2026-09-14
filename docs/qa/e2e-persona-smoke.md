# Persona smoke (E2E)

Playwright 전체 설치 대신 **경량 스모크**를 CI에 넣었습니다. 브라우저 UI까지 보려면 선택적으로 Puppeteer를 씁니다.

## 1. CI / 기본 (node:test, 권장)

백엔드 통합 테스트에 포함됩니다.

```bash
npm --prefix backend test
# 또는
npm test
```

관련 파일: `backend/tests/persona-smoke.test.js`

- 로그인 → `GET /api/recommendations/me` (배열 assert)
- 같은 토큰 → `GET /api/field-trips` (목록 배열 assert)

기존 Sprint 1–4 스위트와 함께 실행되며, Playwright/브라우저 바이너리가 필요 없습니다.

## 2. 선택: Puppeteer 브라우저 스모크

루트에 `puppeteer`가 있습니다 (`npm install`). **별도 백엔드가 떠 있어야** 합니다.

```bash
# 터미널 1 — AirPlay가 5000을 쓰면 PORT=5050
cd backend && JWT_SECRET=dev-only-change-me PORT=5050 npm start

# 터미널 2 — 정적 HTML
python3 -m http.server 8080

# 터미널 3
API_BASE=http://127.0.0.1:5050/api FRONT_BASE=http://127.0.0.1:8080 \
  E2E_EMAIL=qa.e2e.persona@jjob.test E2E_PASSWORD=password123 \
  npm run test:e2e
```

스크립트가 `jjobb_api_base`를 설정한 뒤 **reload**하므로, 5050에서도 로그인 JWT가 잡힙니다.
커버: 로그인 → jobs「관심」·community 스크랩 버튼·industry-visit 사후보고 필드 존재.

강제 실패: `E2E_STRICT=1`. 서버/브라우저 없으면 (STRICT 없이) exit 0 스킵.

Sprint 7 결과: [sprint7-browser-uat.md](./sprint7-browser-uat.md).
