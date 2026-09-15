# 페르소나 E2E 캠페인 결과 보고서

최종 실행: **2026-09-15**  
담당: QA / Test  
관련 REQ: REQ-IAM-006/008/009, REQ-JOB-007, REQ-RSM-*, REQ-CNS-*, REQ-PLT-002, REQ-WN/MSG 게이트

## 1. 환경

| 항목 | 값 |
|------|-----|
| OS | macOS (darwin) |
| DB | 로컬 PostgreSQL `graduate_network` @ `localhost:5432` (이미 기동) |
| 마이그레이션 | `cd backend && DB_PASSWORD=postgres npm run migrate` → **018** 포함 적용 |
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
# → 86/86 pass

# 선택 브라우저 스모크
API_BASE=http://127.0.0.1:5050/api FRONT_BASE=http://127.0.0.1:8080 npm run test:e2e
```

## 2. 페르소나별 결과

| 페르소나 | 가입/계정 | 로그인·me·비번변경 | 역할 핵심 기능 | 타교 격리 | 결과 |
|----------|-----------|-------------------|----------------|-----------|------|
| **student** | 공개 `POST /register` | pass (change-password 포함) | 이력서 생성 · 스크랩 · 지원 · 추천 feed | 목록에서 타교 공고 미포함 | **Pass** |
| **graduate** | 공개 register + 학교 필수 | pass | resumes 목록 | (학교 필수 강제 확인) | **Pass** |
| **teacher** | 공개 register | pass | 상담일지 작성 · 목록 | 타교 학생 timeline 403/404 | **Pass** |
| **company** | 공개 register → `pending` | pass · 프로필 GET/PUT | 미승인 job **403 `COMPANY_NOT_APPROVED`** → school_admin 승인 후 job **201** | 타교 school_admin 승인 403 | **Pass** |
| **school_admin** | 공개 가입 금지 → 시드/스태프 upsert | pass | 기업 pending 목록 · 승인 · 회원 목록 학교 범위 | 타교 user GET 403/404 | **Pass** |
| **system_admin** | 공개 가입 금지 · 시드 `admin` → RBAC `system_admin` | pass | schools 목록 · worknet/알림톡 `NOT_CONFIGURED` | 전역 조회 가능 | **Pass** (시드=`admin` 매핑) |

자동화: `backend/tests/persona-e2e-campaign.test.js` (9) + 기존 Sprint/승인 스위트 + `legacy-company-repair.test.js` (4) → **전체 86/86**.

## 3. 발견 버그 → 수정

| 이슈 | 영향 | 수정 | 커밋 |
|------|------|------|------|
| DX 계정 `company@jjob.com`에 `company_profiles` 없음 + `school_id` null → 프로필 404, 공고 불가 (`TEST-ACCOUNTS` 문서와 불일치) | 기업 페르소나 시드 UAT | 마이그레이션 `018_v2_legacy_company_seed_repair.sql` (null school 바인딩 + DX 프로필 approved), `database/test-accounts.sql` / `TEST-ACCOUNTS.md` 갱신, 회귀 테스트 | `d24a389` |
| `GET /api/users/company-profile` 404에 `code` 없음 | 클라이언트 에러 분기 | `sendError(..., 'NOT_FOUND', ...)` | `d24a389` |
| 페르소나 캠페인 cleanup SQL `posts.author_id` 오타 | 테스트 after 경고 | `user_id`로 수정 | `d24a389` |

## 4. 잔여 실패 / 스킵

| 항목 | 상태 | 메모 |
|------|------|------|
| Puppeteer 브라우저 UI (`npm run test:e2e`) | **Skip** | API 스모크 OK. Chrome 바이너리 미설치 (`puppeteer` cache 경로). IDE 브라우저로 register UI만 확인 |
| IDE 브라우저 자격증명 자동 입력 | **Skip** | 정책상 차단 이력 있음 → API UAT로 대체 |
| 워크넷 실연동 | **Skip (게이트)** | `GET /api/worknet/status` → `NOT_CONFIGURED` |
| 알림톡/SMS 실발송 | **Skip (게이트)** | `providers.alimtalk.code = NOT_CONFIGURED` |
| 회원가입 UI 전공 콤보 비어 있음 | **환경** | 프론트가 기본 API 5000을 치면 5050 API의 `/majors` 미도달. `jjobb_api_base` 설정 필요 (B-PORT) |
| 기존 시드 공고 `school_id IS NULL` 전역 노출 | **미수정** | 가시성 정책 확인 필요 (아래 Q) — 이번 캠페인에서 정책 발명 안 함 |

## 5. 정책 확인 요청

사용자(또는 Architect) 확인이 필요합니다. **코드로 임의 변경하지 않았습니다** (018의 DX/`null school` 바인딩만 데이터 수리).

1. **교사도 기업을 승인할 수 있어야 하는가?**  
   현재: `school_admin` / `system_admin`(+ users write)만. 교사 시도 → 403. REQ-JOB-007 문구와 일치하는지 확인.

2. **졸업생이 학교 코드/소속 없이 가입 가능한가?**  
   현재: graduate도 school 필수(400). 과업/학교 정책과 맞는지.

3. **재학생 가입 시 「졸업년도」필수 UI가 맞는가?**  
   `register.html`이 student에도 graduationYear required. 예상 졸업년도로 둘지, 선택으로 풀지.

4. **비밀번호 최소 길이: UI 8자 vs API 6자**  
   `register.js`는 8자, `auth` validator는 6자. 어느 쪽으로 통일할지.

5. **레거시 기업(`school_id` null, 시드 삼성/현대 등)을 기본 학교(전주공고)에 자동 바인딩해도 되는가?**  
   018이 active company의 null `school_id`를 기본 학교로 채움. 운영 DB에 동일 적용 시 범위 영향 있음.

6. **`jobs.school_id IS NULL` 공고를 전 학교 목록에 계속 노출할 것인가?**  
   `jobAccess` / 목록 쿼리가 null을 전역 공개로 취급. 테넌시 강화 시 숨김/이관 필요.

7. **v1 `admin` 표시명을 UI에서 `system_admin`으로 바꿀 것인가?**  
   RBAC는 이미 `admin`→`system_admin` 매핑. 시드에 별도 `system_admin` user_type 행은 없음.

## 6. 종합 판정

**조건부 Pass (P0 페르소나 API 캠페인 통과).**  
가입→핵심 업무→타교 403→기업 승인 게이트까지 자동화로 검증했고, DX 시드 기업 결함은 수정·회귀 테스트 추가.  
브라우저 풀 E2E·워크넷/알림톡 실연동은 스킵. 정책 질문 7건은 제품 결정 대기.

```
Handoff: qa → architect (+ frontend optional)
REQ: REQ-IAM-006/009, REQ-JOB-007, REQ-PLT-002
Need: 정책 Q1–Q7 회신; optional Chrome 설치 후 Puppeteer UI; OpenAPI sync
Done: persona-e2e-campaign + legacy repair 018, 86/86 tests, Korean report, STATUS
```
