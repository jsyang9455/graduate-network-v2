# 데모 시드 데이터 보고서 (per-persona)

최종 실행: **2026-09-16**  
담당: Backend / QA  
관련: REQ-RSM-*, REQ-JOB-*, REQ-COM-002, REQ-TRP-*, REQ-CNS-*, REQ-IAM-001/003 (STB), TEST-ACCOUNTS.md

## 1. 산출물

| 파일 | 역할 |
|------|------|
| `database/demo-seed.sql` | `[DEMO]` 마커 idempotent UPSERT (이력서·밴드·채용·공지 9건·교육프로그램·견학·상담 예약/일지·학교 브랜딩) |
| `database/test-accounts.sql` | DX 계정 + **JJTH `school_id`** + `teacher.is_counselor=true` |
| `create-test-accounts.sql` | 레거시 엔트리포인트 (동일 학교 바인딩) |
| `scripts/load-demo-data.sh` | DX 계정 확보 → 시드 → JJTH 로고 바이트 설치 (docker **또는** node/pg) |
| `scripts/verify-demo-data.cjs` | 페르소나 로그인 + 핵심 GET 200 + DEMO/상담/공지 assert |

## 2. 적재 방법 (AWS / 로컬)

```bash
# 권장 (compose postgres 기동 후)
./scripts/load-demo-data.sh

# 로컬 node + Postgres (docker 없음)
DB_PASSWORD=postgres ./scripts/load-demo-data.sh

# 이미 DX 계정이 있으면
SKIP_TEST_ACCOUNTS=1 ./scripts/load-demo-data.sh

# 적재 직후 API 스모크
VERIFY=1 BASE_URL=http://127.0.0.1:8090 ./scripts/load-demo-data.sh
# 또는
BASE_URL=http://127.0.0.1:5050 node scripts/verify-demo-data.cjs
```

### AWS EC2 (compose)

```bash
cd /path/to/jjobb_v2
git pull
./scripts/load-demo-data.sh
VERIFY=1 BASE_URL=http://127.0.0.1:8090 ./scripts/load-demo-data.sh
# 또는 별도:
BASE_URL=http://127.0.0.1:8090 node scripts/verify-demo-data.cjs
```

비밀번호는 `TEST-ACCOUNTS.md`와 동일: **password123** (리포트·커밋에 실운영 시크릿 없음).

## 3. 역할별 시드 내용

학교: **전주공업고등학교** (`JJTH`) — 모든 DX student/teacher/graduate/company/admin `school_id` 바인딩.

| 역할 | 계정 | 시드 |
|------|------|------|
| 재학생 | `student@jjob.com` | 이력서 2건; 채용 지원·스크랩; 박람회·자격증 신청; 견학 신청; 밴드 Q&A; **상담 예약 4건**; 교육프로그램 목록 |
| 졸업생 | `graduate@jjob.com` | 대표 이력서; 취업후기; 채용 지원·스크랩; **상담 예약 1건** + 일지 1건 |
| 교사 | `teacher@jjob.com` | **`is_counselor=true`**; 밴드 공지; field_trip·사후보고; **상담 세션 5건** + **일지 5건**(진로/취업/학습/생활 + 졸업생); 교육프로그램 등록자 |
| 기업 | `company@jjob.com` | 승인 유지; 채용 공고 2건 |
| 관리자 | `admin@jjob.com` | `primary_admin` + logo (SVG 바이트) |

### 공지사항 (`announcements`, 학교 스코프 JJTH)

앱 유효 type만 사용 (`job-fair` / `industry-visit` / `certification`). 유형당 **3건** = **9건** `[DEMO]`.

일반 공지성 콘텐츠는 `education_programs` **3건** + 밴드 `posts` news로 보완 (별도 `general` announcement type 없음).

### 상담

| 테이블 | 건수 | 내용 |
|--------|------|------|
| `counseling_sessions` | 5 | pending / approved / scheduled / completed (+ 졸업생 pending) |
| `counseling_journals` | 5 | 학생 타임라인 4유형 + 졸업생 멘토링 일지 |

공통 카운트(재실행 후): resumes **3**, posts **3**, jobs **2**, announcements **9**, field_trips **1**, edu_programs **3**, counseling_sessions **5**, counseling_journals **5**, `teacher_is_counselor` **true**.

## 4. 테스트 매트릭스 (API smoke)

환경: 로컬 Postgres `graduate_network` @5432, API `PORT=5050`, `JWT_SECRET=dev-only-change-me`.

| 페르소나 | 로그인 | 핵심 GET 200 | 데이터 assert | 결과 |
|----------|--------|--------------|---------------|------|
| student | pass | me, resumes, jobs, apps, scraps, posts, recs, field-trips, job-fair, certification, education-programs, counseling | school_id · DEMO 이력서 · ≥2 job-fair · ≥2 sessions · edu | **Pass** |
| graduate | pass | me, resumes, posts, jobs, scraps, associated | school_id · DEMO 이력서 | **Pass** |
| teacher | pass | me, field-trips, posts, journals, counseling, industry-visit, certification, education-programs | school_id · is_counselor · ≥3 journals/sessions · ≥2 visits | **Pass** |
| company | pass | me, jobs, company-profile + applicants | DEMO 공고·지원자 | **Pass** |
| admin | pass | me, schools, jobs, posts, 3 announcement types, field-trips, edu, worknet, logo bytes | JJTH branding · ≥2 DEMO/type | **Pass** |

**종합: 5/5 Pass** (`scripts/verify-demo-data.cjs`).

## 5. Gaps / 한계

| 항목 | 상태 | 메모 |
|------|------|------|
| 별도 `general` announcement type | **없음** | API `validTypes` = job-fair / industry-visit / certification. 일반 안내는 education_programs + posts |
| 워크넷·알림톡 실연동 | 게이트 Skip | `/worknet/status` 200 + `NOT_CONFIGURED` |
| Puppeteer UI | 미실행 | API 스모크로 대체 |
| Docker 미설치 로컬 | node/pg 폴백 | AWS는 `docker compose exec … psql` 경로 |

## 6. REQ 매핑 (요약)

- REQ-RSM-* 이력서·primary  
- REQ-JOB-* / JOB-007 승인 기업 공고·지원  
- REQ-COM-002 태그·스크랩  
- REQ-TRP-* 견학·사후보고  
- REQ-CNS-* 상담 예약(`counseling_sessions`)·일지(`counseling_journals`)  
- REQ-IAM-001/003 학교 logo / primary_admin (020+)
