# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Sprint 1 (이력서 PDF · 상담 문서)**  
전체 P0 구현: **약 34%** (Wave 1 IAM + Sprint 1 이력서/상담 문서. 워크넷·추천·견학 미착수)

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
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 70 | in-progress (OpenAPI Sprint 1) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 80 | in-progress (Wave 1 IAM + local/S3 스토리지) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 90 | in-progress (PDF/DOCX·career API. CNS-003 후속 알림은 Sprint 2/3) |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 5 | todo (apply resume_id만 선행) |
| Sprint 3 | 추천·견학·커뮤니티·메시지 | all implementers | 0 | todo |
| 4 | 테스트·UAT·보안 | qa | 40 | in-progress (타교 403 + Sprint 1 API 테스트) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 80 | Wave 1: 010 마이그레이션, authorize+schoolScope, audit_logs |
| IAM API·OpenAPI | api | 80 | `/api/schools`, `/api/me/permissions`, JWT role/school, resumes/files OpenAPI |
| 권한 메뉴·schools UI | frontend | 70 | permissions 메뉴, 회원가입/코드관리 schools API, test_token 제거 |
| 이력서 PDF | backend/frontend | 90 | 011 스키마, `/api/resumes`, career.html API, 한글 PDF |
| 상담 문서 | backend/frontend | 85 | 유형 진학/생활 확장, PDF/DOCX, stats/timeline. CNS-003 알림 미착수 |
| 채용 워크플로우 알림 | api/frontend | 15 | `POST /jobs/:id/apply` `resume_id` 수용. 상태 PATCH·인앱은 Sprint 2 |
| 워크넷 | backend | 0 | 게이트 |
| 추천 엔진 | backend | 0 | |
| 견학 모듈 | backend/frontend | 0 | announcements 이관 |
| 커뮤니티 고도화 | api/frontend | 0 | |
| 알림톡/SMS | backend | 0 | 게이트 |
| QA 스위트 | qa | 50 | Wave 1 타교 403 + `sprint1-documents.test.js` |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/3 일부 | architect |
| B-LS | admin-board/profile 등 잔여 LocalStorage | 재입력 안내 | architect |

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
