# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Sprint 3 (커뮤니티·공지 테넌시 · 파일 프라이버시)**  
전체 P0 구현: **약 44%** (Wave 1 IAM + Sprint 1 문서 + Sprint 2 워크플로우 + Sprint 3 posts/announcements/certificates/education-programs 가드·파일 403. 워크넷·추천·견학 미착수)

## Gates (학교 제공물)

| 게이트 | 상태 | 영향 |
|--------|------|------|
| 워크넷(고용24) OpenAPI 키 | `unknown` | REQ-WN-* 실연동 보류 가능 |
| SMS/알림톡 유료 계정 | `unknown` | REQ-MSG-* 실발송 과업 제외 가능 |

Architect가 확인 후 `ready` / `blocked`로 바꾼다.

## Phases

| Phase | 내용 | Owner | % | 상태 |
|-------|------|-------|---|------|
| 0 | 비전/요구/아키텍처/역할, v2 저장소 | architect | 100 | done |
| 1 | 착수 보고·게이트 확인·현행 이슈 목록 | architect | 0 | todo |
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 80 | in-progress (OpenAPI Sprint 2) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 78 | in-progress (IAM + storage + jobs/상담 + posts/announcements/certificates/education. networking 잔여) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 95 | done (CNS-003 인앱은 Sprint 2에서 연결) |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 70 | in-progress (상태 PATCH·인앱·테넌시. **워크넷 0%**) |
| Sprint 3 | 커뮤니티·공지 테넌시·B-LS | backend + api + frontend | 35 | in-progress (posts/announcements/certificates 가드. 추천·견학·메시지 미착수) |
| 4 | 테스트·UAT·보안 | qa | 55 | in-progress (Wave1 + Sprint1/2/3 API 테스트 39건. Playwright 없음) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 82 | posts/announcements/certificates/education-programs + files 동일교 프라이버시. networking 잔여 |
| IAM API·OpenAPI | api | 85 | Sprint 2 application status + notifications OpenAPI |
| 권한 메뉴·schools UI | frontend | 70 | permissions 메뉴, 회원가입/코드관리 schools API, test_token 제거 |
| 이력서 PDF | backend/frontend | 90 | 011 스키마, `/api/resumes`, career.html API, 한글 PDF |
| 상담 문서 | backend/frontend | 95 | PDF/DOCX, stats/timeline UI, CNS-003 후속 인앱 |
| 채용 워크플로우 알림 | api/frontend | 70 | PATCH status, 이력서 선택 지원, 기업/관리 상태 UI, 인앱 알림 |
| 워크넷 | backend | 0 | 게이트 unknown. 실연동 없음 |
| 추천 엔진 | backend | 0 | |
| 견학 모듈 | backend/frontend | 0 | announcements 이관 |
| 커뮤니티 고도화 | api/frontend | 0 | |
| 알림톡/SMS | backend | 15 | notify no-op + `NOT_CONFIGURED`. 실발송 없음 |
| QA 스위트 | qa | 65 | Wave 1 + sprint1 + sprint2 + sprint3-community |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/3 일부 | architect |
| B-LS | company_profile_* 등 잔여 LocalStorage | 재입력 안내 | architect |

해소: **B-PORT** — 프론트 `js/api.js` 로컬 API를 **5000**으로 통일 (compose/backend와 동일).  
해소: **B-LS career/admin-jobs** — `career_*` 및 `jobPostings` 폴백 제거. 이력서/공고는 API만.

로컬 백엔드: 기본 `PORT=5000`. macOS AirPlay가 5000을 쓰면 `PORT=5050 npm start` 후 브라우저는 `js/api.js`가 5000을 가리키므로 프록시하거나 일시적으로 API_BASE를 맞출 것.

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Phase 0 완료 기록

- v1 소스 분석 (graduate-network `main` / `7f331fc`)
- 고도화 과업지시서 반영한 docs 00–08
- Cursor 규칙/스킬 및 `AGENTS.md`
- GitHub v2: https://github.com/jsyang9455/graduate-network-v2 (public). 원본은 remote `v1`.

## Wave 1 완료 기록 (REQ-IAM-001~010, REQ-PLT-001/003)

