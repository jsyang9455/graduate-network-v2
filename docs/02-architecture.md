# 시스템 아키텍처 — jjobb_v2

## 1. 결정 원칙

과업지시서 Ⅲ.2: **기존 1차 자산(Node.js·Express·PostgreSQL·Docker)을 계승하여 고도화**한다.  
프론트엔드를 React로 재작성하지 않는다. 멀티스쿨·권한·문서·연동을 **모듈로 얹는다**.

## 2. 계승 스택

| 계층 | v1 | v2 |
|------|----|----|
| Frontend | HTML5, CSS3, JS ES6+, 반응형 | 동일. `js/` 공통 모듈화 강화, 권한 기반 메뉴 렌더링 |
| API | Express 4, helmet, cors, morgan | 동일 + 인가 가드, OpenAPI, 버전 `/api/v2` 병행 후 `/api` 호환 |
| Auth | JWT + bcrypt, `checkRole(user_type)` | JWT 클레임에 `school_id`, `role`. RBAC 매트릭스 엔진 |
| DB | PostgreSQL 15 | 동일. `school_id` 컬럼·RLS 또는 애플리케이션 가드 |
| Files | 없음 (URL 문자열) | S3 호환 스토리지 (로컬은 MinIO/디스크 어댑터) |
| Jobs | 없음 | `node-cron` (워크넷 수집, 추천 재계산, 백업, 파기) |
| Docs | 없음 | HTML→PDF (한글 폰트 임베드), DOCX 템플릿 |
| Proxy | Nginx | 동일 + HTTPS |
| Deploy | Docker Compose, AWS EC2 Ubuntu | 동일. GitHub 배포 |

**하지 않는 것:** Next.js, GraphQL, 마이크로서비스 분해, Kubernetes (13주 범위 밖).

## 3. 논리 구성

```
[Browser: HTML/CSS/js]
    │ JWT
    ▼
[Nginx] 정적파일 + /api 프록시 + TLS
    ▼
[Express app]
    ├─ middleware: authJwt → authorize(menu, action) → schoolScope
    ├─ routes (기존 + 신규)
    ├─ modules/
    │    ├─ rbac/          권한 매트릭스 캐시
    │    ├─ documents/     PDF/DOCX
    │    ├─ notify/        in-app + (optional) Alimtalk/SMS
    │    ├─ recommend/     매칭 점수
    │    ├─ storage/       S3/local
    │    └─ worknet/       OpenAPI 클라이언트 (키 없으면 disabled)
    ├─ jobs/cron
    └─ pg pool
         ▼
[PostgreSQL]  +  [Object storage]
```

컨테이너는 v1 `docker-compose.yml` 3티어(postgres / backend / frontend)를 유지하고, 필요 시 `minio` 서비스를 추가한다.

## 4. 모듈 책임

| 모듈 | 위치 (제안) | 책임 | Owner 에이전트 |
|------|-------------|------|----------------|
| 화면 | `*.html`, `js/`, `css/` | IA, 권한 메뉴, 반응형 | Frontend |
| 도메인 라우트 | `backend/routes/` | HTTP 입출력 | API + Backend |
| RBAC | `backend/middleware/authorize.js` | 메뉴×액션, school_id 강제 | Backend |
| 이력서/상담 문서 | `backend/modules/documents/` | 템플릿, 폰트, 파일 메타 | Backend |
| 추천 | `backend/modules/recommend/` | 점수, 사유, 재계산 | Backend |
| 워크넷 | `backend/modules/worknet/` | 수집, 중복, 로그 | Backend / API |
| 알림 | `backend/modules/notify/` | 이벤트 버스, provider | Backend |
| 스키마 | `database/` | 마이그레이션 SQL | Backend |
| OpenAPI | `docs/openapi.yaml` (구현 시) | 계약 | API |

## 5. 인증·인가 흐름

