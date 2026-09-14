# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Phase 3 Wave 1 (멀티스쿨·RBAC·schools API)**  
전체 P0 구현: **약 18%** (기반 IAM/가드. 이력서·워크넷·추천 미착수)

## Gates (학교 제공물)

| 게이트 | 상태 | 영향 |
|--------|------|------|
| 워크넷(고용24) OpenAPI 키 | `unknown` | REQ-WN-* 실연동 보류 가능 |
| SMS/알림톡 유료 계정 | `unknown` | REQ-MSG-* 실발송 과업 제외 가능 |

Architect가 확인 후 `ready` / `blocked`로 바꾼다.

## Phases

| Phase | 내용 | Owner | % | 상태 |
|-------|------|-------|---|------|
| 0 | 비전/요구/아키텍처/역할, v2 저장소 | architect | 100 | done |
| 1 | 착수 보고·게이트 확인·현행 이슈 목록 | architect | 0 | todo |
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 40 | in-progress (OpenAPI Wave 1 초안) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 55 | in-progress (Wave 1 IAM/가드) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 0 | todo |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 0 | todo |
| Sprint 3 | 추천·견학·커뮤니티·메시지 | all implementers | 0 | todo |
| 4 | 테스트·UAT·보안 | qa | 20 | in-progress (타교 403 픽스처) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 80 | Wave 1: 010 마이그레이션, authorize+schoolScope, audit_logs |
| IAM API·OpenAPI | api | 70 | `/api/schools`, `/api/me/permissions`, JWT role/school, port 5000 |
| 권한 메뉴·schools UI | frontend | 70 | permissions 메뉴, 회원가입/코드관리 schools API, test_token 제거 |
| 이력서 PDF | backend/frontend | 0 | |
| 상담 문서 | backend/frontend | 0 | 유형 코드 불일치 해소 |
| 채용 워크플로우 알림 | api/frontend | 0 | |
| 워크넷 | backend | 0 | 게이트 |
| 추천 엔진 | backend | 0 | |
| 견학 모듈 | backend/frontend | 0 | announcements 이관 |
| 커뮤니티 고도화 | api/frontend | 0 | |
| 알림톡/SMS | backend | 0 | 게이트 |
| QA 스위트 | qa | 35 | 2교 픽스처 + 타교 403 (`backend/tests`) |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/3 일부 | architect |
| B-LS | career/admin-jobs 등 LocalStorage 운영 데이터 이관 불가 | 재입력 필요 | architect |

해소: **B-PORT** — 프론트 `js/api.js` 로컬 API를 **5000**으로 통일 (compose/backend와 동일).

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Phase 0 완료 기록

- v1 소스 분석 (graduate-network `main` / `7f331fc`)
- 고도화 과업지시서 반영한 docs 00–08
- Cursor 규칙/스킬 및 `AGENTS.md`
- GitHub v2: https://github.com/jsyang9455/graduate-network-v2 (public). 원본은 remote `v1`.

## Wave 1 완료 기록 (REQ-IAM-001~010, REQ-PLT-001/003)

- 마이그레이션 `database/migrations/010_v2_multischool.sql` (전주공업고 시드, `users.school_id` backfill)
- 미들웨어 `authorize` / `schoolScope`, JWT `role`+`school_id`, `POST /api/auth/change-password` 토큰 필수
- 프론트: 권한 메뉴, `register.html`/`admin-codes.html` → `/api/schools`, `test_token_` 우회 삭제
- QA: `backend/tests/wave1-tenancy.test.js` (학교 2곳, 타교 403)

```
Handoff: wave1-owner → frontend
REQ: REQ-RSM-001, REQ-PLT-001
Need: career.html LocalStorage → resumes API (Sprint 1)
Done: schools LocalStorage 철거, 권한 메뉴, port 5000

Handoff: wave1-owner → backend
REQ: REQ-PLT-004, REQ-CNS-004
Need: files 스토리지 어댑터, 상담 PDF/DOCX (Wave B)
Done: IAM 스키마/가드/audit

Handoff: wave1-owner → qa
REQ: REQ-IAM-009
Need: Playwright 페르소나 E2E (로그인→메뉴). API 타교 403은 node:test로 커버
Done: 2교 픽스처 + 통합 테스트
```

## Wave 1 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/wave1-verification.md](qa/wave1-verification.md).

- 커밋 `bb64a39`: IAM 기반은 실재. 판정 **partial** (전체 Pass 아님).
- `npm --prefix backend test`: **12/12 pass** (roles 2 + tenancy 10). Playwright 없음.
- STATUS 「REQ-IAM-001~010 완료」·Phase 3 **55%**는 **과대**. 모니터 추정: 전체 P0 **14–16%**, Phase 3 **35–45%**. 위 표 %는 Sprint 1 에이전트와 충돌하지 않도록 여기서 바꾸지 않음 — Architect가 정정.
- Sprint 1 전 블로커급: `files` 스토리지 없음, `career.html` LS, jobs/상담예약 테넌시 미장착, `GET /api/users` 로그인 필수 회귀.
- 게이트 Worknet/Alimtalk `unknown`, **B-LS** 유지. B-PORT 해소는 확인.
