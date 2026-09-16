# 데모 시드 데이터 보고서 (per-persona)

최종 실행: **2026-09-16**  
담당: QA / Test  
관련: REQ-RSM-*, REQ-JOB-*, REQ-COM-002, REQ-TRP-*, REQ-IAM-001/003 (STB), TEST-ACCOUNTS.md

## 1. 산출물

| 파일 | 역할 |
|------|------|
| `database/demo-seed.sql` | `[DEMO]` 마커 idempotent UPSERT (이력서·밴드·채용·박람회·견학·학교 브랜딩) |
| `scripts/load-demo-data.sh` | DX 계정 확보 후 시드 적재 (docker compose **또는** node/pg) |
| `scripts/verify-demo-data.cjs` | 페르소나 로그인 + 핵심 GET 200 + smoke assert |

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

비밀번호는 `TEST-ACCOUNTS.md`와 동일: **password123** (리포트·커밋에 실운영 시크릿 없음).

## 3. 역할별 시드 내용

학교: **전주공업고등학교** (`JJTH`)

| 역할 | 계정 | 시드 |
|------|------|------|
| 재학생 | `student@jjob.com` | 이력서 2건(대표 published + draft), items/keywords; 채용 지원 1건(resume 연결); job/post scrap; 박람회·견학 신청; 밴드 Q&A 글·댓글 |
| 졸업생 | `graduate@jjob.com` | 대표 이력서+items; 취업후기 포스트(태그); 채용 지원·스크랩 |
| 교사 | `teacher@jjob.com` | 밴드 공지 포스트; field_trip 생성자; 사후보고; 상담일지 1건 |
| 기업 | `company@jjob.com` | 승인 유지; 채용 공고 2건(학교 스코프)+keywords; 지원자 연결 |
| 관리자 | `admin@jjob.com` | 학교 `primary_admin_user_id`; `logo_file_id`(demo SVG metadata) |

공통 카운트(재실행 후): resumes **3**, posts **3**, jobs **2**, announcements **3**, field_trips **1**.

## 4. 테스트 매트릭스 (API smoke)

환경: 로컬 Postgres `graduate_network` @5432, API `PORT=5050`, `JWT_SECRET=dev-only-change-me`.

| 페르소나 | 로그인 | 핵심 GET 200 | 데이터 assert | 결과 |
|----------|--------|--------------|---------------|------|
| student | pass | me, resumes, jobs, applications, scraps, posts, recs, field-trips, job-fair | DEMO 이력서·primary·지원 | **Pass** |
| graduate | pass | me, resumes, posts, jobs, scraps, associated | DEMO 이력서 | **Pass** |
| teacher | pass | me, field-trips, posts, counseling-journals, industry-visit | DEMO 견학 | **Pass** |
| company | pass | me, jobs, company-profile + applicants | DEMO 공고·지원자 | **Pass** |
| admin | pass | me, schools, jobs, posts, job-fair, field-trips, worknet/status | JJTH logo + primary_admin | **Pass** |

**종합: 5/5 Pass** (`scripts/verify-demo-data.cjs`).

## 5. Gaps / 한계

| 항목 | 상태 | 메모 |
|------|------|------|
| 별도 `exhibition` / `전시` 테이블 | **없음** | 앱은 `announcements` type `job-fair` / `industry-visit` / `certification` + `field_trips` 사용. certification DEMO로 대체 시드 |
| 워크넷·알림톡 실연동 | 게이트 Skip | `/worknet/status` 200 + `NOT_CONFIGURED` |
| logo 실제 바이너리 파일 | 메타만 | `files` 행 + `logo_file_id`; 스토리지 바이트는 API 업로드 경로로 보완 가능 |
| Puppeteer UI | 미실행 | API 스모크로 대체 (Chrome 환경 의존) |
| Docker 미설치 로컬 | node/pg 폴백 | AWS는 `docker compose exec … psql` 경로 |

## 6. REQ 매핑 (요약)

- REQ-RSM-* 이력서·primary  
- REQ-JOB-* / JOB-007 승인 기업 공고·지원  
- REQ-COM-002 태그·스크랩  
- REQ-TRP-* 견학·사후보고  
- REQ-IAM-001/003 학교 logo / primary_admin (020+)
