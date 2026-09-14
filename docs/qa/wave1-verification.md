# Wave 1 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `bb64a39c8545f15cb5654ff897c573b87d843312`
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Wave 1 IAM **부분 통과 (partial)**. 기반(스키마·JWT·schools API·일부 403)은 실재하나, `docs/STATUS.md`의 「REQ-IAM-001~010 완료」는 과대 보고.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | HTML/CSS/JS + Express. React/Next 없음 |
| 테넌시 패턴 (`school_id` + authorize) | **Partial** | 미들웨어·users/journals/schools에는 적용. jobs/posts/counseling/announcements 등은 미장착 |
| 시크릿 `.env` 커밋 | **Pass** | `backend/.env` gitignore. 커밋에 `.env` 없음 |
| 업무 `localStorage` 신규 키 | **Pass** | Wave 1은 `schools` LS 철거. 신규 업무 키 없음. 잔존 키는 아래 Gaps |
| REQ 인용 | **Pass** | 커밋 메시지 `REQ-IAM-001–010, REQ-PLT-001/003` |
| docs 03/04/05 + OpenAPI + STATUS | **Pass** | 같은 커밋에서 갱신 |
| 프론트 브라우저 검증 명시 | **Fail** | UI(회원가입·코드관리·권한 메뉴) 변경. STATUS/커밋에 페르소나 브라우저 검증 기록 없음 (`docs/06` DoD, `docs/07` Frontend) |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋이 backend + API + frontend + QA + docs를 모두 포함. 아키텍처 위반은 아님 |

파일 glob은 Wave 1 「오너」 메가커밋 기준으로는 영역이 맞다. 다만 AGENTS.md 헌장의 세션 분리 규칙은 지키지 않았다.

## 2. Wave 1 DoD 항목

공통 DoD: `docs/06-delivery-plan.md` §4, Wave A 체크리스트, 구현자가 주장한 산출물.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `010_v2_multischool.sql` | **Pass** | `schools`/`departments`/`roles`/`menus`/`role_menu_permissions`/`user_roles`/`school_transfers`/`audit_logs`, `users.school_id`, journals/sessions/jobs/posts 컬럼. idempotent (`IF NOT EXISTS` / `ON CONFLICT`) |
| 2 | 시드 전주공업고 + `users.school_id` backfill | **Pass** | 코드 `JJTH`. 테스트가 목록에서 확인. 기업 제외 backfill |
| 3 | JWT `role` + `school_id` | **Pass** | `backend/lib/jwt.js` `signUserToken`. 통합 테스트 디코드 확인. `admin` → `system_admin` |
| 4 | `GET/POST /api/schools`, `GET/PATCH /:id`, departments | **Pass** | `backend/routes/schools.js`. 공개 활성 목록(회원가입). POST는 `authorize('schools','manage')` |
| 5 | `GET /api/me/permissions` | **Pass** | `backend/routes/me.js` + RBAC 매트릭스. 테스트: teacher에 counseling `write` |
| 6 | `POST /api/auth/change-password` JWT 필수 | **Pass** | `auth` 미들웨어. 무토큰 401 테스트 통과 |
| 7 | `test_token_` / `user_token_` 우회 제거 | **Pass** | 런타임 `js/api.js`·백엔드에 우회 없음. 가짜 `test_token_fake` → `/api/auth/me` 401 |
| 8 | API 포트 5000 통일 | **Pass** | `js/api.js`, compose, `server.js` 기본, dashboard/counseling-journal 로컬 URL. **B-PORT 해소 인정** |
| 9 | 타교 403 | **Partial** | users GET by id, users 목록, counseling-journals GET by id, schools PATCH — 테스트 통과. **jobs / posts / counseling sessions / announcements / education-programs / networking / certificates 는 schoolScope 없음** |
| 10 | `school_admin` 역할 6종 | **Partial** | DB 시드 6역할 + `users.user_type` CHECK. 지정 API `POST /api/users/:id/roles` 있음. 전용 UI/`admin-permissions.html` 없음. 회원가입 validator가 여전히 `admin` 허용 |
| 11 | 권한 메뉴 프론트 | **Partial** | `js/auth.js`가 `/api/me/permissions`로 링크 숨김. HTML에 `data-menu` 없음 — href 휴리스틱만. Playwright/브라우저 검증 기록 없음 |
| 12 | `GET /api/audit-logs` + 권한 변경 감사 | **Partial** | 라우트·school 범위 있음. school CRUD, role assign, transfer, 비밀번호, user update에 `writeAudit`. 모든 권한 변경을 커버하진 않음 |
| 13 | Wave A: files/storage, notify 스켈레톤 | **Fail** (Wave 1 범위 밖, 핸드오프됨) | `modules/storage`, `modules/notify`, `files` 테이블 없음. Sprint 1 PDF의 선행 의존 |

