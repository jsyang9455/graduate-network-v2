# 데이터 모델 — jjobb_v2

기존 `database/schema.sql` + 마이그레이션(`counseling_journals`, 상담 status, announcements 등)을 계승하고, 과업지시서 Ⅲ.4 신규 테이블을 추가한다.  
상세 컬럼·인덱스는 구현 스프린트에서 SQL 마이그레이션으로 확정한다.

## 1. 계승 테이블 (v1)

| 테이블 | 용도 | v2 변경 |
|--------|------|---------|
| `users` | 회원 | `school_id` FK, `user_type`에 `school_admin` 추가 또는 `roles` 분리. 전화·이메일 암호문 |
| `graduate_profiles` | 졸업생 프로필 | `school_id` |
| `company_profiles` | 기업 | `approval_status` (`pending`/`approved`/`rejected`), `approved_at`/`approved_by`/`rejection_reason`. 가입 기본 `pending`, 기존 행 백필 `approved`. 협력 학교 M:N (`company_schools`) 검토 |
| `jobs` | 자체 공고 | `school_id` 또는 `visibility`, `source`, 직종/스킬 컬럼 |
| `job_applications` | 지원 | `resume_id`, 상태 워크플로우 유지·확장 |
| `connections`, `mentorships` | 네트워킹 | `school_id` 범위 |
| `counseling_sessions` | 상담 예약 | `school_id`, 일지 FK |
| `counseling_journals` | 상담일지 | `school_id`, 유형 확장, 문서 FK. 민감 열람 가드 |
| `certificates` | 증명서 신청 | 유지 (문서 모듈과 연계 가능) |
| `posts`, `comments` | 커뮤니티 | 분류/익명/첨부. scraps/reports 분리 |
| `notifications` | 인앱 알림 | 이벤트 코드, 채널 |
| `messages` | 1:1 메시지 | 유지 |
| `majors` | 학과 | `school_id` 또는 `departments`로 이관 |
| `announcements` | 박람회/견학/자격 | 견학은 `field_trips`로 이관 예정 |
| `education_programs` | 교육 프로그램 | `school_id` |
| `site_stats` | 메인 현황 수동 입력 (최근 커밋) | 학교별 또는 전역 정책 결정 |

## 2. 신규/확장 (과업지시서)

### 2.1 학교·권한

```
schools (id, name, region, biz_no, status, logo_file_id, primary_admin_user_id, ...)
departments (id, school_id, name, ...)          -- 학과
classes (id, department_id, name, grade, year) -- 반 (필요 시)
roles (id, code, name)                         -- system_admin, school_admin, ...
menus (id, code, name, parent_id)
role_menu_permissions (role_id, menu_id, actions[])
user_roles (user_id, role_id, school_id, granted_by, granted_at)
users.school_id → schools.id
school_transfers (user_id, from_school_id, to_school_id, transferred_at, reason)
files.kind ∈ {…, school_logo}                  -- 020
```

`logo_url`은 API 파생 (`/api/schools/:id/logo`). 신규 학교 생성 시 `primary_admin_user_id` 필수(레거시 NULL 허용).

### 2.2 이력서·상담 문서

```
resumes (id, user_id, school_id, title, is_primary, status, version, ...)
resume_items (id, resume_id, section, payload jsonb, sort_order)
resume_documents (id, resume_id, file_id, template_code, created_at)
counseling_records  -- journals를 rename하거나 뷰. 기존 counseling_journals 확장 권장
counseling_documents (id, journal_id, file_id, format pdf|docx)
```

`career.html` LocalStorage 항목 매핑: experiences→경력, certificates→자격, educations→학력, portfolios, skills.

### 2.3 메시지·커뮤니티

```
message_templates (id, channel, event_code, body, school_id nullable)
message_logs (id, channel, to_user_id, status, provider_id, cost, ...)
message_consents (user_id, channel, agreed_at, ...)
post_categories (code, name)           -- 취업후기/면접후기/직무Q&A/멘토링
post_scraps (user_id, post_id)
post_reports (post_id, reporter_id, reason, status)
posts + is_anonymous, tags[], file_ids[], school_id, blinded_at
```

### 2.4 채용·워크넷·추천

```
jobs 확장: occupation_code, skills[], education_level, source, worknet_id
worknet_jobs (id, external_id, payload jsonb, region, expired_at, raw_url)
worknet_events (...)
worknet_sync_logs (id, started_at, status, fetched, upserted, error)
resume_keywords (resume_id, token, weight)
job_keywords (job_id, token, weight)
job_recommendations (user_id, job_id, score, reasons jsonb, computed_at)
recommendation_feedback (user_id, job_id, event impression|click|apply, at)
job_scraps (user_id, job_id, school_id)  -- REC-002 연관·관심
```

통합 목록은 `jobs` UNION `worknet_jobs` 뷰 `v_job_listings` 또는 API 레이어 병합.

### 2.5 견학·공통