1. 로그인: 기존 `POST /api/auth/login` → JWT (`id`, `email`, `name`, `role`, `school_id`, `user_type` 호환).
2. `user_type` v1 값은 유지하되 매핑: `admin` → `system_admin` (마이그레이션), 신규 `school_admin`.
3. 모든 보호 API: `auth` 후 `authorize({ menu, action })`.
4. `schoolScope`: `system_admin` 제외 `WHERE school_id = req.user.school_id` (기업은 소속/협력 학교 또는 전역 공고 정책).
5. 상담 기록: 추가 가드 (담당 교사 또는 해당 `school_admin`).
6. 프론트: `/api/me/permissions`로 메뉴 렌더. 숨겨진 URL 직접 접근도 API가 403.

## 6. 데이터 흐름 (핵심 시나리오)

**지원:** 학생 대표 이력서 PDF(storage) → `POST /jobs/:id/apply` `{ resume_id }` → `job_applications` → notify(기업/학생) → 추천 피드백.

**추천 재계산:** cron → 활성 이력서 키워드 ↔ 공고 키워드 → `job_recommendations` upsert.

**워크넷:** cron 또는 관리자 수동 → OpenAPI → `worknet_jobs` → 통합 목록 API가 `source=internal|worknet` 반환.

**멀티스쿨 격리:** 어떤 SELECT/UPDATE도 가드 우회 금지. 통합 테스트로 타교 403/빈목록 검증.

## 7. LocalStorage 철거 대상 (v1 실측)

| 키/화면 | 이관 대상 |
|---------|-----------|
| `career_*` (`career.html`) | `resumes` / `resume_items` |
| `schools` (`admin-codes.html`, `register.js`) | `schools` 테이블 + `/api/schools` |
| `jobPostings` 폴백 (`admin-jobs.html`) | `/api/jobs`만 |
| `recentNews`, `educationPrograms` 폴백 | `/api/posts`, `/api/education-programs` |
| `company_profile_*` | `company_profiles` |
| `counseling_journals` 폴백 (`dashboard.js`) | `/api/counseling-journals` |
| `token`, `graduateNetwork_user` | 토큰만 유지. 프로필은 `/api/auth/me` |

`js/api.js`의 `test_token_` / `user_token_` 우회는 **제거**한다 (보안 부채).

## 8. 배포

- 개발: `docker compose up` (v1과 동일). API 포트 불일치 정리: README는 5000, `js/api.js` 로컬은 **5001**. v2에서 compose/nginx와 프론트를 **5000 또는 단일 /api 프록시**로 통일.
- 운영: AWS EC2 + Docker + Nginx SSL. 비밀값은 `.env` / 인스턴스 환경변수. `docker-compose.yml`의 JWT 평문 기본값은 개발 전용.
- 백업: pg_dump cron 매일, 7일 보관, 주 1회 암호화 오프사이트 (과업 Ⅲ.3.3).

## 9. API 버전

- 기존 `/api/*`는 프론트 호환을 위해 유지하되, 가드·school_id를 내부 적용.
- 신규 리소스는 `/api/schools`, `/api/resumes`, `/api/recommendations` 등 추가.
- Breaking change가 필요하면 `/api/v2`를 만들고 프론트를 한 번에 전환. 기본 전략은 **확장(additive)**.

## 10. 리스크

| 리스크 | 대응 |
|--------|------|
| 워크넷 키 지연 | 스텁 + STATUS 게이트. 통합 목록 UI는 자체 공고만으로도 동작 |
| 알림톡 계정 지연 | notify 모듈 no-op. 인앱만 |
| LocalStorage에만 있는 운영 데이터 | 이관 스크립트 + 수동 확인 (학교 코드 등) |
| 멀티스쿨 누수 | 통합 테스트 필수. Role Verifier가 가드 우회 PR 거부 |
| 13주 일정 | P0 먼저 (06-delivery-plan). P1 태그/협업추천은 Sprint 3 후순위 |