- 마이그레이션 `database/migrations/010_v2_multischool.sql` (전주공업고 시드, `users.school_id` backfill)
- 미들웨어 `authorize` / `schoolScope`, JWT `role`+`school_id`, `POST /api/auth/change-password` 토큰 필수
- 프론트: 권한 메뉴, `register.html`/`admin-codes.html` → `/api/schools`, `test_token_` 우회 삭제
- QA: `backend/tests/wave1-tenancy.test.js` (학교 2곳, 타교 403)

```
Handoff: wave1-owner → frontend
REQ: REQ-RSM-001, REQ-PLT-001
Need: career.html LocalStorage → resumes API (Sprint 1)
Done: schools LocalStorage 철거, 권한 메뉴, port 5000

Handoff: wave1-owner → backend
REQ: REQ-PLT-004, REQ-CNS-004
Need: files 스토리지 어댑터, 상담 PDF/DOCX (Wave B)
Done: IAM 스키마/가드/audit

Handoff: wave1-owner → qa
REQ: REQ-IAM-009
Need: Playwright 페르소나 E2E (로그인→메뉴). API 타교 403은 node:test로 커버
Done: 2교 픽스처 + 통합 테스트
```

## Wave 1 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/wave1-verification.md](qa/wave1-verification.md).

- 커밋 `bb64a39`: IAM 기반은 실재. 판정 **partial** (전체 Pass 아님).
- `npm --prefix backend test`: **12/12 pass** (roles 2 + tenancy 10). Playwright 없음.
- STATUS 「REQ-IAM-001~010 완료」·Phase 3 **55%**는 **과대**. 모니터 추정: 전체 P0 **14–16%**, Phase 3 **35–45%**. 위 표 %는 Sprint 1 에이전트와 충돌하지 않도록 여기서 바꾸지 않음 — Architect가 정정.
- Sprint 1 전 블로커급: `files` 스토리지 없음, `career.html` LS, jobs/상담예약 테넌시 미장착, `GET /api/users` 로그인 필수 회귀.
- 게이트 Worknet/Alimtalk `unknown`, **B-LS** 유지. B-PORT 해소는 확인.

Sprint 1 이후 업데이트: `files` 스토리지·`career.html` API 이관은 본 커밋에서 해소. jobs 목록 테넌시·GET /api/users 회귀는 잔여 (Sprint 2/QA).

## Sprint 1 완료 기록 (REQ-RSM-001~005, REQ-CNS-001/002/004/005, REQ-PLT-001/004, REQ-JOB-005)

- 마이그레이션 `database/migrations/011_v2_sprint1_resumes.sql`
- 스토리지 `backend/modules/storage` (local 기본, S3는 자격 있을 때만)
- 문서 `backend/modules/documents` (한글 폰트 PDF, DOCX)
- API: `/api/resumes*`, `/api/files/:id`, counseling pdf/docx/stats/timeline, apply `resume_id`
- 프론트: `career.html`/`js/career.js` API, `admin-jobs` LS 폴백 제거, 상담 내보내기, 공고 지원 시 대표 이력서
- QA: `backend/tests/sprint1-documents.test.js` (CRUD, PDF smoke, apply, 타교 403). Wave 1 테스트 유지

브라우저 검증: 백엔드가 기동되면 career 이력서 저장·PDF, 상담 PDF/DOCX를 확인. AirPlay가 5000을 점유하면 다른 PORT.

```
Handoff: sprint1-owner → frontend
REQ: REQ-JOB-003/004
Need: 지원 상태 PATCH UI, 지원 시 이력서 선택 드롭다운 고도화 (현재 대표 자동)
Done: career API, apply resume_id, admin-jobs LS 제거

Handoff: sprint1-owner → backend
REQ: REQ-CNS-003, REQ-JOB-004, REQ-MSG-010
Need: 후속상담·지원 상태 인앱 알림
Done: 상담 PDF/DOCX, files 스토리지

Handoff: sprint1-owner → qa
REQ: REQ-RSM-004, REQ-CNS-004
Need: Playwright 페르소나 (이력서 마법사→PDF, 교사 문서 다운로드)
Done: node:test 통합 (PDF magic bytes, 타교 403)

Handoff: sprint1-owner → api
REQ: REQ-JOB-003
Need: PATCH /api/jobs/applications/:id/status + OpenAPI (Sprint 2)
Done: apply resume_id, resumes OpenAPI
```

