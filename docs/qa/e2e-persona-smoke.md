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

루트에 `puppeteer`가 이미 있습니다. **별도 백엔드가 떠 있어야** 합니다.

```bash
# 터미널 1 — AirPlay가 5000을 쓰면 PORT=5050
cd backend && PORT=5000 npm start

# 터미널 2
API_BASE=http://127.0.0.1:5000/api FRONT_BASE=http://127.0.0.1:8080 npm run test:e2e
```

정적 HTML은 `npx serve -l 8080 .` 등으로 서빙하거나, Docker frontend(80)를 사용합니다.
프론트 `js/api.js`가 로컬에서 `http://localhost:5000/api`를 쓰므로, 5050이면 브라우저 콘솔에서:

```js
localStorage.setItem('jjobb_api_base', 'http://localhost:5050/api');
```

스크립트: `scripts/e2e-persona-smoke.cjs` — 로그인 페이지 → 대시보드 추천 카드 또는 API fallback assert.

서버/브라우저가 없으면 exit 0으로 스킵(CI를 깨지 않음). 강제 실행: `E2E_STRICT=1 npm run test:e2e`.
