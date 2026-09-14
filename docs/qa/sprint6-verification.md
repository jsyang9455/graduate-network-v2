# Sprint 6 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `28bc73c7b3be21412af6e0ecad1b9d3c218ef01e` (`feat(sprint6): associated recommendations, tags/attachments, scrap UI, trip reports`)
- **포함:** Wave 1·Sprint 1–5 QA는 부모 히스토리. 본 검증은 `28bc73c` 트리(HEAD = `origin/main`).
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정. docs만 기록)
- **판정:** Sprint 6 **부분 통과 (partial / API·스키마·스크랩 UI·사후보고·워크넷 스텁 강함)**. REC-002 associated·job scrap 가드, COM-002 tags/`file_ids`+`POST /api/files`, community/dashboard/jobs scrap UI, TRP-003 after-report, worknet **NOT_CONFIGURED-only**, 회귀 **59/59**는 실재. 브라우저 페르소나 DoD·`file_ids` 전용 API 테스트·`also_scraped` 신호 단언은 약함. STATUS Sprint 6 **~80%**·P0 **~62%**·워크넷 **10%/게이트 unknown**은 **정직**.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | Express + SQL 016 + HTML/JS + node:test |
| 테넌시 (`school_id` + 가드) | **Pass** | associated SQL school 필터; job scrap `canSeeJob`/타교 403; trip report `assertSameSchool`; posts tags/`file_ids` 기존 school 가드; files attachment 동교 읽기 |
| 시크릿 `.env` 커밋 | **Pass** | 커밋에 `.env` 없음. worknet는 env 키만 검사 |
| 업무 `localStorage` 신규 키 | **Pass** | JWT/`jjobb_api_base`만. scrap·tags·report는 API |
| REQ 인용 | **Pass** | 커밋·STATUS·테스트·`docs/03`/`04`/`05`/`openapi`에 REC-002, COM-002/003, TRP-003, WN-010 |
| docs 03/04/05 + STATUS | **Pass** | job_scraps·field_trip_reports·associated·files POST·Sprint 6 완료 기록 |
| 프론트 브라우저 검증 명시 | **Partial** | STATUS「브라우저 DoD partial」·핸드오프 Need에 페르소나. 본 세션 브라우저 미실행 |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋 backend + api docs + frontend + QA (기존 Sprint 패턴) |

## 2. Sprint 6 DoD 항목

공통: STATUS 「Sprint 6 완료 기록」. 클레임: REC-002 associated, COM-002 tags/`file_ids`, scrap UI, field-trip report, Worknet stubs NOT_CONFIGURED only, 59/59.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `016_v2_sprint6_associated_com_trip.sql` | **Pass** | `job_scraps`, `field_trip_reports`, posts tags GIN. idempotent |
| 2 | REQ-REC-002 `GET /api/recommendations/associated` | **Pass** | `associatedForUser` co-apply/scrap, school scope, `also_applied`/`also_scraped` reasons. 테스트 타교 job 미포함 |
| 3 | REQ-REC-002 job scrap API | **Pass** | `POST/DELETE /api/jobs/:id/scrap`, `GET /api/jobs/scraps/me`, 타교 403 |
| 4 | REQ-COM-002 tags + `?tag=` | **Pass** | create `tags[]`, list filter. 테스트 통과 |
| 5 | COM 첨부 `file_ids` + `POST /api/files` | **Pass** (코드) / **Partial** (테스트) | posts normalizeFileIds·multer upload·community.html `uploadFile`→`file_ids`. **전용 API 테스트 없음** |
| 6 | scrap UI (게시·뉴스·관심 공고) | **Pass** (코드) | `community.html` scrap/내스크랩/태그·첨부; dashboard news scrap; jobs「관심」. 브라우저 실클릭 미기록 |
| 7 | REQ-TRP-003 사후 보고 | **Pass** | `GET/PUT .../report` school 가드 + industry-visit UI. 타교 PUT 403 테스트 |
| 8 | Worknet stubs NOT_CONFIGURED only | **Pass** | `routes/worknet.js`만. 키 없어도 status 200 `NOT_CONFIGURED`; sync 항상 503 stub(키 있어도 live sync 없음). 가짜 완료 없음 |
| 9 | `js/api.js` helpers | **Pass** | associated, job scrap, uploadFile, fieldTrip report |
| 10 | QA 전체 회귀 | **Pass** | **59/59** (본 세션 재실행) |
| 11 | Playwright 풀 스위트 | **Fail / 의도적 스킵** | STATUS「안 함」과 일치 |
| 12 | 알림톡 실연동 | **N/A / gated** | 스텁 유지. Sprint 6 범위 밖 |

### Sprint 5 검증 잔여 추적

| 이전 리스크 | Sprint 6 이후 | 메모 |
|-------------|---------------|------|
| COM-003 첨부 | **해소** (API+UI) | 업로드·게시 연계 코드 있음. 전용 테스트 약함 |
| COM-002 태그 | **해소** (P1 슬라이스) | create+filter+UI |
| scrap UI | **해소** (코드) | community/dashboard/jobs. 브라우저 DoD 잔여 |
| REC-002 | **해소** (P1) | associated + job scrap |
| TRP-003 사후 보고 | **해소** | API+UI |
| 워크넷 | **스텁만** | 10%·게이트 unknown. 실연동 금지 유지 |
| Playwright / UI DoD | **부분 유지** | API 59 + STATUS partial |

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test --test-concurrency=1 tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** |
| `backend/tests/sprint1-documents.test.js` | **9/9 pass** |
| `backend/tests/sprint2-workflow.test.js` | **12/12 pass** |
| `backend/tests/sprint3-community.test.js` | **6/6 pass** |
| `backend/tests/sprint4-recommendations-fieldtrips.test.js` | **7/7 pass** |
| `backend/tests/sprint5-community.test.js` | **6/6 pass** |
| `backend/tests/sprint6-associated-com-trip.test.js` | **5/5 pass** |
| `backend/tests/persona-smoke.test.js` | **2/2 pass** |