### 구현자가 밝힌 갭 (확인)

| 갭 | 확인 | 영향 |
|----|------|------|
| jobs 테넌시 미완 | **사실** | `jobs.school_id` 컬럼만 추가. `backend/routes/jobs.js`는 필터/가드 없음. 공고는 전교 노출 |
| `career.html` LocalStorage | **사실** | `career_experiences` 등 잔존. REQ-PLT-001 / Sprint 1 이력서의 직접 충돌 |
| Playwright 없음 | **사실** | 의존성·스펙 파일 없음. API 403만 `node:test` |
| `GET /api/users` 로그인 필수 | **사실** | `auth` + `schoolScope`. **호환 깨짐:** `js/dashboard.js` 네트워크 수, `js/networking.js` 회원 검색, `js/counseling.js`의 **Authorization 없는** `/users?user_type=teacher` 폴백은 401 |

### 추가 발견 (구현자 미기재)

- `GET /api/schools?include_inactive=true`는 Bearer **문자열 존재만** 보고 비활성 학교를 반환. JWT 검증·역할 검사 없음.
- `GET /api/users`에 `authorize('users','read')` 없음. 매트릭스상 학생/졸업생은 회원 메뉴 「–」인데, 로그인만 되면 소속교 회원(전화·이메일) 목록 가능.
- `GET /api/users/stats`, `GET /api/users/graduate-profile/:userId`, `GET /api/counseling/teachers`는 비로그인·비교 범위. 후자는 **전교 상담교사 이메일** 노출.
- `GET/PUT /api/roles/:code/permissions` 미구현 (`docs/04` 신규 목록에는 있으나 Wave 1 구현 문장에는 없음).
- `classes`(반) 테이블 없음 → REQ-IAM-002 부분.
- `admin-jobs.html` `jobPostings` LS 폴백, `admin-board.html` `recentNews`/`educationPrograms` LS 잔존.
- `docker-compose.yml` JWT 평문 기본값 유지 (REQ-NFR-010, 운영 이슈. Wave 1 미해결).

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** (DB 불필요) |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** (로컬 Postgres 기존재. 이 세션에서 DB를 설치하지 않음) |

합계 **12 pass / 0 fail**. 워크스페이스에 `backend/.env`는 없음. 테스트가 기존 로컬 Postgres에 붙어 마이그레이션 skip 후 픽스처를 upsert했다(기존 테스트 동작). 프로덕션 시크릿으로 DB를 새로 설치하지 않았다.

커버: 학교 목록, permissions, JWT 클레임, change-password 401, test_token 거부, 타교 user 403, 목록에서 B교 학생 제외, 타교 일지 403, system_admin 열람, school_admin의 타교 PATCH 403.

미커버: jobs 테넌시, 메뉴 E2E, departments 쓰기, transfer/roles API, include_inactive, 비로그인 GET /users.

## 4. Spec 커버리지 (REQ → Wave 1)

과업지시서 Ⅲ.1.1(학교·사용자·권한) + `docs/01-requirements.md`.

