# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Sprint 4 (추천·견학·networking 테넌시)**  
전체 P0 구현: **약 52%** (Wave 1–Sprint 3 + networking 가드 + REQ-REC P0 슬라이스 + field_trips P0. 워크넷·알림톡 실연동·Playwright·REC-002 연관추천·COM 스크랩 미착수)

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
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 85 | in-progress (OpenAPI Sprint 4 paths) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 88 | in-progress (networking 포함. 메시지/워크넷 잔여) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 95 | done |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 70 | in-progress (**워크넷 0%**) |
| Sprint 3 | 커뮤니티·공지 테넌시·B-LS | backend + api + frontend | 55 | done-ish (posts/announcements/certificates/files. 추천·견학은 Sprint 4) |
| Sprint 4 | 추천·견학·networking | backend + api + frontend | 75 | in-progress (REC P0·TRP P0·networking 가드. REC-002/COM/메시지 잔여) |
| 4 | 테스트·UAT·보안 | qa | 62 | in-progress (API 46건. Playwright 없음) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 90 | networking mentors/connect/mentorship 학교 범위. posts~education 유지 |
| IAM API·OpenAPI | api | 88 | recommendations + field-trips 경로 |
| 권한 메뉴·schools UI | frontend | 70 | |
| 이력서 PDF | backend/frontend | 90 | |
| 상담 문서 | backend/frontend | 95 | |
| 채용 워크플로우 알림 | api/frontend | 70 | |
| 워크넷 | backend | 0 | 게이트 unknown |
| 추천 엔진 | backend | 70 | 키워드 오버랩+규칙보정, cron, `/recommendations/me`. REC-002 미구현 |
| 견학 모듈 | backend/frontend | 65 | `field_trips` 이관·신청·명단·출결. industry-visit → API |
| 커뮤니티 고도화 | api/frontend | 0 | |
| 알림톡/SMS | backend | 15 | NOT_CONFIGURED |
| QA 스위트 | qa | 72 | sprint4-recommendations-fieldtrips 포함 46 tests |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/4 일부 | architect |
| B-LS | company_profile_* 등 잔여 LocalStorage | 재입력 안내 | architect |

해소: **B-PORT** — 프론트 `js/api.js` 로컬 API를 **5000**으로 통일.  
해소: **B-LS career/admin-jobs** — API만.

로컬 백엔드: 기본 `PORT=5000`. macOS AirPlay가 5000을 쓰면 `PORT=5050 npm start` 후 API_BASE를 맞출 것.

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Sprint 4 완료 기록 (REQ-IAM-009 networking, REQ-REC-001/003/004/005, REQ-TRP-001~003 P0)

- 마이그레이션 `database/migrations/014_v2_sprint4_recommendations_fieldtrips.sql`
  - `resume_keywords`, `job_keywords`, `job_recommendations`, `recommendation_feedback`
  - `field_trips` / `field_trip_applications` + announcements `industry-visit` 이관
- 추천 모듈 `backend/modules/recommendations` — 스코어링 요인: skill_overlap, location_match, deadline_boost, major_fit, freshness
- cron `backend/jobs/cron.js` (node-cron, `DISABLE_CRON=1`로 테스트 비활성)
- API: `/api/recommendations/me|recompute|feedback`, `/api/field-trips*`
- networking: mentors/connect/mentorship schoolScope, 타교 403
- 프론트: `js/dashboard.js` 추천 피드, `industry-visit.html` → field-trips API
- QA: `backend/tests/sprint4-recommendations-fieldtrips.test.js` — 전체 **46/46 pass**
- 워크넷·알림톡 실연동 **안 함**. Playwright **안 함**

브라우저: 백엔드 기동 시 dashboard 추천 카드·industry-visit 목록/신청 curl·API 검증. AirPlay 5000이면 `PORT=5050`.

```
Handoff: sprint4-owner → qa
REQ: REQ-REC-004, REQ-TRP-002, REQ-IAM-009
Need: Playwright 페르소나 (추천 카드·견학 신청). API는 node:test
Done: recommendations feed, field_trips apply/roster, networking 403

Handoff: sprint4-owner → backend
REQ: REQ-WN-*, REQ-REC-002, REQ-COM-*
Need: 워크넷 게이트, 연관 추천, 커뮤니티 스크랩/신고
Done: REC P0 batch + field_trips P0 + networking tenancy
```

## Sprint 3 완료 기록 (요약)

posts/announcements/certificates/education-programs school 가드, files 동일교 프라이버시, admin-board/profile API. 39→(Sprint4)46 tests.

## Sprint 4 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/sprint4-verification.md](qa/sprint4-verification.md). **기준 커밋 `b7277f2`.**

- 커밋 `b7277f2`: networking mentors/connect 학교 범위·타교 403, recommendations 스키마·explainable factors·`/me`·cron, `field_trips` 이관·apply/roster/attendance는 실재. 판정 **partial** (P0 슬라이스 강함; REC-002·COM·사후보고·Playwright 미충족).
- 본 세션 `npm --prefix backend test`: **46/46 pass**. Playwright 없음.
- STATUS Sprint 4 **75%**·전체 P0 **~52%**·워크넷 **0%**/게이트 `unknown`·알림톡 `NOT_CONFIGURED`: **대체로 정직** (상단 표 유지).
- 잔여: REQ-WN-*·REQ-REC-002·REQ-COM-*·TRP 사후 보고·Playwright·B-LS `company_profile_*`.

## Sprint 3 verification (2026-09-14, read-only)

Role Verifier + Progress Monitor. **앱/테스트/마이그레이션 미수정.** 본문은 [docs/qa/sprint3-verification.md](qa/sprint3-verification.md). **기준 커밋 `78ba7ee`(Sprint 3 주장 35% / P0 ~44%).** 위 표 %는 Sprint 4에서 갱신됨.

- 커밋 `78ba7ee`: posts/announcements/certificates/education-programs 학교 가드·타교 403, `GET /api/files` 동일교 peer `resume_pdf` 403, admin-board API 이관, profile `/auth/me` 우선은 실재. 판정 **partial**.
- 당시 `npm --prefix backend test`: **39/39 pass**. Playwright 없음.
- 잔여(당시): networking 테넌시, REQ-REC/TRP — **Sprint 4에서 해소**. COM/워크넷/Playwright·B-LS `company_profile_*` 잔여.
- 게이트 Worknet/Alimtalk `unknown` 유지.

## Phase 0 / Wave 1 / Sprint 1–2 verification

이전 검증 절은 `docs/qa/*-verification.md` 참고. 본 STATUS 상단 %는 Sprint 4 구현 반영.
