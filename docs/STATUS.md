# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-16  
현재 단계: **Sprint 7+ / 정책 결정 반영 (페르소나 E2E Q1–Q7)**  
전체 P0 구현: **약 70%** (Wave 1–Sprint 6 + Sprint 7 + 기업 승인 + **정책 Q1–Q7**. **워크넷·알림톡 실연동 0%** — 게이트 `unknown`)

## Gates (학교 제공물)

| 게이트 | 상태 | 영향 |
|--------|------|------|
| 워크넷(고용24) OpenAPI 키 | `unknown` | REQ-WN-* 실연동 보류 |
| SMS/알림톡 유료 계정 | `unknown` | REQ-MSG-* 실발송 보류 |

Architect가 확인 후 `ready` / `blocked`로 바꾼다. **게이트 전 실연동 금지.**

## Open P0 / gated REQ (정직 목록)

| ID | 상태 | 메모 |
|----|------|------|
| REQ-WN-* | gated stub | `/worknet/status` `NOT_CONFIGURED` only |
| REQ-MSG-* | gated stub | 인앱 경로 위주; 실 SMS/알림톡 없음 |
| REQ-NFR-010 | **done (Sprint 7)** | compose JWT → env / `.env.example` |
| Playwright 풀 E2E | optional | persona smoke + Puppeteer 스모크만 |
| Phase 1 착수보고 | todo | 게이트 확인과 묶음 |
| Phase 5 이관·교육 | todo | |

## Phases

| Phase | 내용 | Owner | % | 상태 |
|-------|------|-------|---|------|
| 0 | 비전/요구/아키텍처/역할, v2 저장소 | architect | 100 | done |
| 1 | 착수 보고·게이트 확인·현행 이슈 목록 | architect | 0 | todo |
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 95 | in-progress (COM/REC + 기업 signup/승인 문서화) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 95 | in-progress (메시지/워크넷 잔여; **기업 가입·승인 done**) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 95 | done |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 82 | in-progress (**기업 승인 게이트**; 워크넷 스텁만) |
| Sprint 3 | 커뮤니티·공지 테넌시·B-LS | backend + api + frontend | 70 | done-ish |
| Sprint 4 | 추천·견학·networking | backend + api + frontend | 85 | done-ish |
| Sprint 5 | COM P0·B-LS·persona smoke | backend + api + frontend + qa | 85 | done-ish |
| Sprint 6 | REC-002·COM-002·스크랩 UI·사후보고 | backend + api + frontend + qa | 85 | done-ish (브라우저 DoD → Sprint7) |
| Sprint 7 | QA hardening · NFR-010 · UAT | qa (+ nfr) | 90 | done-ish |
| 4 | 테스트·UAT·보안 | qa | 97 | in-progress (정책 Q1–Q7 + persona E2E) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 97 | null-school 공고 비노출; 018/019 정책 |
| IAM API·OpenAPI | api | 97 | roles permissions + company_approval + PW8 |
| 권한 메뉴·schools UI | frontend | 95 | admin-permissions + 시스템 관리자 표기 |
| 이력서 PDF | backend/frontend | 90 | |
| 상담 문서 | backend/frontend | 95 | |
| 채용 워크플로우 알림 | api/frontend | 82 | 미승인 공고 등록 차단 |
| 워크넷 | backend | 10 | status/sync stub `NOT_CONFIGURED` only |
| 추천 엔진 | backend | 85 | REC-002 associated P0 |
| 견학 모듈 | backend/frontend | 80 | 사후 보고 API+industry-visit UI |
| 커뮤니티 고도화 | api/frontend | 75 | COM-002 태그·첨부·스크랩 UI |
| 알림톡/SMS | backend | 15 | NOT_CONFIGURED |
| QA 스위트 | qa | 99 | policy-decisions + persona → **96/96** |
| NFR compose secrets | qa/ops | 85 | JWT env 이전 (NFR-010). 운영 시크릿 로테이션은 배포 시 |
| AWS EC2 배포 문서 | architect | — | [docs/deploy-aws.md](deploy-aws.md) + aws-up/init-env. **FRONTEND_PORT=8090** 기본(SG 8090). nginx=000 → §11.2c |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/4 실연동·P0 잔여 | architect |

해소: **B-PORT** — 프론트 `js/api.js` 로컬 API를 **5000**으로 통일. `localStorage.jjobb_api_base`로 5050 오버라이드.  
해소: **B-LS career/admin-jobs** — API만.  
해소: **B-LS company_profile_*** — `GET/PUT /api/users/company-profile` + `setup-test-profile.html` API 전환.  
해소: **REQ-NFR-010** — compose JWT 평문 제거 (Sprint 7).  
해소: **기업 공개 가입 공백** — `register.html` 기업 유형 + `/api/auth/register` school/role/profile (2026-09-15).  
해소: **기업 승인 플래그(P1)** — REQ-JOB-007 (2026-09-15).

