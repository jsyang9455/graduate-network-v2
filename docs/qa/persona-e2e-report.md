# 페르소나 E2E 캠페인 결과 보고서

최종 실행: **2026-09-15**  
담당: QA / Test  
관련 REQ: REQ-IAM-006/008/009, REQ-JOB-007, REQ-RSM-*, REQ-CNS-*, REQ-PLT-002, REQ-WN/MSG 게이트

## 1. 환경

| 항목 | 값 |
|------|-----|
| OS | macOS (darwin) |
| DB | 로컬 PostgreSQL `graduate_network` @ `localhost:5432` (이미 기동) |
| 마이그레이션 | `cd backend && DB_PASSWORD=postgres npm run migrate` → **019** 포함 적용 |
| API | `PORT=5050` (macOS AirPlay가 5000 점유). `JWT_SECRET=dev-only-change-me`, `DISABLE_CRON=1`, `DB_PASSWORD=postgres` |
| 프론트 정적 | `python3 -m http.server 8080` (저장소 루트) |
| API base 오버라이드 | 브라우저: `localStorage.jjobb_api_base = 'http://localhost:5050/api'` |
| 시크릿 | 리포트·커밋에 실비밀번호 없음. 테스트 계정은 `TEST-ACCOUNTS.md` 플레이스홀더 |

### 실행 방법 (재현)

```bash
# DB 마이그레이션
cd backend && DB_PASSWORD=postgres npm run migrate

# API (AirPlay 회피)
DB_PASSWORD=postgres JWT_SECRET=dev-only-change-me PORT=5050 DISABLE_CRON=1 npm start

# 정적 프론트 (별 터미널)
python3 -m http.server 8080

# 통합 테스트
cd backend && DB_PASSWORD=postgres DISABLE_CRON=1 npm test
```

## 2. 페르소나별 결과

| 페르소나 | 가입/계정 | 로그인·me·비번변경 | 역할 핵심 기능 | 타교 격리 | 결과 |
|----------|-----------|-------------------|----------------|-----------|------|
| **student** | 공개 `POST /register` + 졸업년도(예정) 필수 | pass | 이력서 · 스크랩 · 지원 · 추천 | 목록에서 타교·null-school 공고 미포함 | **Pass** |
| **graduate** | 공개 register + **고등학교 필수** | pass | resumes 목록 | 무학교 가입 400 | **Pass** |
| **teacher** | 공개 register | pass | 상담일지 · 목록 | 타교 403/404 | **Pass** |
| **company** | 공개 register → `pending` | pass · 프로필 | 미승인 job **403** → 승인 후 **201** | 타교 승인 403 | **Pass** |
| **school_admin** | 시드/스태프 | pass | 기업 승인(`company_approval`) | 타교 403 | **Pass** |
| **system_admin** | 시드 `admin` → RBAC `system_admin` | pass | schools · 권한 매트릭스 · 표기 **시스템 관리자** | 전역 | **Pass** |

자동화: `persona-e2e-campaign` + `policy-decisions` + `legacy-company-repair` + 기존 스위트.

## 3. 발견 버그 → 수정

| 이슈 | 영향 | 수정 |
|------|------|------|
| DX `company@jjob.com` 프로필 누락 | 기업 UAT | 018(개정: DX만) + test-accounts |
| null-school 공고 전역 노출 | 테넌시 | `jobAccess` — null 비노출 |
| 018 전주공고 일괄 바인딩 | 범위 왜곡 | 018 제거 + **019** 되돌림 |
| PW UI 8 / API 6 | 불일치 | API **8** 통일 |
| 기업 승인 하드코딩 | 정책 | `company_approval` 메뉴 + `admin-permissions.html` |

## 4. 잔여 실패 / 스킵

| 항목 | 상태 | 메모 |
|------|------|------|
| Puppeteer 브라우저 UI | **Skip** | Chrome 미설치 |
| 워크넷·알림톡 실연동 | **Skip (게이트)** | `NOT_CONFIGURED` |
| 회원가입 UI 전공 콤보 | **환경** | `jjobb_api_base` (B-PORT) |

## 5. 정책 확인 — **해결됨** (사용자 회신 2026-09-15)

| Q | 결정 | 구현 |
|---|------|------|
| 1 교사 기업승인 | **시스템 관리자가 설정** (기본 school/system admin) | `company_approval` + `PUT /api/roles/:code/permissions` + `admin-permissions.html` |
| 2 졸업생 무학교 | **불가** — 고등학교 필수 | API+UI 유지·강화 |
| 3 재학생 졸업년도 | **필수(예정)** | API+UI |
| 4 비밀번호 | **최소 8자** | register/change-password |
| 5 레거시 null→전주공고 | **하지 않음** — null 유지까지 명시 배정 | 018 개정 + 019 |
| 6 null-school 공고 전역 | **노출 금지** | `appendJobSchoolFilter` / `canSeeJob` |
| 7 v1 `admin` 표기 | **시스템 관리자** | `RoleLabels` / `displayRoleLabel` |

## 6. 종합 판정

**Pass (정책 반영 후).** P0 페르소나 + 정책 회귀 테스트. 게이트 연동·Puppeteer는 스킵.

```
Handoff: backend+api+frontend+qa → architect
REQ: REQ-IAM-004/006/008, REQ-JOB-007, REQ-PLT-002
Need: optional Chrome Puppeteer; OpenAPI yaml sync
Done: Q1–Q7 구현, 019, policy-decisions tests, docs/STATUS
```