```
field_trips (id, school_id, company_name, place, date, capacity, deadline, mode fifo|approval, ...)
field_trip_applications (id, trip_id, user_id, status, attendance, ...)
field_trip_reports (trip_id UNIQUE, school_id, author_id, summary, outcome, attendees_*, file_ids[])
files (id, school_id, owner_user_id, bucket_key, mime, size, kind resume_pdf|counseling|attachment)
audit_logs (id, actor_id, school_id, action, resource, payload, ip, at)
notifications 확장 (event_code, channel)
```

## 3. ER 개요 (핵심)

```
schools 1──* users
schools 1──* departments
users *──* roles          (user_roles, school scoped)
users 1──* resumes 1──* resume_items
resumes 1──* resume_documents → files
users 1──* counseling_journals → counseling_documents → files
users(company) 1──1 company_profiles(approval) 1──* jobs 1──* job_applications ← resumes
jobs / worknet_jobs → job_recommendations ← users
schools 1──* field_trips 1──* field_trip_applications
roles *──* menus          (role_menu_permissions)
```

## 4. 테넌시 규칙

- **기본:** 업무 테이블 `school_id NOT NULL` + 인덱스 `(school_id, id)`.
- **예외:** `system_admin` 전역 설정, 워크넷 원본(전역 수집 후 학교 필터), 기업 회원이 여러 학교에 공고를 여는 경우 `job_school_targets` M:N.
- **상담:** `school_id` + `teacher_id` 이중 통제.
- **기업:** `company` 역할은 `users.school_id`(협력/게시 학교)로 범위. `company_profiles.approval_status≠approved`이면 공고 생성·수정 불가(REQ-JOB-007). 승인은 `company_approval` 권한 + 동일 `school_id`(기본 school_admin/system_admin; 설정 가능). null-school 기업·공고는 전역 공개하지 않음.

## 5. 마이그레이션 전략

1. `schools`에 전주공업고 시드 (v1 기본 테넌트).
2. `users.school_id`를 기본 학교로 backfill. `school_name`은 표시용 캐시로 유지 후 폐기 검토.
3. `majors` → `departments` (school_id=기본학교).
4. `announcements` 중 industry-visit → `field_trips` 이관 스크립트.
5. 신규 테이블 `IF NOT EXISTS` 마이그레이션 파일 `database/migrations/010_v2_multischool.sql` 부터 번호 부여.
   Wave 1에서 적용: `schools`, `departments`, `roles`, `menus`, `role_menu_permissions`, `user_roles`, `school_transfers`, `audit_logs`, `users.school_id` backfill(전주공업고), `counseling_journals.school_id`.
   Sprint 1에서 적용: `database/migrations/011_v2_sprint1_resumes.sql` — `files`, `resumes`, `resume_items`, `resume_documents`, `counseling_documents`, `counseling_journals` 유형 확장(진학/생활) + `action_taken`/`follow_up_at`, `job_applications.resume_id`.
   Sprint 2에서 적용: `database/migrations/012_v2_sprint2_workflow.sql` — `notifications.event_code`/`channel`/`school_id`/`payload`, `jobs.school_id` 기업 소속 백필.
   Sprint 3에서 적용: `database/migrations/013_v2_sprint3_community_tenancy.sql` — announcements/certificates/education_programs.school_id, posts backfill.
   Sprint 4에서 적용: `database/migrations/014_v2_sprint4_recommendations_fieldtrips.sql` — job_recommendations·keywords·feedback, field_trips 이관(industry-visit).
   Sprint 5에서 적용: `database/migrations/015_v2_sprint5_community_extras.sql` — post_categories, post_scraps, post_reports, posts.is_anonymous/blinded_at.
   Sprint 6에서 적용: `database/migrations/016_v2_sprint6_associated_com_trip.sql` — job_scraps, field_trip_reports, posts tags GIN.
   기업 승인: `database/migrations/017_v2_company_approval.sql` — `company_profiles.approval_*`, 기존 기업 `approved` 백필, 신규 DEFAULT `pending`.
   정책 반영: `018` DX 프로필만(전주공고 일괄 바인딩 제거), `019_v2_policy_company_approval_jobs.sql` — `company_approval` 메뉴 + 018 일괄 바인딩 되돌림(DX `company@jjob.com` 제외).
6. LocalStorage 데이터는 브라우저에만 있으므로 **자동 이관 불가**. 운영 매뉴얼에 재입력 안내. `company_profile_*`는 API `company_profiles`로 대체(B-LS).

## 6. 인덱스·무결성 (최소)

- `users(school_id, user_type)`, `jobs(school_id, status, deadline)`, `job_applications(user_id)`, `job_recommendations(user_id, score DESC)`
- Unique: `worknet_jobs.external_id`, `user_roles(user_id, role_id, school_id)`, `post_scraps(user_id, post_id)`, `job_scraps(user_id, job_id)`, `field_trip_reports(trip_id)`
- FK ON DELETE: 학교 삭제는 비활성화만 (하드 삭제 금지)
