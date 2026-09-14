# Sprint 1 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `4ef8a3844dacebb9be0a98f29df2ccc0faa03676` (`feat(resumes): Sprint 1 PDF/DOCX documents and career API`)
- **포함:** Wave 1 QA 노트 `7fc5ebd`는 부모 히스토리에 있음. 본 검증은 `4ef8a38` 트리.
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Sprint 1 **부분 통과 (partial)**. 이력서 CRUD·로컬 스토리지 어댑터·PDF magic bytes·지원 `resume_id`·career/admin-jobs LS 철거는 실재. UI 브라우저 미검증, 상담일지 POST 런타임 버그, 파일 동일교 누수 가능, Wave 1 jobs/예약/`GET /api/users` 구멍은 **`4ef8a38` 기준 미해소**.
- **복구:** 2026-09-14 후속 세션에서 본 파일을 완성본으로 확인. 워킹트리에 Sprint 2 미커밋(jobs 테넌시·notify 등)이 있으나 **평가 범위에 넣지 않음**. STATUS 표의 42%/Sprint 1 95%는 Sprint 2 WIP이며 본 보고의 정직성 판단(90%/34%)과 별개다.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | HTML/CSS/JS + Express. pdfkit/docx 모듈만 추가 |
| 테넌시 (`school_id` + authorize) | **Partial** | resumes/journals(문서) 가드됨. `GET /api/jobs`·`/api/counseling`(예약)·`/api/counseling/teachers`는 여전히 schoolScope 없음 |
| 시크릿 `.env` 커밋 | **Pass** | `.env` gitignore. 커밋에 `.env` 없음. `backend/.env.example`만 STORAGE_* 추가 |
| 업무 `localStorage` 신규 키 | **Pass** | `career.js`는 JWT 주석만. `career_*`/`jobPostings` setItem 없음 |
| REQ 인용 | **Pass** | 커밋 `REQ-RSM, REQ-CNS`. 본문·STATUS에 RSM/CNS/PLT/JOB 명시 |
| docs 03/04/05 + OpenAPI + STATUS | **Pass** | 같은 커밋에서 갱신. OpenAPI `2.0.0-sprint1` |
| 프론트 브라우저 검증 명시 | **Fail** | STATUS 「백엔드가 기동되면 확인」은 미래형. 페르소나 E2E 기록 없음. 본 세션은 로그인 페이지만 주장된 것으로 보고 **career/PDF UI 미검증** 처리 |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋이 backend + API + frontend + QA + docs. Wave 1과 동일 패턴 |

## 2. Sprint 1 DoD 항목

공통 DoD: `docs/06-delivery-plan.md` §4, Wave B, STATUS 「Sprint 1 완료 기록」.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `011_v2_sprint1_resumes.sql` | **Pass** | `files`, `resumes`, `resume_items`, `resume_documents`, `counseling_documents`, journals 유형+`action_taken`/`follow_up_at`, `job_applications.resume_id`. idempotent |
| 2 | 로컬 스토리지 어댑터 (URL-only 해킹 아님) | **Pass** | `backend/modules/storage/{index,local,s3}.js`. `put`이 디스크에 바이트 기록, DB는 `files.bucket_key` 메타만. S3는 자격 없으면 `NOT_CONFIGURED` |
| 3 | `/api/resumes` CRUD + 대표 + preview + pdf | **Pass** (API) | `backend/routes/resumes.js`. 테스트: 생성/목록/수정, primary, preview HTML, PDF 201 |
| 4 | 한글 폰트 PDF magic bytes | **Partial** | NotoSansKR Regular/Bold TTF 존재(~485KB). pdfkit `registerFont`. 테스트는 `%PDF` 시그니처만. **글리프 렌더·화면 검수 없음** |
| 5 | 타교 403 resumes/files/journals | **Partial** | 학생B→이력서A 403, 교사B→이력서/상담 PDF 403 테스트 통과. **`GET /api/files/:id` 타교 전용 케이스 없음**. `canReadFile`이 resume_pdf에서 거부 후 `assertSameSchool`로 떨어져 **동일 학교 타 학생**이 파일 ID만 알면 열람 가능 |
| 6 | `career.html` LS가 진실 공급원이 아님 | **Pass** (코드) | `js/career.js` → `api.resumes.*`. HTML에 `career_`/`localStorage` 없음 |
| 7 | `admin-jobs` `jobPostings` LS 폴백 제거 | **Pass** | `loadJobs()`가 `api.get('/jobs?status=all…')`만. `jobPostings` 문자열 없음 |
| 8 | 지원 시 `resume_id` | **Pass** | `POST /jobs/:id/apply` 소유 이력서만. 없으면 대표 자동. `js/jobs.js`가 대표를 붙여 전송 |
| 9 | 상담 PDF/DOCX + 유형 진학/생활 | **Partial** | 스키마·UI 옵션·SQL 픽스처 `진학상담` OK. PDF `%PDF` / DOCX `PK` 테스트 통과. **POST/PUT 일지가 `isValidCounselingType`을 require 없이 호출 → UI 저장 시 `ReferenceError` 가능**. 테스트는 SQL INSERT라 미검출. 상담확인서(`kind=confirm`) API는 있으나 UI export는 항상 `journal` |
| 10 | 브라우저 페르소나 (career 마법사→PDF, 교사 문서) | **Fail** | Playwright 없음. STATUS도 실제 수행을 기록하지 않음 |

