# Sprint 2 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `73e33a89d88d6e4546afe31e60dc9ac0d9a89ed4` (`feat(jobs): Sprint 2 application workflow, school-scoped jobs/counseling, in-app notify`)
- **포함:** Wave 1·Sprint 1 QA는 부모 히스토리. 본 검증은 `73e33a8` 트리.
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Sprint 2 **부분 통과 (partial)**. jobs/상담 예약·teachers 테넌시, PATCH 지원 상태, 인앱 알림, `GET /api/users` 무토큰 401, 이력서 선택 지원 UI 마크업, Sprint 1 일지 import 수정은 실재. 워크넷 0%, posts/announcements 미격리, Playwright·브라우저 DoD 미충족, `files` 동일교 누수 잔여.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | HTML/CSS/JS + Express |
| 테넌시 (`school_id` + 가드) | **Partial** | jobs(`jobAccess`/`canSeeJob`), counseling teachers·sessions·PUT 가드. **posts/announcements 전교 노출 유지** |
| 시크릿 `.env` 커밋 | **Pass** | 커밋에 시크릿 없음. 테스트가 ALIMTALK env 삭제 |
| 업무 `localStorage` 신규 키 | **Pass** | Sprint 2 diff에 `career_*`/`jobPostings` setItem 없음. B-LS board/profile 잔존 |
| REQ 인용 | **Pass** | 커밋·STATUS·OpenAPI에 REQ-JOB-003/004, REQ-CNS-003, REQ-MSG-010, REQ-IAM-009(jobs/상담) |
| docs 03/04/05 + OpenAPI + STATUS | **Pass** | `012` 마이그레이션, notifications, application PATCH 동반 갱신 |
| 프론트 브라우저 검증 명시 | **Fail** | STATUS 「백엔드 기동 시 확인」은 미래형. 지원 모달·상태 select·대시보드 알림 **E2E 기록 없음** |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋이 backend + API + frontend + QA + docs (Wave 1/Sprint 1과 동일 패턴) |

## 2. Sprint 2 DoD 항목

공통 DoD: `docs/06-delivery-plan.md` §4, Wave C, STATUS 「Sprint 2 완료 기록」.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `012_v2_sprint2_workflow.sql` | **Pass** | `notifications.event_code/channel/school_id/payload`, `jobs.school_id` backfill. idempotent |
| 2 | notify 모듈 (인앱 + 외부 no-op) | **Pass** | `backend/modules/notify/index.js`: `notifyInApp` INSERT, `emit` → alimtalk `NOT_CONFIGURED` when env absent. **키가 있어도 line 16에서 still NOT_CONFIGURED (의도적 스텁)** |
| 3 | jobs list/get/update/applicants 학교 범위 | **Pass** (API) | `appendJobSchoolFilter`, `canSeeJob`, `canManageJob`. 테스트: 목록 B 제외, GET/PUT B → 403 |
| 4 | `PATCH /api/jobs/applications/:id/status` | **Pass** | `applicationStatus.js` 전이 규칙. 잘못된 skip 400. 타교 기업 PATCH 403 |
| 5 | 상태 변경 인앱 알림 (REQ-JOB-004) | **Pass** (API) | `JOB_APPLICATION_STATUS` 레코드 + `GET /api/notifications`. `providers.alimtalk` = NOT_CONFIGURED |
| 6 | 상담 teachers/sessions 테넌시 | **Pass** (API) | `GET /teachers` auth+schoolScope. `PUT /:id` `canAccessSession` + 타교 403 테스트 |
| 7 | 후속상담 인앱 (REQ-CNS-003) | **Pass** (API) | 일지 POST `follow_up_at` → `CNS_FOLLOW_UP` notification |
| 8 | `GET /api/users` 무토큰 401 | **Pass** | sprint2 테스트 + Wave 1 로그인 후 schoolScope 목록 유지 |
| 9 | 지원 시 이력서 선택 UI | **Partial** | `jobs.html` `#applyResumeModal` + `#applyResumeSelect`, `js/jobs.js` modal flow. **브라우저·Playwright 미검증** |
| 10 | admin/applicant 상태 UI | **Partial** (코드) | `admin-jobs.html` applicant status select + PATCH. `applicant-detail.html` 확장. **브라우저 미검증** |
| 11 | 대시보드 인앱 알림 | **Partial** (코드) | `js/dashboard.js` → `api.notifications.list`. UI 미검증 |
| 12 | 상담 타임라인 UI (Sprint 1 잔여) | **Partial** | `counseling-journal.js` timeline API 호출 추가. 페르소나 검증 없음 |
| 13 | Sprint 1 일지 POST `isValidCounselingType` | **Pass** | `counseling-journals.js` require 추가. sprint2 테스트 POST 201 |
| 14 | 워크넷 실연동 | **Not started** | 게이트 `unknown`. STATUS 0% 주장과 일치 |
| 15 | posts/announcements 테넌시 | **Not started** | `backend/routes/posts.js`·`announcements.js` schoolScope 없음 |
| 16 | 브라우저 페르소나 (지원→상태→알림) | **Fail** | Playwright 없음 |

