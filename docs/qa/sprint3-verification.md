# Sprint 3 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `78ba7eebb46f69f71a672a22727033f3bf11877a` (`feat(tenancy): Sprint 3 community school scope and file privacy`)
- **포함:** Wave 1·Sprint 1·Sprint 2 QA는 부모 히스토리. 본 검증은 `78ba7ee` 트리.
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Sprint 3 **부분 통과 (partial)**. posts/announcements/certificates/education-programs 학교 필터·타교 403, `GET /api/files` 동일교 peer `resume_pdf` 403, admin-board API 이관, profile `/auth/me` 우선, 테스트 **39/39**는 실재. 추천·견학·커뮤니티 기능 고도화·networking 테넌시·Playwright·브라우저 DoD는 미충족. STATUS Sprint 3 **35%**·P0 **~44%**는 **대체로 정직**.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | HTML/CSS/JS + Express + SQL 마이그레이션 |
| 테넌시 (`school_id` + 가드) | **Pass** (범위 내) | `schoolResourceAccess` + posts/announcements/certificates/education-programs. **networking 미가드** |
| 시크릿 `.env` 커밋 | **Pass** | 커밋에 시크릿 없음 |
| 업무 `localStorage` 신규 키 | **Pass** | admin-board `recentNews`/`educationPrograms` 제거. profile은 `/auth/me` 후 `graduateNetwork_user` 캐시만 (세션 패턴). `company_profile_*` 잔존(B-LS) |
| REQ 인용 | **Pass** | 커밋·STATUS·테스트에 REQ-IAM-009, REQ-RSM-005, REQ-PLT-001 |
| docs 04 + STATUS | **Pass** (얇음) | `docs/04` 1줄 + STATUS Sprint 3 완료 기록. `docs/03` 본 커밋 미갱신(기존 `education_programs.school_id` 표기 있음) |
| 프론트 브라우저 검증 명시 | **Fail** | admin-board/profile UI E2E·브라우저 기록 없음 |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋이 backend + frontend + QA + docs (기존 패턴) |

## 2. Sprint 3 DoD 항목

공통: `docs/06-delivery-plan.md` Wave D / W9–11, STATUS 「Sprint 3 완료 기록」.  
참고: delivery-plan Sprint 3은 **추천·견학·커뮤니티·메시지** 전체. 본 커밋은 **테넌시·파일 프라이버시·B-LS board/profile** 슬라이스.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `013_v2_sprint3_community_tenancy.sql` | **Pass** | announcements/certificates/education_programs `school_id` + posts/announcements/certificates/education backfill. idempotent |
| 2 | `schoolResourceAccess.js` | **Pass** | `appendSchoolColumnFilter`, `canSeeSchoolResource`, `denySchoolResourceAccess` |
| 3 | posts school scope + 타교 403 | **Pass** (API) | list 필터, GET/PUT/DELETE 가드. 테스트: B→A post 403, A list excludes B |
| 4 | announcements school scope + 403 | **Pass** (API) | detail 403, job-fair list 학교 필터. 테스트 2건 |
| 5 | certificates school scope + 403 | **Pass** (API) | GET `/:id` assertSameSchool. 테스트 1건 |
| 6 | education-programs school scope | **Pass** (코드) | list/get/put/delete `canSeeSchoolResource` + filter. **전용 403 테스트 없음** |
| 7 | `GET /api/files` resume_pdf 동일교 peer 403 | **Pass** | `canReadFile` resume 분기 후 `return false` (fall-through 제거). 테스트 peer 403 |
| 8 | admin-board LS 제거 → API | **Pass** (코드) | `/api/posts`, `/api/education-programs` CRUD. **브라우저 미검증** |
| 9 | profile B-LS (소스 오브 트루스) | **Pass** (부분) | `api.get('/auth/me')` 우선. `graduateNetwork_user`는 캐시 setItem 유지 |
| 10 | QA sprint3-community + 전체 회귀 | **Pass** | 6 + 이전 33 = **39/39** (본 세션 재실행) |
| 11 | REQ-REC-* 추천 엔진 | **Not started** | STATUS 0%와 일치 |
| 12 | REQ-TRP-* 견학 이관 | **Not started** | announcements 테넌시만. 견학 모듈 미착수 |
| 13 | REQ-COM-* 커뮤니티 고도화 | **Not started** | 테넌시만. 분류/신고/태그 등 미착수 |
| 14 | networking 테넌시 | **Not started** | `backend/routes/networking.js`에 school_id/가드 없음 |
| 15 | Playwright / 브라우저 페르소나 | **Fail** | node:test만 |

### Sprint 2 검증 잔여 추적

| 이전 리스크 | Sprint 3 이후 | 메모 |
|-------------|---------------|------|
| posts/announcements 전교 노출 | **해소** (API) | school filter + 403 테스트 |
| `GET /api/files` 동일교 누수 | **해소** (resume_pdf) | peer 403 테스트. counseling fall-through도 false로 닫힘 |
| admin-board LS | **해소** (코드) | recentNews/educationPrograms → API |
| profile board-ish LS | **부분 해소** | /auth/me 우선 |
| Playwright / UI DoD | **미해소** | |
| networking | **미해소** | |
| 추천·견학 | **미해소** | Sprint 3 본체 잔여 |

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test --test-concurrency=1 tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** |
| `backend/tests/sprint1-documents.test.js` | **9/9 pass** |
| `backend/tests/sprint2-workflow.test.js` | **12/12 pass** |
| `backend/tests/sprint3-community.test.js` | **6/6 pass** |