| REQ | P | Wave 1 | 메모 |
|-----|---|--------|------|
| REQ-IAM-001 | P0 | **Partial** | 학교 CRUD API + admin-codes. 전용 `admin-schools.html` 없음. 비활성화만 |
| REQ-IAM-002 | P0 | **Partial** | departments GET/POST. 반(`classes`) 없음. 회원가입 전공은 여전히 전역 `/api/majors` |
| REQ-IAM-003 | P0 | **Partial** | `school_admin` + `POST /users/:id/roles`. 화면에서 부장교사 지정 UX 없음 |
| REQ-IAM-004 | P0 | **Pass** | 학생/교사 가입 시 학교 필수. `school_id` FK |
| REQ-IAM-005 | P0 | **Partial** | `POST /users/:id/transfer` + `school_transfers`. UI 없음 |
| REQ-IAM-006 | P0 | **Pass** | 6역할 시드. v1 `admin` 호환 매핑. 가입 API가 `admin`을 아직 받음 |
| REQ-IAM-007 | P0 | **Partial** | `user_roles` 동기화, 1인 1주역할 |
| REQ-IAM-008 | P0 | **Partial** | DB 매트릭스 ≈ 과업 예시. 화면 숨김. **API는 동일 정책이 아님** (authorize 미장착 라우트 다수) |
| REQ-IAM-009 | P0 | **Partial** | users·일지·학교 PATCH만. jobs 등 업무 테이블 누수 가능 |
| REQ-IAM-010 | P0 | **Partial** | `audit_logs` + 일부 액션 |
| REQ-IAM-011 | P1 | Skip | 위임/예외 — 범위 밖 |
| REQ-PLT-001 | P0 | **Partial** | schools LS 제거. career/admin-jobs/admin-board LS 잔존. 프로필 캐시 `graduateNetwork_user`는 JWT 외 잔존 |
| REQ-PLT-002 | P0 | **Partial** | 핵심 테이블에 컬럼. 쿼리에서 미사용(jobs) |
| REQ-PLT-003 | P0 | **Partial** | 가드 모듈 존재, 전 라우트 장착 아님 |
| REQ-RSM-* / REQ-CNS-* (문서) | P0 | **Not started** | Sprint 1. 유형 코드 불일치(진로 vs 진학/생활) 잔존 |
| REQ-JOB/REC/TRP/COM | P0 | **Not started** | |
| REQ-WN-* / REQ-MSG-* | P2 | **Gate unknown** | 실연동 없음. 스텁 `REQ-WN-010`/`REQ-MSG-010`도 미착수 |
| REQ-NFR-010 | P0 | **Fail** | compose JWT 하드코딩 유지 |

**P0 전체 대비:** IAM 10개 중 완료로 볼 수 있는 것은 004, 006 정도. 나머지 IAM은 부분. PLT-001/003은 부분. 이력서·상담·채용·추천·견학·커뮤니티 0.

## 5. STATUS 정직성

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| 전체 P0 **약 18%** | **약간 과대.** 정직 구간 **14–16%**. IAM 기반만으로는 18%가 상한. 「001~010 완료」로 읽히면 과장 |
| Phase 3 **55%** | **과대.** Wave A 9항 중 스토리지·notify·LS 전면 철거 미완. Phase 3(가드+스토리지+문서/알림 스켈레톤+cron) 기준 **약 35–45%**가 맞음. IAM 슬라이스만이면 ~65% |
| 멀티스쿨 스키마/가드 **80%** | **과대 → ~65%.** 스키마는 강함. jobs/posts/상담예약 가드 공백 |
| IAM API **70%** | **대체로 정직** (schools/me/audit/roles/transfer). `roles/:code/permissions` 공백 |
| 권한 메뉴 UI **70%** | **약간 과대 → ~60%.** 휴리스틱 메뉴, 브라우저 미검증 |
| QA **35%** / Phase 4 **20%** | **정직.** 타교 픽스처는 가치 있음. E2E 없음 |
| 게이트 Worknet/Alimtalk `unknown` | **정직.** B-GATE 유지 |
| B-LS | **정직.** career/admin-jobs 확인 |
| B-PORT 해소 | **정직** |
| Sprint 1 **0%** | 이 검증 시점 기준 맞음 (병렬 에이전트 작업은 이 파일이 아님) |

**드리프트:** 문서/STATUS는 Wave 1을 IAM 완료처럼 적었으나, 과업지시서 「화면·API 동일 정책」「교사·학교관리자는 소속 학교 데이터만」은 jobs·상담예약·게시글에서 아직 거짓이다.