로컬 백엔드: 기본 `PORT=5000`. macOS AirPlay가 5000을 쓰면 `PORT=5050 npm start` 후  
`localStorage.setItem('jjobb_api_base','http://localhost:5050/api')`.

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Ops note (2026-09-16)

- v2 AWS: [docs/deploy-aws.md](deploy-aws.md) + **`./scripts/aws-up.sh`** + **`./scripts/init-env.sh`** (`.env` JWT/DB 부트스트랩, REQ-NFR-010). `AWS-DEPLOYMENT.md`/`deploy-aws.sh`는 v1 지향.
- **`nginx=000` + `backend:5000=200`:** 호스트 frontend publish 실패(보통 :80 점유 → Created/PORTS empty) 또는 nginx 미listen. **기본 `FRONTEND_PORT=8090`**으로 :80 충돌 회피(SG에 8090 개방). §11.2b/§11.2c. `aws-up`은 publish 검증·조기 진단 덤프.
- **aws-up 폴링:** curl 실패 시 `nginx=000000` 오표기 수정; 상태 변경/~30초만 출력; backend healthcheck의 `GET /api/health 200` 반복은 정상(deploy-aws §8).
- 502 / `dependency backend failed to start` 완화: staged `aws-up` 기동, `./database` 마운트, `scripts/healthcheck.js`, backend `start_period: 180s`, migrate idempotent(initdb 010)·DB connect retry.
- Compose postgres: `POSTGRES_*` ← `.env`의 `DB_*`, healthcheck `start_period: 90s`, `shm_size: 256mb`.
- `error .env incomplete: set JWT_SECRET` → §11.0 / `init-env.sh` (예제 플레이스홀더 교체).
- `dependency backend failed to start` → [deploy-aws.md §11.2](deploy-aws.md).
- **init abort / migrate 013:** `majors` partial unique vs `ON CONFLICT (name)` → schema mid-abort → no `announcements`. Fixed INSERT + 013/014 guards. Recovery: `docker compose down -v && ./scripts/aws-up.sh`.

## Persona E2E 캠페인 (2026-09-15)

- 전 페르소나 API 캠페인: `backend/tests/persona-e2e-campaign.test.js`
- 정책 회귀: `backend/tests/policy-decisions.test.js`
- 보고서: [docs/qa/persona-e2e-report.md](qa/persona-e2e-report.md) — **§5 Q1–Q7 해결됨**
- 마이그레이션 **019** (`company_approval` + 전주공고 일괄 바인딩 되돌림). **018**은 DX만
- Puppeteer UI는 Chrome 미설치로 스킵

## 정책 결정 구현 (2026-09-15)

| 항목 | 결정 | 구현 |
|------|------|------|
| 기업 승인 권한 | system_admin 설정 가능 | 메뉴 `company_approval`, `GET/PUT /api/roles`, `admin-permissions.html` |
| 졸업생 학교 | 고등학교 필수 | register API+UI |
| 재학생 졸업년도 | 예정 필수 | register API+UI |
| 비밀번호 | 최소 8자 | auth register/change-password |
| 레거시 null school | 전주공고 자동 바인딩 **금지** | 018 개정 + 019 |
| null-school 공고 | 전역 노출 **금지** | `jobAccess` |
| v1 `admin` 표기 | 시스템 관리자 | `js/role-labels.js` + badges |

```
Handoff: backend+api+frontend+qa → architect
REQ: REQ-IAM-004/006/008, REQ-JOB-007, REQ-PLT-002
Need: optional OpenAPI yaml sync; Chrome Puppeteer
Done: Q1–Q7 code+docs+tests, push
```

## Company approval 완료 기록 (2026-09-15)

- REQ-JOB-007 / REQ-IAM-009 / REQ-PLT-002: `company_profiles.approval_status` (`pending`/`approved`/`rejected`)
- 가입 기본 `pending`; 기존 행 마이그레이션 `017`에서 `approved` 백필
- 승인자: `company_approval` 권한(기본 `school_admin` / `system_admin`). 타교 403. 시스템 관리자가 역할별 설정 가능
- 제품 규칙: pending/rejected 로그인·프로필 OK, **공고 CRUD 403 `COMPANY_NOT_APPROVED`**
- API: `GET /users/companies`, `PATCH /users/:id/company-approval`, jobs 가드
- UI: company-profile/dashboard 배너, job-create 폼 비활성, `admin-users` 기업 승인 탭
- QA: `company-approval.test.js` + signup 갱신 → 전체 **73/73**
- 브라우저: register 화면 로드·기업 유형 UI 확인; 로그인 폼 자동 입력은 자격증명 정책으로 차단 → **API UAT로 동일 흐름 검증** (pending 403 → 승인 200 → POST job 201 @5050)

