# 작업지시서 — 학교 테넌트 UX · 브랜딩 · 메뉴 RBAC

| 항목 | 값 |
|------|-----|
| 작성일 | 2026-09-16 |
| Owner | architect → backend + api + frontend + qa |
| REQ | REQ-IAM-001, REQ-IAM-003, REQ-IAM-008, REQ-IAM-009, REQ-PLT-002, REQ-PLT-003, REQ-PLT-004 |
| 게이트 | 워크넷·알림톡 **변경 없음** (`NOT_CONFIGURED`) |
| 스택 | HTML/CSS/JS + Express + PostgreSQL (React 금지, JWT만 localStorage) |

## 1. 목적

학교 단위 테넌시가 이미 존재한다. 아래 UX 갭을 닫아 **소속 학교 맥락이 보이는 브랜드드 사이트**로 만든다.

1. **관리자 좌측 메뉴 깜빡임** — 권한 매트릭스 / 코드 관리가 권한 로드 전후로 보였다 사라짐
2. **학교 등록 시 주 담당자(school_admin) 필수** — 학교만 만들고 담당자 없는 상태 금지
3. **교사·학생·졸업생 로그인 후 소속 학교 컨텍스트** — 전역 사이트처럼 보이지 않음
4. **학교 로고** — 등록 시 업로드, 로그인 후 헤더·대시보드에 표시

## 2. 범위 / 비범위

### In scope

| ID | 내용 |
|----|------|
| WO-01 | 사이드바 RBAC: permissions 로드 전 관리 메뉴 숨김, `data-menu`(+최소 액션) 통일 |
| WO-02 | `schools.logo_file_id`, `schools.primary_admin_user_id` + 마이그레이션 |
| WO-03 | `POST /api/schools` 트랜잭션: 학교 + 주 담당자(신규 또는 기존 연결) |
| WO-04 | 로고 업로드·공개 스트림 `POST/GET …/schools/:id/logo` |
| WO-05 | `GET /auth/me`·`GET /schools/:id`에 school name/logo 포함 |
| WO-06 | `admin-codes` 학교 등록 폼: 주 담당자 + 로고 |
| WO-07 | 공통 브랜딩 스크립트: 헤더/대시보드에 학교명·로고 |
| WO-08 | 테스트 + curl/브라우저 검증, STATUS/% 갱신 |

### Out of scope

- React 재작성, localStorage 업무 데이터, 워크넷/알림톡 실연동
- 학교별 커스텀 CSS 테마(색상 팔레트) — 로고·학교명으로 충분
- `admin-schools.html` 신규 페이지 분리 (기존 `admin-codes` 확장)

## 3. 원인 분석 (메뉴 깜빡임)

| 원인 | 증상 |
|------|------|
| `updateAuthUI` / `dashboard.js`가 permissions 전에 `#adminMenuSection`을 `display:block` | 전체 관리 메뉴가 먼저 보임 |
| `applyPermissionMenus` 비동기 완료 후 `data-menu` 항목만 숨김 | 권한 매트릭스·코드가 늦게 사라지거나 페이지마다 다름 |
| 일부 페이지만 `data-menu="schools"` | 페이지 이동 시 메뉴 구성이 불일치 |
| 권한 매트릭스는 `schools` **manage**, 코드 관리는 **write**인데 동일 `data-menu` | school_admin에게 매트릭스가 보였다 숨겨지거나 API 403 |

## 4. 데이터 모델

마이그레이션: `database/migrations/020_v2_school_logo_primary_admin.sql`

```
schools
  + logo_file_id INTEGER NULL REFERENCES files(id)
  + primary_admin_user_id INTEGER NULL REFERENCES users(id)

files.kind  CHECK 확장: 기존 + 'school_logo'
```

- `logo_url`은 DB 컬럼이 아니라 API 파생: `/api/schools/{id}/logo` (공개 GET, img src 용)
- 주 담당자는 `primary_admin_user_id` + `user_roles(school_admin)` + `users.user_type='school_admin'` 동기화

## 5. API 계약