13주 계획(`docs/06`): W4–6 Phase 3 중 IAM Wave는 착수·상당 부분 구현. 스토리지·cron·문서 스켈레톤은 지연. Phase 1(착수 보고·게이트 확인) **0%**는 문서 부채 — Architect가 게이트를 `unknown`으로만 둔 상태.

## 6. Sprint 1 계속 전 리스크

1. **스토리지 어댑터 없음 (REQ-PLT-004)** — 이력서/상담 PDF를 DB URL 문자열로 임시 저장하면 재작업. Backend 핸드오프를 Sprint 1 선행으로 처리.
2. **`career.html` LS (REQ-RSM-001 / PLT-001)** — PDF를 LocalStorage 위에 쌓지 말 것. resumes API가 진실 공급원이어야 함.
3. **상담 유형 불일치 (REQ-CNS-001)** — v1 `진로/취업/심리/학습/기타` vs 과업 `진학/취업/생활/심리`. 문서 템플릿 전에 코드 확정.
4. **상담 테넌시 구멍** — journals는 가드됨. `GET /api/counseling/teachers`·sessions 라우트는 전교. 상담 문서 다운로드가 예약/교사 목록을 타면 타교 누수.
5. **jobs 미격리** — 지원 시 `resume_id` 첨부는 가능해도 공고가 전교 공개. 학교별 공고 정책을 Sprint 2로 명시하거나, PDF 첨부와 동시에 school_id를 쓰도록 Backend에 요청.
6. **`GET /api/users` 401** — 네트워킹·대시보드·상담 폴백 회귀. Sprint 1 UI 검증 시 로그인 토큰 필수.
7. **권한 메뉴 ≠ API** — 숨긴 URL도 jobs 등 v1 라우트는 403이 아닐 수 있음.
8. **게이트 unknown** — Sprint 1(문서)은 P2와 무관. Sprint 2 워크넷을 일정에 넣지 말 것.

## 7. Sprint 1 이후 권장 QA

1. Playwright(또는 동등 브라우저) 페르소나: 회원가입(학교 select) → 로그인 → 역할별 메뉴 숨김. **teacher가 admin-codes/users를 못 보게.**
2. 타교 시나리오 확장: jobs GET/PUT, posts, counseling sessions/teachers, announcements — 403 또는 빈 목록. 기존 tenancy 테스트를 **약하게 만들지 말 것.**
3. 이력서: 단계 저장 → 대표 지정 → 한글 폰트 PDF 다운로드 (REQ-RSM-001~004). 타교 교사 PDF 403.
4. 상담: 유형 진학/생활 저장 → PDF/DOCX (REQ-CNS-001/004). school_admin만 소속 일지, teacher는 본인 작성분.
5. 회귀: 비로그인 `GET /api/users` = 401일 때 dashboard/networking/counseling 폴백이 빈 화면이 아닌 안내인지.
6. `include_inactive`는 검증된 JWT + schools 권한 없이 200이면 실패로 기록.
7. LocalStorage: `career_*`, `jobPostings`, `schools`, `recentNews` setItem이 신규 경로에 없으면 Pass.
8. 게이트 꺼진 WN/MSG는 skip이지 fail이 아님.

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % 정정 (Phase 3 55%→~40%, IAM-001~010 「완료」 철회)
Need: 게이트 unknown 유지. Phase 1 착수보고 공백

Handoff: verifier/monitor → backend
REQ: REQ-IAM-009, REQ-PLT-003/004
Need: jobs/posts/counseling(sessions, teachers) schoolScope; files 스토리지; include_inactive JWT 검증
Done: Wave 1 스키마·users/journals 403은 테스트 통과

Handoff: verifier/monitor → frontend
REQ: REQ-PLT-001, REQ-IAM-008
Need: career LS 제거(Sprint 1), admin-jobs LS 폴백 삭제, data-menu, 브라우저 검증 기록
Done: schools API 가입/코드관리, test_token 제거, port 5000

Handoff: verifier/monitor → qa
REQ: REQ-IAM-009, docs/08
Need: Playwright + jobs 테넌시 케이스. 기존 12테스트는 유지
Done: node:test 12/12 pass (2026-09-14)
```
