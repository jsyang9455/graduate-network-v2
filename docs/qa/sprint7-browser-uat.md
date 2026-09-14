# Sprint 7 — Browser / persona UAT

날짜: 2026-09-14  
기준 커밋(베이스라인): `28bc73c`  
환경: macOS AirPlay가 **:5000** 점유 → API `PORT=5050`, 정적 `python3 -m http.server 8080`  
오버라이드: `localStorage.jjobb_api_base = 'http://localhost:5050/api'` (또는 `http://127.0.0.1:5050/api`)

## Fixtures

| 페르소나 | 이메일 | 비고 |
|----------|--------|------|
| 학생 | `qa.e2e.persona@jjob.test` | `persona-smoke` / Sprint6 계열 시드 |
| 교사 | `qa.e2e.teacher@jjob.test` | 사후보고 |
| 비밀번호 | `password123` | 개발 DB 전용 (`TEST-ACCOUNTS.md` 패턴) |

## Results

### A. node:test persona smoke (CI 기본)

`backend/tests/persona-smoke.test.js` — Sprint 7에서 Sprint 6 경로 확장:

| Case | REQ | 결과 |
|------|-----|------|
| login → `/recommendations/me` | REQ-REC-004 | Pass |
| login → `/field-trips` | REQ-TRP-002 | Pass |
| `/recommendations/associated` | REQ-REC-002 | Pass |
| job scrap + `/jobs/scraps/me` | REQ-REC-002 | Pass |
| COM tags + post scrap | REQ-COM-002/003 | Pass |
| field-trip after-report | REQ-TRP-003 | Pass |

전체 백엔드: **63/63** pass (베이스라인 59 + persona 확장 4).

### B. Live API against PORT=5050 (동일 픽스처)

| Path | HTTP | 결과 |
|------|------|------|
| associated recommendations | 200 | Pass (n≥1) |
| `POST /jobs/:id/scrap` | 201 | Pass |
| `POST /posts/:id/scrap` | 201 | Pass |
| teacher `PUT /field-trips/24/report` | 200 | Pass |

### C. Puppeteer browser (`npm run test:e2e`)

```bash
API_BASE=http://127.0.0.1:5050/api FRONT_BASE=http://127.0.0.1:8080 \
  E2E_EMAIL=qa.e2e.persona@jjob.test E2E_PASSWORD=password123 E2E_STRICT=1 \
  npm run test:e2e
```

| Step | 결과 |
|------|------|
| API smoke (associated/scraps/trips) | Pass |
| Login (after reload so `jjobb_api_base` applies) | Pass — JWT in localStorage |
| `jobs.html` 「관심」 버튼 | Pass |
| `community.html` `#scrapBtn` | Pass |
| `industry-visit.html` `#reportSummary` | Pass |

**Note:** IDE browser MCP는 비밀번호 필드 자동입력·세션 주입을 정책상 차단함. Puppeteer 스크립트로 동일 페르소나 경로를 검증함.

### D. Cursor IDE browser MCP

| Step | 결과 |
|------|------|
| `login.html` 로드 | Pass |
| `jjobb_api_base` 설정 | Pass |
| password fill / credential login | **Blocked** (auto-review) |

→ 브라우저 자격증명 자동화는 Puppeteer 경로로 대체. 기능 회귀는 A–C로 커버.

## NFR (Sprint 7)

| REQ | 조치 |
|-----|------|
| REQ-NFR-010 | `docker-compose.yml` JWT 평문 제거 → `${JWT_SECRET:?…}` + 루트 `.env.example` |

## Out of scope (유지)

- 워크넷 / 알림톡 **실연동 안 함** (`NOT_CONFIGURED` 유지)
- Playwright 풀 스위트 / React·ML rewrite 없음
