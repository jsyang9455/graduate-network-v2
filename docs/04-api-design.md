# API 설계 — jjobb_v2

베이스: v1 Express `backend/server.js`. 인증: `Authorization: Bearer <JWT>`.
에러 모델은 기존 `{ error: string, detail?: string }`를 유지하고, v2부터 `{ error: { code, message, status } }`를 **추가 필드**로 넣는다 (프론트 점진 대응).

## 1. 공통

| 항목 | 규칙 |
|------|------|
| Prefix | `/api` (호환). 신규도 `/api/...` additive |
| 페이지 | `page`, `limit` (v1 jobs와 동일) |
| 테넌시 | 미들웨어가 `school_id` 주입. 클라이언트가 타교 id를 넣어도 무시/403 |
| 권한 | `authorize(menu, action)` — 메뉴 코드는 `schools`, `users`, `resumes`, `counseling`, `jobs`, `applications`, `recommendations`, `field_trips`, `community`, `messages`, `stats` |
| 성공 | 기존 키 유지 (`jobs`, `user`, `token` 등) + 필요 시 `data` |

표준 코드: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 400, `CONFLICT` 409, `NOT_CONFIGURED` 503 (워크넷/알림톡 키 없음), `INTERNAL` 500.

## 2. 기존 엔드포인트 (유지·강화)

`auth` 미들웨어 적용 여부는 코드 기준. **강화** = school 가드 + 메뉴 권한 + LocalStorage 우회 제거.

### Auth `/api/auth`

| Method | Path | Auth | v2 |
|--------|------|------|----|
| POST | `/register` | 공개 | `school_id` 필수(학생/교사). 기업은 별도 승인 플래그 검토 |
| POST | `/login` | 공개 | JWT에 `school_id`, `role` |
| GET | `/me` | 토큰 | 권한 목록 포함. `js/api.js` 로컬토큰 skip **삭제** |
| POST | `/change-password` | 토큰 | v1 `auth` 미들웨어 누락 → **반드시 보호** |

### Users `/api/users`

| Method | Path | v2 |
|--------|------|----|
| GET | `/stats` | 학교 범위 |
| POST | `/withdraw` | 유지 + 감사 |
| GET/PUT | `/profile` | PII 암호화 |
| GET | `/:id` | 범위 밖 404 |
| GET | `/` | school_admin 소속만 |
| PUT/DELETE/PATCH restore | `/:id` | 매트릭스 |
| GET/PUT | `/graduate-profile...` | 유지 |

### Jobs `/api/jobs`

| Method | Path | v2 |
|--------|------|----|
| GET | `/` | `source=internal\|worknet\|all`, school 필터 |
| GET/POST/PUT/DELETE | `/:id` | 가드 |
| POST | `/:id/apply` | `resume_id` 수용 (소유 이력서만). 없으면 대표 이력서 자동 첨부 |
| GET | `/:id/applicants` | 기업/관리 |
| GET | `/my/applications` | 워크플로우 상태 |
| POST | `/admin/sync-counts` | 유지 |
| DELETE | `/admin/clear-sample-jobs` | 운영에서 비활성 권장 |

지원 상태 변경 전용 `PATCH /api/jobs/applications/:id/status` 를 **신규**로 둔다 (알림 트리거).

### Counseling

- `/api/counseling` 예약 유지 + school_id
- `/api/counseling-journals` → 문서 생성 액션 추가

### 기타 유지

`/api/networking/*`, `/api/certificates/*`, `/api/posts/*`, `/api/majors`, `/api/stats`, `/api/announcements/*`, `/api/education-programs`, `/api/messages/*`, `GET /api/health`

`majors`는 과도기 유지 후 `/api/departments`로 이전.

## 3. 신규 엔드포인트

### Schools & IAM

| Method | Path | 권한 | REQ |
|--------|------|------|-----|
| GET/POST | `/api/schools` | system 관리 / school 읽기 | IAM-001 |
| GET/PATCH | `/api/schools/:id` | system / 해당 school_admin | IAM-001 |
| GET/POST | `/api/schools/:id/departments` | school 쓰기 | IAM-002 |
| GET | `/api/me/permissions` | 로그인 | IAM-008 |
| GET/PUT | `/api/roles/:code/permissions` | system 관리 | IAM-008 |
| POST | `/api/users/:id/roles` | 회원 관리 | IAM-007 |
| POST | `/api/users/:id/transfer` | 회원 관리 | IAM-005 |
| GET | `/api/audit-logs` | system/school 관리 | IAM-010 |