합계 **59 pass / 0 fail** (2026-09-14 본 세션). Playwright 필수 아님.

커버 (Sprint 6 추가): associated co-apply + 타교 미누수, job scrap/me + 타교 403, tags create/filter, trip report put/get + 타교 403, worknet status/sync NOT_CONFIGURED.

미커버: `POST /api/files`→`file_ids` round-trip, associated `also_scraped` 단언, scrap/report/after-report 브라우저 E2E, worknet 키 존재 시에도 sync stub 유지 회귀.

## 4. Spec 커버리지 (REQ → Sprint 6 슬라이스)

| REQ | P | Sprint 6 | 메모 |
|-----|---|----------|------|
| REQ-REC-002 | P1 | **Pass** | associated + job scrap school scope |
| REQ-COM-002 | P1 | **Pass** | tags + `?tag=` + UI |
| REQ-COM-003 | P0 | **Pass** (첨부 슬라이스) | Sprint 5 scrap + Sprint 6 `file_ids`/upload. UI scrap 보드 |
| REQ-TRP-003 | P0 | **Pass** (사후보고 슬라이스) | roster/attendance(S4) + report(S6) |
| REQ-WN-010 | P2/게이트 | **Pass** (스텁) | status/sync NOT_CONFIGURED only. 실연동 N/A |
| REQ-MSG-* | P2/게이트 | **N/A** | 변경 없음 |
| REQ-WN-004 live sync | 게이트 | **Not started** | 키 있어도 sync stub 503 — 의도 |

## 5. STATUS 정직성 (`28bc73c` 기준)

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 6 **80%** | **정직 (75–85%).** API·스키마·UI·59 tests 실재. 브라우저 DoD·첨부 테스트 공백으로 90%+는 과대 |
| 전체 P0 **약 62%** | **정직 (60–65%).** S5 ~58%에서 TRP-003 사후보고·COM 첨부·scrap UI 가산. REC-002/COM-002는 P1이라 P0 급등은 아님 — 서사에 포함해도 %는 보수적 |
| Phase 4 **78%** / QA **85%** | **정직~약간 낙관 (72–80% / 80–88%).** 59 API 가치 있음. 강제 브라우저 E2E 0 |
| 추천 엔진 **85%** | **정직.** REC-002 associated 추가. 고도 모델 아님(문서 BoW+연관) |
| 견학 모듈 **80%** | **정직.** 사후보고로 S4 partial 해소 |
| 커뮤니티 고도화 **75%** | **정직.** 태그·첨부·스크랩 UI. 브라우저 DoD 잔여 |
| 워크넷 **10%** / 게이트 `unknown` | **정직.** 라우트 스텁만. 가짜 연동 없음 |
| 알림톡 **15%** / `NOT_CONFIGURED` | **정직** (유지) |
| 「전체 59/59」 | **정직** (본 세션 재확인) |
| 「브라우저 DoD partial」 | **정직** |

**드리프트:** 없음(치명). worknet status가 키 있으면 `CONFIGURED`를 반환해도 sync는 여전히 stub 503 — STATUS「실연동 안 함」과 일치. `also_scraped`는 구현·테스트 제목에 있으나 연관 응답 단언은 apply 경로 중심.

## 6. 잔여 리스크 (구현 금지 — 확인만)

1. **브라우저 DoD** — community scrap/첨부, jobs 관심, industry-visit 사후보고 미클릭.
2. **첨부 API 테스트 공백** — `file_ids` round-trip·타교 file 403 미커버.
3. **also_scraped 단언 약함** — scrap API는 검증, associated 신호는 apply 위주.
4. **워크넷 게이트** — ready 전 실연동 금지 유지(스텁 OK).
5. **Playwright / E2E_STRICT** — 선택. 허위 그린 가능.
6. **형제 Sprint 7** — 동일 트리 docs/앱 동시 편집 시 충돌 주의. 본 검증은 docs-only.

## 7. 권장 QA (테스트 약화 금지)

1. `POST /api/files` → post `file_ids` → GET 상세에 id 포함.
2. scrap 후 `GET /api/recommendations/associated`에 `also_scraped` reason.
3. 브라우저: community 스크랩·태그·첨부, jobs 관심, industry-visit 보고 저장.
4. 회귀: 59 node:test 유지.
5. 게이트 ready 전 worknet live sync 추가 금지.

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % (Sprint 6 ~80%·P0 ~62% 유지 권장)
Need: 없음(수치 정직). B-GATE 확인만

Handoff: verifier/monitor → frontend/qa
REQ: docs/06 DoD, REQ-COM-002/003, REQ-TRP-003, REQ-REC-002 UI
Need: community/scrap/after-report/jobs 관심 브라우저 페르소나 기록

Handoff: verifier/monitor → backend/qa
REQ: REQ-COM-003 첨부, REQ-REC-002 also_scraped
Need: file_ids round-trip 테스트; associated scrap 신호 단언

Handoff: verifier/monitor → architect (게이트)
REQ: REQ-WN-*, REQ-MSG-*
Need: ready 전 실연동 금지 유지
Done: Sprint 6 verifier docs; 59/59 confirmed 2026-09-14
```