### Wave 1 / Sprint 1 리스크 추적

| 이전 리스크 | Sprint 2 이후 | 메모 |
|-------------|---------------|------|
| jobs 목록 전교 노출 | **해소** | 인증 사용자 학교 필터. 비로그인은 `school_id IS NULL` 레거시만 (`optionalAuth`) |
| 상담 teachers 비로그인·전교 | **해소** | auth + schoolScope. 무토큰 401 |
| 상담 예약 PUT 타교 | **해소** | teacher A → session B 403 테스트 |
| `GET /api/users` 공개 덤프 | **해소** | 무토큰 401 (공개 정책 회귀 없음) |
| 일지 POST ReferenceError | **해소** | import 수정 + 테스트 |
| `GET /api/files` 동일교 타 사용자 | **미해소** | `canReadFile` resume_pdf 분기 후 `assertSameSchool` fall-through (Sprint 1과 동일) |
| CNS-003 후속 알림 | **해소** (인앱) | 알림톡은 NOT_CONFIGURED |
| Playwright / 브라우저 DoD | **미해소** | node:test 33케이스만 |
| admin-board LS | **미해소** | B-LS |
| posts 테넌시 | **미해소** | Sprint 3 핸드오프 |

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test --test-concurrency=1 tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** |
| `backend/tests/sprint1-documents.test.js` | **9/9 pass** |
| `backend/tests/sprint2-workflow.test.js` | **12/12 pass** |

합계 **33 pass / 0 fail** (2026-09-14 본 세션). Playwright 없음.

커버 (Sprint 2 추가): users 무토큰 401, jobs list/get/put 타교, counseling teachers/sessions, apply `resume_id` 선택, status PATCH 워크플로우, 타교 PATCH 403, JOB_APPLICATION_STATUS + providers, CNS_FOLLOW_UP.

미커버: `GET /api/jobs` 무토큰 동작, posts, files 동일교 403, UI E2E, 워크넷, alimtalk CONFIGURED 경로(스텁).

## 4. Spec 커버리지 (REQ → Sprint 2)

| REQ | P | Sprint 2 | 메모 |
|-----|---|----------|------|
| REQ-JOB-003 | P0 | **Pass** (API) | pending→reviewed→interviewed→accepted. UI PATCH는 코드만 |
| REQ-JOB-004 | P0 | **Partial** | 인앱 필수 충족. 알림톡은 NOT_CONFIGURED no-op (게이트와 일치) |
| REQ-JOB-005 | P0 | **Pass** (API) | 선택 `resume_id` 테스트. UI 마크업 있음 |
| REQ-CNS-003 | P0 | **Partial** | 후속일 인앱. 예약 생성 시 `CNS_RESERVATION` counselor 알림 코드 있음. **알림톡 없음** |
| REQ-CNS-006 | P0 | **Partial** | 예약·teachers 격리 개선. 일지는 기존 가드 |
| REQ-MSG-010 | P0 | **Partial** | `emit` + notifications API + dashboard hook. provider는 스텁 |
| REQ-IAM-009 | P0 | **Partial** | jobs/상담 가드. **posts/announcements 미장착** |
| REQ-WN-* | P0 (게이트) | **Not started** | OUT of 실연동 until gate ready |