### Wave 1 리스크 추적 (구현하지 않음)

| Wave 1 리스크 | Sprint 1 이후 | 메모 |
|---------------|---------------|------|
| PDF를 LocalStorage 위에 쌓음 | **해소** | career는 API. PDF는 storage `put` |
| 스토리지 어댑터 없음 (REQ-PLT-004) | **해소** | local 기본, S3 스텁+게이트 |
| 상담 유형 진학/생활 불일치 (REQ-CNS-001) | **부분 해소** | CHECK·UI에 `진학상담`/`생활상담` 추가. v1 `진로/학습/기타` 유지(호환). **저장 API 버그로 UI 경로 위험** |
| jobs 목록 테넌시 | **미해소** | `GET /api/jobs`에 `school_id` 필터/가드 없음. 공고는 전교 노출. Sprint 2 범위 |
| 상담 예약 테넌시 | **미해소** | `backend/routes/counseling.js` schoolScope 없음. `GET /api/counseling/teachers` 비로그인·전교 이메일 |
| `GET /api/users` 로그인 필수 회귀 | **미해소** | `auth` + `schoolScope` 유지. dashboard/networking/counseling 폴백은 여전히 토큰 필요 |
| Playwright 없음 | **미해소** | node:test만 확장 |
| compose JWT 평문 (REQ-NFR-010) | **미해소** | 하드코딩 유지. STORAGE_*만 추가 |

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test --test-concurrency=1 tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** |
| `backend/tests/sprint1-documents.test.js` | **9/9 pass** |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** |

합계 **21 pass / 0 fail**. 기존 로컬 Postgres에 마이그레이션 skip 후 픽스처 upsert. 이 세션에서 DB를 설치하지 않음. Playwright 없음.

커버: 이력서 CRUD·대표, 타교 이력서 403, preview HTML, PDF `%PDF`+files GET, apply `resume_id`, 동교/타교 교사 이력서, 상담 PDF/DOCX, stats/timeline 403, 상담 PDF 타교 403. Wave 1 12케이스 회귀 유지.

미커버: 상담일지 POST(유형 검증), `GET /api/files` 동일교 타 사용자, 한글 글리프, jobs GET 테넌시, 예약/teachers, 브라우저 E2E, 상담확인서 UI.

## 4. Spec 커버리지 (REQ → Sprint 1)

과업지시서 문서화 + `docs/01-requirements.md`. CNS는 문서(일지) 범위.