| Method | Path | Auth | 변경 |
|--------|------|------|------|
| POST | `/api/schools` | `schools` manage | **필수** `primary_admin`: `{ user_id }` **또는** `{ email, name, password }` (+optional phone). 같은 트랜잭션. 응답에 `primary_admin` 요약 |
| GET | `/api/schools`, `/api/schools/:id` | 목록 공개(active) | 응답에 `logo_file_id`, `logo_url`, `primary_admin_user_id`, `primary_admin_name`(단건) |
| PATCH | `/api/schools/:id` | schools write | optional `logo_file_id`, `primary_admin` 재지정 |
| POST | `/api/schools/:id/logo` | schools write + school scope | multipart `file` → kind=`school_logo`, `logo_file_id` 갱신 |
| GET | `/api/schools/:id/logo` | **공개** | 이미지 스트림. 없으면 404 |
| GET | `/api/auth/me` | JWT | `user.school` `{ id, name, logo_url }` 부가 (additive) |

에러:

- 주 담당자 누락 → `400 VALIDATION`
- 이메일 중복(신규) → `409 CONFLICT`
- 기존 user_id가 타교 소속이면 → `409 CONFLICT` 또는 시스템관리자만 전입 허용(본 작업: **같은 school로만 신규 생성 또는 미배정/동일교 사용자 연결**)

## 6. UI 화면

| 화면 | 변경 |
|------|------|
| 모든 관리 사이드바 | `data-menu` + `data-menu-min` 통일. permissions=`manage`, codes=`write`(schools) |
| `js/auth.js` | permissions 로드 전 admin 섹션/`[data-menu]` 숨김(`.rbac-pending`). 로드 후 표시. race 제거 |
| `admin-codes.html` | 학교 등록: 주 담당자 필드(신규 email/name/password **또는** 기존 user_id), 로고 파일 input |
| `js/school-brand.js` (+ auth 연동) | 로그인 사용자 `school_id` → me/school 로드 → `.logo` / `#welcomeSubtext` / `document.title`에 학교명·로고 |
| `dashboard.html` | welcome에 학교명, 헤더 로고 교체 훅 (`#brandLogo`, `#schoolContextLabel`) |
| `css/style.css` / `dashboard.css` | 학교 로고 크기, rbac-pending 숨김 |

## 7. DoD (완료 조건)

- [x] 작업지시서·STATUS·API/데이터 문서 갱신
- [x] 학교 생성 시 주 담당자 없이 `400`
- [x] 학교 생성 + school_admin 로그인 성공 (같은 school_id)
- [x] 로고 업로드 후 `GET /api/schools/:id/logo` 200 (자동화 TC-04)
- [x] student/teacher/graduate 로그인 시 소속 학교명(·로고) 노출 (`/auth/me`)
- [x] admin 사이드바: permissions 로드 전 권한 매트릭스/코드 관리 **깜빡임 방지** (rbac-pending)
- [x] school_admin은 코드 관리(write) 보임, 권한 매트릭스(manage) 숨김 (TC-06/07 + data-menu-min)
- [x] 관련 자동화 테스트 통과; curl 검증 기록 ([verification](school-tenant-branding-verification.md))
- [ ] 커밋 + push (force-push 금지) — 세션 말미

## 8. 테스트 케이스

| ID | REQ | 절차 | 기대 |
|----|-----|------|------|
| TC-01 | IAM-001/003 | POST /schools name only | 400 |
| TC-02 | IAM-003 | POST + primary_admin 신규 | 201, user school_admin, primary_admin_user_id set |
| TC-03 | IAM-003 | 동일 이메일로 재생성 | 409 |
| TC-04 | PLT-004 | POST logo → GET logo | 201/200 image |
| TC-05 | IAM-009 | student A의 me.school.name = School A | 일치, B 로고 아님 |
| TC-06 | IAM-008 | school_admin permissions 메뉴 | codes visible, permissions hidden |
| TC-07 | IAM-008 | system_admin | both visible; no flicker (pending class) |
| TC-08 | UI | browser dashboard after login | school name + logo in header/welcome |

## 9. 핸드오프

```
Handoff: architect → backend+api+frontend+qa
REQ: REQ-IAM-001/003/008/009, REQ-PLT-002/003/004
Need: migration 020, schools API, auth me school, auth.js RBAC, admin-codes form, school-brand.js
Done: this work order + STATUS brief
```