### Resumes

| Method | Path | 권한 | REQ |
|--------|------|------|-----|
| GET/POST | `/api/resumes` | 본인 쓰기, 교사 읽기 | RSM-001 |
| GET/PUT/DELETE | `/api/resumes/:id` | 소유자 | RSM-002 |
| POST | `/api/resumes/:id/primary` | 소유자 | RSM-002 |
| GET | `/api/resumes/:id/preview` | 소유자 | RSM-003 |
| POST | `/api/resumes/:id/pdf` | 소유자 | RSM-004 |
| GET | `/api/files/:id` | 인가된 열람 | RSM-005 |

### Counseling documents

| Method | Path | REQ |
|--------|------|-----|
| POST | `/api/counseling-journals/:id/pdf` | CNS-004 |
| POST | `/api/counseling-journals/:id/docx` | CNS-004 |
| GET | `/api/counseling-journals/stats` | CNS-005 |
| GET | `/api/counseling-journals/timeline/:studentId` | CNS-002 |

### Recommendations

| Method | Path | REQ |
|--------|------|-----|
| GET | `/api/recommendations/me` | REC-004 |
| POST | `/api/recommendations/recompute` (admin/cron) | REC-005 |
| POST | `/api/recommendations/feedback` | REC-006 |

### Worknet

| Method | Path | 조건 | REQ |
|--------|------|------|-----|
| GET | `/api/worknet/status` | 항상 (configured: false 가능) | WN-010 |
| POST | `/api/worknet/sync` | 키 없으면 503 NOT_CONFIGURED | WN-004 |
| GET | `/api/worknet/logs` | 관리 | WN-004 |

### Field trips

| Method | Path | REQ |
|--------|------|-----|
| GET/POST | `/api/field-trips` | TRP-001 |
| GET/PUT | `/api/field-trips/:id` | TRP-001 |
| POST | `/api/field-trips/:id/apply` | TRP-002 |
| PATCH | `/api/field-trips/applications/:id` | TRP-002 |
| GET | `/api/field-trips/:id/roster` | TRP-003 |
| PATCH | `/api/field-trips/:id/attendance` | TRP-003 |

### Community extras

| Method | Path | REQ |
|--------|------|-----|
| POST | `/api/posts/:id/scrap` | COM-003 |
| POST | `/api/posts/:id/report` | COM-005 |
| POST | `/api/posts/:id/blind` | COM-005 운영자 |

### Notify (P2 실발송)

| Method | Path | REQ |
|--------|------|-----|
| GET/POST | `/api/message-templates` | MSG-003 |
| POST | `/api/messages/broadcast` | MSG-003 |
| GET | `/api/message-logs` | MSG-003 |
| PUT | `/api/me/consents` | MSG-004 |

미설정 시 브로드캐스트는 인앱만 수행하고 `channel_skipped: alimtalk`을 반환.

## 4. 프론트 호환 주의

- `js/api.js` `API_BASE_URL`: **로컬 5000** (compose/backend와 통일). 운영은 Nginx `/api`.
- 목록 응답 키(`jobs`, `journals`) 유지.
- JWT `user_type` 필드 유지 (`school_admin` 추가). `role`, `school_id` 클레임 추가.
- `test_token_` / `user_token_` 우회 **제거**.
- Wave 1 구현: `GET/POST /api/schools`, `GET/PATCH /api/schools/:id`, `GET/POST /api/schools/:id/departments`, `GET /api/me/permissions`, `GET /api/audit-logs`, `POST /api/users/:id/roles`, `POST /api/users/:id/transfer`. OpenAPI 초안: `docs/openapi.yaml`.
- Sprint 1 구현: `GET/POST /api/resumes`, `GET/PUT/DELETE /api/resumes/:id`, `POST /api/resumes/:id/primary`, `GET /api/resumes/:id/preview`, `POST /api/resumes/:id/pdf`, `GET /api/files/:id`, `POST /api/jobs/:id/apply` `resume_id`, `POST /api/counseling-journals/:id/pdf|docx`, `GET /api/counseling-journals/stats`, `GET /api/counseling-journals/timeline/:studentId`.

## 5. OpenAPI

구현 착수 시 `docs/openapi.yaml`을 API 에이전트가 소유한다. 본 문서가 인벤토리, OpenAPI가 스키마 진실 공급원.