| REQ | P | Sprint 1 | 메모 |
|-----|---|----------|------|
| REQ-RSM-001 | P0 | **Pass** (API/코드) | 섹션: 기본·학력·경력·자격·수상·어학·스킬·소개. UI 미검증 |
| REQ-RSM-002 | P0 | **Partial** | 복수·대표·draft/published. `version` 정수 증가만. **버전 히스토리 테이블 없음** |
| REQ-RSM-003 | P0 | **Partial** | `basic`/`compact` + `GET …/preview` HTML. **입력 중 실시간 미리보기 아님** |
| REQ-RSM-004 | P0 | **Partial** | 임베드 경로·폰트 파일·`%PDF`. 한글 깨짐 육안 미검수 |
| REQ-RSM-005 | P0 | **Pass** (API) | `resume_documents`→`files`. apply가 최신 `file_id`를 `resume_url`로도 기록 |
| REQ-CNS-001 | P0 | **Partial** | 유형 확장·조치·후속일 UI 필드 있음. **POST/PUT `isValidCounselingType` import 누락** |
| REQ-CNS-002 | P0 | **Partial** | `GET …/timeline/:studentId` + 학교 가드. **타임라인 UI 없음** (`counseling-journal.js`에 timeline 호출 없음) |
| REQ-CNS-003 | P0 | **Not started** | STATUS가 Sprint 2/3로 명시. 후속 알림 없음 |
| REQ-CNS-004 | P0 | **Partial** | PDF/DOCX API+테스트. UI는 일지만. 확인서 kind는 API만 |
| REQ-CNS-005 | P0 | **Pass** (API/부분 UI) | stats API + 목록 상단 건수 표시 |
| REQ-CNS-006 | P0 | **Partial** | 일지: 교사=본인, school_admin=소속교. **예약·teachers 라우트는 미격리** |
| REQ-JOB-005 | P0 | **Pass** | `resume_id` 소유 검사. 공고 자체는 전교 공개(JOB 테넌시는 별도) |
| REQ-PLT-001 | P0 | **Partial** | career/admin-jobs LS 해소. **admin-board `recentNews` 등·`graduateNetwork_user` 캐시 잔존**. B-LS 유지 |
| REQ-PLT-004 | P0 | **Pass** | 로컬 어댑터 + files 메타. S3는 게이트 |

Sprint 1 범위 밖(확인만): REQ-JOB-003/004 상태 PATCH, jobs 테넌시, IAM 잔여, WN/MSG 게이트.

## 5. STATUS 정직성

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 1 **90%** | **과대.** API 골격은 강하나 UI 미검증·일지 POST 버그·RSM-002/003·CNS-002 UI·파일 가드 구멍. 정직 구간 **70–75%** |
| 전체 P0 **약 34%** | **약간 과대.** P0 ≈ 55항. Wave 1 모니터 14–16% + Sprint 1에서 실질 완료에 가까운 항(RSM/CNS/PLT-004/JOB-005 일부) ≈ **28–32%**. 34%는 상한 |
| Phase 3 **80%** | **과대.** 스토리지는 이제 있음. jobs/posts/예약 가드·notify·cron은 공백. **~55–65%** |
| 이력서 PDF 스트림 **90%** | **과대 → ~75%.** API 대비 UI/글리프 |
| 상담 문서 **85%** | **과대 → ~65%.** 내보내기 API는 됨. 저장 버그·CNS-003·예약 격리 |
| 채용 워크플로우 **15%** | **대체로 정직** (`resume_id`만 선행) |
| QA **50%** / Phase 4 **40%** | **약간 과대.** 21 API 테스트는 가치 있음. E2E 0. QA **~40%**, Phase 4 **~25–30%** |
| 게이트 `unknown` | **정직** |
| B-LS career/admin-jobs 해소 | **정직.** board/profile 잔여는 B-LS로 유지해야 함 |
| 「브라우저 검증: 기동되면 확인」 | **허위 완료 소지.** 수행 기록이 아님 |

**드리프트:** 문서는 Wave B를 이력서 PDF + 상담 문서로 닫힌 것처럼 읽히지만, DoD의 브라우저 검수와 상담 저장 경로가 빠져 있다. jobs 전교 공개는 Sprint 2와 맞지만, 지원에 `resume_id`를 붙인 상태에서도 타교 공고 지원이 가능하다.