```
Handoff: backend+api+frontend+qa → architect
REQ: REQ-JOB-007, REQ-IAM-009, REQ-PLT-002
Need: optional Playwright persona for approval UI; OpenAPI yaml sync
Done: schema 017, approval APIs, UI gates/admin tab, 73/73 tests, API browser-path UAT
```

## Company signup 완료 기록 (2026-09-15)

- REQ-IAM-006 / REQ-JOB-001 / REQ-PLT-002: 기업 공개 가입 → `user_roles(company)` + `company_profiles` + `school_id` 바인딩
- 공개 register에서 `admin`/`school_admin`/`system_admin` 거절
- 프론트: `register.html` 기업 필드, `js/company-profile.js`, job-create/edit/applicant 내비
- QA: `backend/tests/company-signup.test.js` (승인 게이트와 정렬)
- 브라우저: 기업 가입 → company-profile → (승인 후) job-create

## Sprint 7 완료 기록 (QA · NFR-010 · browser UAT)

- Persona smoke 확장: associated / job scrap / COM tags+scrap / trip report
- Puppeteer: login → jobs「관심」·community scrap·industry-visit report UI ([docs/qa/sprint7-browser-uat.md](qa/sprint7-browser-uat.md))
- REQ-NFR-010: `docker-compose.yml` `JWT_SECRET=${JWT_SECRET:?…}` + 루트 `.env.example`
- 워크넷·알림톡 **실연동 안 함**

## Sprint 6 완료 기록 (REQ-REC-002, REQ-COM-002, scrap UI, REQ-TRP-003 사후보고)

- 마이그레이션 `database/migrations/016_v2_sprint6_associated_com_trip.sql`
- API: associated, job scrap, posts tags/`file_ids`, field-trip report, worknet stub
- 프론트: community/dashboard scrap, jobs「관심」, industry-visit 사후 보고
- QA: [docs/qa/sprint6-verification.md](qa/sprint6-verification.md) → **59/59** @ `28bc73c`
- 브라우저 DoD는 Sprint 7에서 보완

## Sprint 5 완료 기록 (요약)

COM scrap/report/blind/categories/popular, company-profile B-LS, persona smoke. 상세는 이전 STATUS/커밋 `6a0c418`.

## Sprint 4 완료 기록 (요약)

networking 가드, recommendations P0, field_trips P0. 상세: [docs/qa/sprint4-verification.md](qa/sprint4-verification.md).

## Sprint 3 완료 기록 (요약)

posts/announcements/certificates/education-programs school 가드, files 동일교 프라이버시, admin-board/profile API.

## Frontend visual pass (2026-09-15)

- Tone: 로고 정렬 네이비·리프그린, 보라 그라데이션 제거 (`css/style.css` 토큰)
- Assets: `images/main-banner.jpg` (랜딩·대시보드 hero), `images/empty-state-career.png`
- Logo: `images/logo.svg` (헤더 워드마크·다크 헤더용), `images/logo-color.svg` (라이트용), `images/logo-mark.svg` (마크) — JJOBB 워드마크 자간 타이트화
- Nav label: `JOB밴드` → `JJOBB 밴드` (헤더/사이드바/도움말 등)
- Surfaces: `index.html` 풀블리드 메인 배너, `dashboard.html` welcome 배너 톤, 주요 페이지 헤더 로고 SVG 교체
- REQ: PLT/UI 공통 크롬 (IA §3). RBAC·API·JWT-only 미변경

## UI/CSS QA fix (2026-09-15)

- 기업 프로필: 누락 CSS(`auth.css`/`dashboard.css`) 연결 — 미스타일 폼 수정
- 공유 `.status-banner*`, `.content-header`, `.admin-tabs`, `.btn:disabled`, job-form disabled 톤
- `admin-users` 탭 블루 인라인 → 네이비/리프그린 토큰 클래스
- 상세: [docs/qa/ui-css-review.md](qa/ui-css-review.md)

## Mobile nav (2026-09-15)

- ≤768px 햄버거 + 드로어 (`js/nav.js`); 헤더/사이드바 공유 크롬 페이지
- 브라우저 375px: index / dashboard / community / login 열기·닫기·Esc 확인
- 상세: [docs/qa/mobile-nav.md](qa/mobile-nav.md)

```
Handoff: frontend → qa
REQ: PLT/UI chrome (mobile nav)
Need: optional staff-session check on admin sidebar-only pages
Done: hamburger drawer, sidebar embed, a11y Esc/backdrop, docs
```

## Phase 0 / Wave 1 / Sprint 1–2 verification

이전 검증 절은 `docs/qa/*-verification.md` 참고.
