# Sprint 5 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `6a0c418030c2d2ad1e294131c2a3c04ecda1fa8f` (`feat(sprint5): community scrap/report/blind, B-LS company profile, persona smoke`)
- **포함:** Wave 1·Sprint 1–4 QA는 부모 히스토리. 본 검증은 `6a0c418` 트리(HEAD).
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Sprint 5 **부분 통과 (partial / COM P0·B-LS·smoke 강함)**. scrap/report/blind/categories/popular·company-profile API·학교 가드·테스트 **54/54**·persona smoke(node:test)는 실재. COM-002 태그·COM-003 첨부·scrap UI·브라우저 DoD·워크넷은 미충족(의도). STATUS Sprint 5 **~80%**·P0 **~58%**·워크넷 **0%/게이트 unknown**은 **정직**.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | Express routes + SQL 015 + HTML/JS 소폭 + node:test |
| 테넌시 (`school_id` + 가드) | **Pass** | scrap/report `canSeeSchoolResource`/`forbidCrossSchool`; blind `canModeratePost`; scraps/me·reports school 필터; popular 목록 `appendSchoolColumnFilter` |
| 시크릿 `.env` 커밋 | **Pass** | `.env.example` PORT DX 주석만. 실비밀 없음 |
| 업무 `localStorage` 신규 키 | **Pass** | `company_profile_*` 쓰기 제거. setup-test-profile은 API + 레거시 키 **삭제** 버튼. `jjobb_api_base`/`token`만 |
| REQ 인용 | **Pass** | 커밋·STATUS·테스트·`docs/03`/`04`/`05`에 REQ-COM-001/003/004/005, REQ-PLT-001 |
| docs 03/04/05 + STATUS | **Pass** | Community extras 표, B-LS 문구, Sprint 5 완료 기록 |
| 프론트 브라우저 검증 명시 | **Partial** | admin-board 블라인드 코드·STATUS「브라우저 확인」핸드오프. 본 세션 브라우저 실행 기록 없음. scrap UI는 API 우선 |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋 backend + api docs + frontend + QA (기존 Sprint 패턴) |

## 2. Sprint 5 DoD 항목

공통: STATUS 「Sprint 5 완료 기록」. Wave D 「스크랩·신고·익명·블라인드」슬라이스 + B-LS + persona smoke.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `015_v2_sprint5_community_extras.sql` | **Pass** | `post_categories`/`post_scraps`/`post_reports`; posts `is_anonymous`/`blinded_*`/`tags`/`file_ids` 컬럼. idempotent |
| 2 | REQ-COM-001 categories | **Pass** | `GET /api/posts/categories` + 시드 4분류(+news). 테스트 employment_review 등 |
| 3 | REQ-COM-003 scrap + 익명 | **Pass** (P0 슬라이스) | scrap POST/DELETE/me + 타교 403. 익명 마스킹. **첨부(file_ids) API/UI 미구현** — 컬럼 예약만 |
| 4 | REQ-COM-004 popular sort | **Pass** | `sort=popular` → likes/views. 테스트 likes desc |
| 5 | REQ-COM-005 report + blind | **Pass** | report·reports 목록·blind/unblind. 블라인드 후 목록 제외·상세 404. 교사 school 범위 |
| 6 | B-LS company_profile API | **Pass** | `GET/PUT /api/users/company-profile`. setup-test-profile API 전환. 테스트 upsert |
| 7 | 프론트 admin-board 블라인드 | **Pass** (코드) | `include_blinded`·blind/unblind 버튼. 브라우저 실검증 미기록 |
| 8 | `js/api.js` helpers | **Pass** | categories/scrap/report/blind + `jjobb_api_base` |
| 9 | Persona smoke | **Pass** (경량) | `persona-smoke.test.js` login→recommendations/me·field-trips. 선택 Puppeteer `npm run test:e2e`(서버 없으면 skip) |
| 10 | QA 전체 회귀 | **Pass** | **54/54** (본 세션 재실행) |
| 11 | REQ-COM-002 직무·기업 태그 | **Not started** | `tags` 컬럼만. STATUS와 일치 |
| 12 | 워크넷 실연동 | **Not started / gated** | `backend/modules/worknet` 없음. 0%·게이트 `unknown`. 가짜 완성 없음 |
| 13 | Playwright 풀 스위트 | **Fail / 의도적 스킵** | node:test + optional puppeteer. STATUS 「안 함」과 일치 |

### Sprint 4 검증 잔여 추적

| 이전 리스크 | Sprint 5 이후 | 메모 |
|-------------|---------------|------|
| B-LS `company_profile_*` | **해소** (API) | 레거시 키 cleanup UI만 잔존 |
| REQ-COM-* | **P0 슬라이스 해소** | COM-002·첨부 잔여 |
| Playwright / UI DoD | **부분** | API persona smoke. 브라우저 풀 DoD 미해소 |
| 워크넷 | **미해소 / gated** | |
| REC-002 | **미해소** | Sprint 6 대상 가능(형제 작업 중 `016_*` untracked — 본 검증 범위 밖) |

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
| `backend/tests/persona-smoke.test.js` | **2/2 pass** |