## Sprint 1 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/sprint1-verification.md](qa/sprint1-verification.md). **기준 커밋 `4ef8a38`(Sprint 1 주장 90% / P0 34%).** 위 표의 Sprint 2 WIP %는 이 절에서 바꾸지 않음.

- 커밋 `4ef8a38`: 이력서 API·로컬 스토리지 어댑터·PDF `%PDF`·apply `resume_id`·career/admin-jobs LS 철거는 실재. 판정 **partial**.
- `npm --prefix backend test` (Sprint 1 트리): **21/21 pass** (roles 2 + sprint1 9 + tenancy 10). Playwright 없음. career/PDF UI는 **미검증**.
- `4ef8a38` 당시 STATUS Sprint 1 **90%**·전체 P0 **34%**는 **과대**. 모니터 추정: Sprint 1 **70–75%**, P0 **28–32%**, Phase 3 **55–65%**. Architect가 정정.
- 해소: REQ-PLT-004 스토리지, career LS, admin-jobs `jobPostings` 폴백, 유형 진학/생활(스키마/UI).
- `4ef8a38` 잔여(당시 미구현): jobs 목록 테넌시, 상담 예약/`GET /counseling/teachers`, `GET /api/users` 로그인 필수 회귀, 일지 POST `isValidCounselingType` import 누락, `GET /api/files` 동일교 타 사용자 가능.
- 게이트 Worknet/Alimtalk `unknown` 유지. B-LS는 board/profile 잔여.

## Sprint 2 완료 기록 (REQ-JOB-003/004, REQ-CNS-003, REQ-MSG-010, REQ-IAM-009 jobs/상담)

- 마이그레이션 `database/migrations/012_v2_sprint2_workflow.sql` (`notifications` event/channel, jobs.school_id 백필)
- notify 모듈: 인앱 기록 + 알림톡/SMS **NOT_CONFIGURED no-op** (실발송 없음)
- Jobs school-scope: list/get/update/applicants. 타교 GET/PUT 403
- `PATCH /api/jobs/applications/:id/status` 워크플로우 + 지원자 인앱 알림
- Counseling `GET /teachers`, sessions list/update: 로그인 + 학교 범위. 타교 403
- `GET /api/users` 무토큰 401 유지. counseling teachers 폴백은 JWT `api.get`
- 프론트: 지원 시 이력서 선택, admin-jobs/applicant-detail 상태 UI, 상담 학생 타임라인, 대시보드 인앱 알림
- 상담일지 POST `isValidCounselingType` require 누락 수정 (Sprint 1 검증 잔여)
- QA: `backend/tests/sprint2-workflow.test.js`
- 워크넷 실연동 **안 함**. Playwright **안 함**. posts/announcements 테넌시는 잔여
- Phase 3를 80%로 올리지 않음 (Wave 1/Sprint 1 검증의 과대 보고를 반영해 70%)

브라우저: 백엔드 기동 시 지원 모달·상태 select·타임라인 확인. AirPlay가 5000이면 `PORT=5050`.

```
Handoff: sprint2-owner → qa
REQ: REQ-JOB-003/004, REQ-IAM-009
Need: Playwright 페르소나 (지원 이력서 선택→상태 변경→알림). API는 node:test
Done: jobs/상담 타교 403, status PATCH, 인앱 알림 레코드

Handoff: sprint2-owner → backend
REQ: REQ-WN-*, posts 테넌시
Need: 워크넷 게이트, posts/announcements schoolScope (Sprint 3)
Done: jobs + counseling 예약 가드, notify 스켈레톤
```

## Sprint 3 완료 기록 (REQ-IAM-009 posts/announcements/certificates, REQ-RSM-005 files, REQ-PLT-001 B-LS)