합계 **39 pass / 0 fail** (2026-09-14 본 세션). Playwright 없음.

커버 (Sprint 3 추가): post GET 타교 403, post list 제외, announcement detail 403, job-fair list 제외, certificate 타교 403, same-school peer resume file 403.

미커버: education-programs 403, announcements CRUD 타교, posts comments/like 교차, networking, UI E2E, 무토큰 optionalAuth 레거시(`school_id IS NULL`) 정책 합의.

## 4. Spec 커버리지 (REQ → Sprint 3 슬라이스)

| REQ | P | Sprint 3 | 메모 |
|-----|---|----------|------|
| REQ-IAM-009 | P0 | **Pass** (posts/ann/cert/edu API) | networking 잔여 |
| REQ-RSM-005 | P0 | **Pass** (파일 프라이버시 보강) | peer resume_pdf 403 |
| REQ-PLT-001 | P0 | **Partial** | board/career/jobs 철거 진행. `company_profile_*`·디버그 HTML·user 캐시 잔여 |
| REQ-COM-001~005 | P0/P1 | **Not started** | 테넌시 ≠ 커뮤니티 고도화 |
| REQ-REC-001~005 | P0 | **Not started** | |
| REQ-TRP-001+ | P0 | **Not started** | announcements school_id만 |
| REQ-MSG-* (P2/게이트) | — | **N/A** | 게이트 unknown. 인앱은 Sprint 2 |

## 5. STATUS 정직성 (`78ba7ee` 기준)

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 3 **35%** | **정직 (30–40%).** 테넌시·파일·B-LS board는 실재. delivery-plan 전체(추천·견학·COM·MSG) 대비 소수 |
| 전체 P0 **약 44%** | **정직 (42–48%).** Sprint 2 모니터 상단(~44%)에서 IAM-009 community + files 가산. REC/TRP/WN 미착수 |
| Phase 3 **78%** | **경계~약간 과대 (72–78%).** posts 장착은 맞음. networking·cron 잔여로 80%+는 과대 |
| QA **65%** | **경계 (58–65%).** 39 API 테스트 가치 있음. E2E 0 |
| 워크넷 **0%** / 추천 **0%** / 견학 **0%** | **정직** |
| 게이트 `unknown` | **정직** |
| B-LS `company_profile_*` 유지 | **정직** (board/profile 소스 이관과 병기 가능) |
| 「전체 39/39」 | **정직** (본 세션 재확인) |

**드리프트:** STATUS 「Sprint 3」를 delivery-plan Wave D 전체와 동일시하면 35%가 낮아 보이지만, 완료 기록이 테넌시 슬라이스를 명시하므로 **문서 내부 정합**. 추천 %를 올리지 않은 점은 양호.

## 6. 잔여 리스크 (구현 금지 — 확인만)

1. **networking** — school 가드 없음. Phase 3 잔여.
2. **education-programs** — 코드 가드만. 교차학교 403 테스트 없음.
3. **optionalAuth + `school_id IS NULL`** — 비로그인/레거시 행 노출 정책 합의 필요.
4. **REQ-COM/REC/TRP** — Sprint 3 본체 미착수.
5. **UI DoD** — admin-board·profile 브라우저 미검증.
6. **B-LS** — `company_profile_*` (setup-test-profile 등).
7. **Sprint 4 병행** — docs 커밋 push 시 충돌 가능.

## 7. 권장 QA (테스트 약화 금지)

1. education-programs: 학교 B 토큰 → 학교 A program GET/PUT = 403.
2. Playwright: admin-board 소식 CRUD → 타교 목록 미노출.
3. 회귀: 39 node:test 유지.
4. networking schoolScope (후속 Sprint).
5. files: counseling 문서 동일교 peer = 403 (코드상 false이나 전용 케이스 권장).

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % (Phase 3 78%→72–76% optional; Sprint 3 35%·P0 44% 유지 권장)
Need: Sprint 3을 「테넌시 슬라이스 완료 / Wave D 본체 미착수」로 읽는 메모 유지

Handoff: verifier/monitor → backend (Sprint 4+)
REQ: REQ-IAM-009 networking, REQ-REC-*, REQ-TRP-*
Need: networking schoolScope. 추천 cron. 견학 모듈

Handoff: verifier/monitor → frontend
REQ: REQ-PLT-001, docs/06 DoD
Need: admin-board/profile 브라우저 검증 기록. company_profile_* 철거 계획

Handoff: verifier/monitor → qa
REQ: docs/08, REQ-IAM-009
Need: Playwright + education-programs 403. 39 node:test 회귀 유지
Done: sprint3-community 6 + 전체 39/39 (2026-09-14)
```