합계 **54 pass / 0 fail** (2026-09-14 본 세션). Playwright 필수 아님.

커버 (Sprint 5 추가): categories, scrap 동교/타교 403, 익명 마스킹, popular sort, report→blind→목록 숨김, company-profile PUT/GET, persona recommendations/field-trips.

미커버: scrap UI, 첨부 업로드, COM-002 태그 CRUD, 타교 teacher blind 403 전용, Puppeteer 강제(`E2E_STRICT`), worknet.

## 4. Spec 커버리지 (REQ → Sprint 5 슬라이스)

| REQ | P | Sprint 5 | 메모 |
|-----|---|----------|------|
| REQ-COM-001 | P0 | **Pass** | 분류 코드·시드·API |
| REQ-COM-002 | P1 | **Not started** | 컬럼만 |
| REQ-COM-003 | P0 | **Partial→Pass (P0 슬라이스)** | 글/댓글/좋아요(기존)+스크랩+익명. **첨부 미완** |
| REQ-COM-004 | P0 | **Pass** | search(기존)+popular |
| REQ-COM-005 | P0 | **Pass** | report + blind |
| REQ-PLT-001 | P0 | **Pass** (B-LS 잔여 해소) | company_profile API. 기타 JWT-only 패턴 유지 |
| REQ-REC-004 / TRP-002 | P0 | **Pass** (smoke) | persona API 경로만. UI E2E 약함 |
| REQ-WN-* | P2/게이트 | **N/A / Not started** | 모듈 없음·게이트 unknown |
| REQ-REC-002 | P1 | **Not started** | STATUS와 일치 |

## 5. STATUS 정직성 (`6a0c418` 기준)

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 5 **80%** | **정직 (75–85%).** COM P0 API·B-LS·smoke 실재. 태그/첨부/브라우저 UI 잔여로 90%+는 과대 |
| 전체 P0 **약 58%** | **정직 (55–60%).** Sprint 4 ~52%에서 COM P0·PLT B-LS 가산. WN·첨부·REC-002 미착수 |
| Phase 4 **72%** / QA **80%** | **정직~약간 낙관 (68–75% / 75–82%).** 54 API+smoke 가치 있음. 강제 브라우저 E2E 0 |
| 커뮤니티 고도화 **55%** | **정직~보수.** P0 API 강하나 COM-002·첨부·보드 scrap UI 부족 |
| 워크넷 **0%** / 게이트 `unknown` | **정직.** `modules/worknet` 없음. 가짜 연동 없음 |
| 알림톡 **15%** / `NOT_CONFIGURED` | **정직** (스텁 유지) |
| 「전체 54/54」 | **정직** (본 세션 재확인) |
| B-LS company_profile **해소** | **정직** |
| Sprint 3 **70% done-ish** / Sprint 4 **75%** | **재분류 유지 가능** (이전 검증과 모순 없음) |

**드리프트:** 없음(치명). `posts.tags`/`file_ids`는 스키마만 — STATUS가 COM-002·첨부 「미완」으로 명시해 문서·코드 정합.

## 6. 잔여 리스크 (구현 금지 — 확인만)

1. **COM-003 첨부** — `file_ids` 컬럼만. 업로드·게시 연계 없음.
2. **COM-002 태그** — P1. 컬럼 예약만.
3. **scrap/report 사용자 UI** — API·`js/api.js`만. 보드 화면 스크랩 UX 약함.
4. **admin-board 블라인드 브라우저 DoD** — 코드 있음, 본 검증에서 UI 미클릭.
5. **persona Puppeteer** — 기본 skip 가능. `E2E_STRICT` 없으면 허위 그린 가능.
6. **워크넷** — 모듈 0. 게이트 닫힘 유지 필요(가짜 완성 금지).
7. **형제 Sprint 6** — `database/migrations/016_v2_sprint6_associated_com_trip.sql` untracked. docs push 시 충돌 주의(앱 파일 미커밋).

## 7. 권장 QA (테스트 약화 금지)

1. 타교 teacher `POST .../blind` = 403.
2. 브라우저: admin-board 블라인드 → 일반 목록 미노출.
3. `E2E_STRICT=1 npm run test:e2e` (백엔드+정적 서빙 기동 시).
4. 회귀: 54 node:test 유지.
5. 첨부·태그(후속 Sprint) 스키마 계약 확정 후 API 테스트.

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % (Sprint 5 ~80%·P0 ~58% 유지 권장)
Need: 없음(수치 정직). Phase 1 착수 게이트 별도

Handoff: verifier/monitor → backend (Sprint 6+)
REQ: REQ-COM-002, REQ-COM-003 첨부, REQ-REC-002, REQ-WN-*
Need: 워크넷 게이트 ready 전 스텁만. 태그/첨부/연관추천

Handoff: verifier/monitor → frontend
REQ: docs/06 DoD, REQ-COM-003/005 UI
Need: scrap UX + admin-board 블라인드 브라우저 검증 기록

Handoff: verifier/monitor → qa
REQ: docs/08, REQ-COM-*, REQ-PLT-001
Need: 54 회귀 유지. 선택 E2E_STRICT. 타교 blind 403
Done: sprint5 6 + persona 2 + 전체 54/54 (2026-09-14)
```