## 6. Sprint 2 리스크 (구현하지 말 것 — 확인만)

1. **jobs 미격리** — `GET /api/jobs` 전교. 상태 PATCH·학교별 게시 정책을 같이 닫지 않으면 지원 워크플로우가 전교 누수 위에 쌓인다.
2. **상담 예약 / teachers** — 일지 문서는 가드돼도 예약·교사 이메일은 전교. CNS-006을 일지만으로 닫지 말 것.
3. **`GET /api/users` 401** — 네트워킹·대시보드·상담 폴백 회귀 유지. 로그인 토큰 없이 목록을 다시 열지 말 것(정책 합의 후).
4. **파일 동일교 누수** — `files.js` `canReadFile` fall-through. 지원자 PDF를 기업만 보게 할 때 이 가드를 먼저 고치는 편이 안전.
5. **상담일지 POST 버그** — UI에서 진학/생활 저장이 500이 되면 Sprint 2 상담 알림 작업이 막힌다. Backend 한 줄 import.
6. **게이트 unknown** — 워크넷을 Sprint 2 일정에 넣지 말 것 (`docs/00` OUT-04).
7. **career/PDF UI 미검증** — 상태 알림 UI를 붙이기 전에 대표 이력서 첨부 경로를 브라우저로 한 번 탈 것.
8. **STATUS %** — 90%/34%를 기준으로 Sprint 2를 15%만 더하면 과업 대비 과대 보고가 누적된다.

## 7. 권장 QA (기존 테스트를 약하게 만들지 말 것)

1. Playwright: 학생 로그인 → career 단계 저장 → PDF 다운로드(한글) → jobs 지원(대표 이력서).
2. 교사: 진학상담 일지 **POST가 201인지** (현재 의심) → PDF/DOCX. 타교 403.
3. `GET /api/files/:id` 동일 학교 다른 학생 = 403이어야 Pass.
4. jobs GET에 학교 B 공고가 학교 A 목록에 안 나오는지 (Sprint 2 가드 후).
5. 회귀: Wave 1 10 + Sprint 1 9 유지. 비로그인 `GET /api/users` = 401.
6. LocalStorage: `career_*`, `jobPostings` setItem 재도입 없으면 Pass. board/profile는 잔여로 기록만.
7. WN/MSG 게이트 꺼짐은 skip이지 fail이 아님.

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % 정정 (Sprint 1 90%→~72%, P0 34%→~30%, Phase 3 80%→~60%)
Need: 게이트 unknown 유지. 브라우저 미검증을 완료로 쓰지 말 것

Handoff: verifier/monitor → backend
REQ: REQ-CNS-001, REQ-PLT-003, REQ-IAM-009
Need: counseling-journals.js에 isValidCounselingType import; files canReadFile fall-through 차단
Done: 스토리지 어댑터·이력서/일지 문서 API는 테스트 통과. jobs/예약 테넌시는 미착수(Sprint 2)

Handoff: verifier/monitor → frontend
REQ: REQ-RSM-004, REQ-CNS-002/004, docs/06 브라우저 DoD
Need: career/상담 문서 페르소나 검증 기록. 타임라인 UI, 상담확인서 내보내기
Done: career API, admin-jobs LS 제거, apply 대표 resume_id (코드 리뷰)

Handoff: verifier/monitor → sprint2
REQ: REQ-JOB-003/004, REQ-IAM-009, REQ-PLT-002
Need: jobs schoolScope, PATCH application status, 예약 테넌시. GET /users 회귀는 정책 확인
Done: apply resume_id만 Sprint 1에서 선행

Handoff: verifier/monitor → qa
REQ: REQ-RSM-004, REQ-CNS-001, docs/08
Need: Playwright + files 동일교 403 + journal POST. 기존 21테스트 유지
Done: node:test 21/21 pass (2026-09-14)
```