- 마이그레이션 `database/migrations/013_v2_sprint3_community_tenancy.sql` (`announcements`/`certificates`/`education_programs`.`school_id`, posts backfill)
- `backend/lib/schoolResourceAccess.js` — optionalAuth 목록 필터 + 타교 403
- Routes: `posts`, `announcements`, `certificates`, `education-programs` school scope
- `GET /api/files/:id` — 동일 학교 다른 학생의 `resume_pdf` / counseling 파일 fall-through 차단 (403)
- 프론트: `admin-board.html` → `/api/posts`, `/api/education-programs`. `profile.html` → `/api/auth/me` 우선
- QA: `backend/tests/sprint3-community.test.js` (6 tests). 전체 **39/39 pass**
- 미착수: REQ-REC-*, 견학 이관, networking 테넌시, 워크넷, Playwright

```
Handoff: sprint3-owner → backend
REQ: REQ-REC-*, REQ-WN-*
Need: 추천 cron, 워크넷 게이트
Done: community/announcement tenancy, file privacy, admin-board API

Handoff: sprint3-owner → qa
REQ: REQ-IAM-009
Need: Playwright 페르소나 (게시판·공지). API 타교 403은 node:test
Done: sprint3-community 6 cases + same-school file 403
```

## Sprint 2 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/sprint2-verification.md](qa/sprint2-verification.md). **기준 커밋 `73e33a8`(Sprint 2 주장 70% / P0 42%).** 위 표 %는 본 절에서 재조정하지 않음 — Architect 선택.

- 커밋 `73e33a8`: jobs/상담 테넌시·PATCH 지원 상태·인앱 notify·이력서 선택 UI 마크업·users 무토큰 401·일지 import 수정은 실재. 판정 **partial**.
- `npm --prefix backend test`: **33/33 pass** (roles 2 + wave1 10 + sprint1 9 + sprint2 12). Playwright 없음. 지원 모달·상태 UI·대시보드 알림 **브라우저 미검증**.
- STATUS Sprint 2 **70%**·P0 **42%**는 **경계~약간 과대**. 모니터 추정: Sprint 2 **58–68%**, P0 **38–44%**, Phase 3 **65–72%** (posts open). 워크넷 **0%** 주장은 정직.
- Sprint 1 검증 잔여 해소: jobs 목록·상담 teachers/PUT 타교, `GET /api/users` 401, `isValidCounselingType`, CNS-003 인앱( API ).
- 잔여: posts/announcements 테넌시, `GET /api/files` 동일교 누수, B-LS board/profile, Playwright, UI DoD.
- 게이트 Worknet/Alimtalk `unknown` 유지. notify alimtalk는 env 없을 때 `NOT_CONFIGURED` (의도적 no-op).

## Sprint 3 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/sprint3-verification.md](qa/sprint3-verification.md). **기준 커밋 `78ba7ee`(Sprint 3 주장 35% / P0 ~44%).** 위 표 %는 본 절에서 재조정하지 않음 — Architect 선택.

- 커밋 `78ba7ee`: posts/announcements/certificates/education-programs 학교 가드·타교 403, `GET /api/files` 동일교 peer `resume_pdf` 403, admin-board API 이관, profile `/auth/me` 우선은 실재. 판정 **partial**.
- `npm --prefix backend test`: **39/39 pass** (roles 2 + wave1 10 + sprint1 9 + sprint2 12 + sprint3 6). Playwright 없음. admin-board/profile **브라우저 미검증**.
- STATUS Sprint 3 **35%**·전체 P0 **약 44%**는 **대체로 정직** (모니터: Sprint 3 **30–40%**, P0 **42–48%**). Phase 3 **78%**는 **경계~약간 과대 (72–78%)**. QA **65%**는 경계.
- Sprint 2 검증 잔여 해소: posts/announcements 테넌시, files 동일교 누수(resume_pdf), admin-board LS.
- 잔여: networking 테넌시, REQ-REC/TRP/COM 본체, education-programs 전용 403 테스트, Playwright, B-LS `company_profile_*`.
- 게이트 Worknet/Alimtalk `unknown` 유지. 워크넷·추천·견학 **0%** 주장은 정직.