Sprint 2 범위 밖(확인): 추천·견학·커뮤니티(Sprint 3), Playwright(Phase 4).

## 5. STATUS 정직성 (`73e33a8` 기준)

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 2 **70%** | **약간 과대 → 58–68%.** 핵심 API·테스트는 강함. 워크넷 0%, posts open, E2E 0, UI DoD 미충족 |
| 전체 P0 **약 42%** | **대체로 정직 (38–44%).** Sprint 1 모니터 ~30%에서 JOB/CNS/MSG 인앱·jobs 가드 가산. WN/추천/견학 미착수 |
| Phase 3 **70%** | **경계선 (65–72%).** jobs/상담·notify는 실재. posts/announcements·cron 잔여로 80%는 아님 |
| Sprint 1 **95%** | **과대 유지.** Sprint 2가 CNS-003·타임라인 UI 일부 연결했으나 Sprint 1 UI/PDF 검수는 여전히 공백 |
| QA **60%** | **약간 과대 → 55–62%.** 33 API 테스트는 가치 있음. E2E·브라우저 0 |
| 워크넷 **0%** | **정직** |
| 게이트 `unknown` | **정직** |
| 「브라우저: 기동되면 확인」 | **허위 완료 소지** — 수행 기록 아님 |

**드리프트:** delivery-plan Sprint 2 DoD는 「통합 목록 + 상태 알림(인앱)」인데, 워크넷 통합 목록은 게이트로 빠져 있고 STATUS가 이를 명시함 — **정합**. 다만 Phase 3 70%는 posts 미장착을 읽는 사람이 놓치기 쉬움.

## 6. 잔여 리스크 (구현 금지 — 확인만)

1. **posts/announcements** — 전교 CRUD. Sprint 3 전 타교 게시물 노출 가능.
2. **`GET /api/jobs` optionalAuth** — 비로그인은 `school_id IS NULL` 공고만. 레거시 데이터 정책 합의 필요.
3. **files 동일교 누수** — 지원 워크플로우·기업 PDF 열람 전에 가드 보강 권장.
4. **notifyExternal 스텁** — 키가 있어도 발송하지 않음. 게이트 `ready` 후 별도 구현 필요.
5. **UI DoD** — 이력서 선택 모달·상태 select·알림 패널 브라우저 미검증.
6. **B-LS** — admin-board 등.
7. **Sprint 3 병행** — 구현 에이전트가 main에 push할 때 본 docs 커밋과 충돌 가능.

## 7. 권장 QA (테스트 약화 금지)

1. Playwright: 학생 → jobs 지원(이력서 선택) → 기업 상태 변경 → 학생 알림 패널.
2. `GET /api/files/:id` 동일 학교 타 학생 = 403.
3. posts: 학교 A 토큰으로 학교 B 게시물 목록에 없음 (Sprint 3 가드 후).
4. 회귀: Wave 1 10 + Sprint 1 9 + Sprint 2 12 유지.
5. WN/MSG 게이트 닫히기 전 alimtalk skip은 fail 아님.

## 8. 핸드오ff

```
Handoff: verifier/monitor → architect
REQ: STATUS % (Sprint 2 70%→~62% optional, Sprint 1 95%→~80% optional)
Need: posts 잔여를 Phase 3 메모에 유지. 브라우저 미검증을 완료로 쓰지 말 것

Handoff: verifier/monitor → backend (Sprint 3)
REQ: REQ-IAM-009, posts/announcements
Need: posts.js·announcements.js schoolScope. files canReadFile fall-through

Handoff: verifier/monitor → frontend
REQ: REQ-JOB-003/005, docs/06 DoD
Need: 지원 모달·admin 상태·dashboard 알림 브라우저 검증 기록

Handoff: verifier/monitor → qa
REQ: docs/08, REQ-JOB-004
Need: Playwright + files 동일교 403. 33 node:test 회귀 유지
Done: sprint2-workflow 12케이스 (2026-09-14)
```
