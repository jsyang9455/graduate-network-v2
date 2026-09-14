# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Sprint 6 (REC-002·COM-002·스크랩 UI·사후보고)**  
전체 P0 구현: **약 62%** (Wave 1–Sprint 5 + REC-002 연관 추천·COM-002 태그/첨부·게시 스크랩 UI·견학 사후보고·worknet NOT_CONFIGURED 스텁. 워크넷·알림톡 실연동·Playwright 풀 스위트 미착수)

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
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 92 | in-progress (COM/REC paths) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 92 | in-progress (메시지/워크넷 잔여) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 95 | done |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 72 | in-progress (**워크넷 스텁만**, 실연동 0%) |
| Sprint 3 | 커뮤니티·공지 테넌시·B-LS | backend + api + frontend | 70 | done-ish (tenancy + Sprint5 COM) |
| Sprint 4 | 추천·견학·networking | backend + api + frontend | 85 | done-ish (REC-002·사후보고 Sprint6) |
| Sprint 5 | COM P0·B-LS·persona smoke | backend + api + frontend + qa | 85 | done-ish (태그/첨부·스크랩 UI는 Sprint6) |
| Sprint 6 | REC-002·COM-002·스크랩 UI·사후보고 | backend + api + frontend + qa | 80 | done-ish (API+UI+테스트. 브라우저 DoD partial) |
| 4 | 테스트·UAT·보안 | qa | 78 | in-progress (API **59/59** + persona smoke. Playwright optional) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 92 | job scrap / trip report school 범위 |
| IAM API·OpenAPI | api | 92 | associated + worknet stub + report paths |
| 권한 메뉴·schools UI | frontend | 78 | community.html·대시보드 스크랩 |
| 이력서 PDF | backend/frontend | 90 | |
| 상담 문서 | backend/frontend | 95 | |
| 채용 워크플로우 알림 | api/frontend | 70 | |
| 워크넷 | backend | 10 | status/sync stub `NOT_CONFIGURED` only |
| 추천 엔진 | backend | 85 | REC-002 associated P0 |
| 견학 모듈 | backend/frontend | 80 | 사후 보고 API+industry-visit UI |
| 커뮤니티 고도화 | api/frontend | 75 | COM-002 태그·첨부·스크랩 UI |
| 알림톡/SMS | backend | 15 | NOT_CONFIGURED |
| QA 스위트 | qa | 85 | sprint6 + 회귀 59. 선택 `npm run test:e2e` |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/4 일부 | architect |

해소: **B-PORT** — 프론트 `js/api.js` 로컬 API를 **5000**으로 통일. `localStorage.jjobb_api_base`로 5050 오버라이드.  
해소: **B-LS career/admin-jobs** — API만.  
해소: **B-LS company_profile_*** — `GET/PUT /api/users/company-profile` + `setup-test-profile.html` API 전환.

로컬 백엔드: 기본 `PORT=5000`. macOS AirPlay가 5000을 쓰면 `PORT=5050 npm start` 후  
`localStorage.setItem('jjobb_api_base','http://localhost:5050/api')`.

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Sprint 6 완료 기록 (REQ-REC-002, REQ-COM-002, scrap UI, REQ-TRP-003 사후보고)

- 마이그레이션 `database/migrations/016_v2_sprint6_associated_com_trip.sql`
  - `job_scraps`, `field_trip_reports`, posts tags GIN
- API: `GET /api/recommendations/associated`, job scrap, posts tags/`file_ids`/`?tag=`, `POST /api/files`, field-trip report, worknet stub
- 프론트: `community.html`, dashboard/news scrap, jobs「관심」, industry-visit 사후 보고, admin-board 태그
- QA: `sprint6-associated-com-trip.test.js` (5) → 전체 **59/59**
- 워크넷·알림톡 실연동 **안 함**. Playwright 풀 스위트 **안 함**

```
Handoff: sprint6-owner → qa
REQ: REQ-REC-002, REQ-COM-002, REQ-COM-003, REQ-TRP-003, REQ-WN-010
Need: community/scrap/after-report 브라우저 페르소나; optional Playwright
Done: associated API, tags/attachments, scrap UI, trip report, worknet stub, 59 tests

Handoff: sprint6-owner → architect
REQ: REQ-WN-*, REQ-MSG-*
Need: 게이트 ready 전 실연동 금지 유지
Done: NOT_CONFIGURED stubs only
```

### Sprint 6 Role Verifier / Progress Monitor (2026-09-14)

- 커밋: `28bc73c` — 상세 [docs/qa/sprint6-verification.md](qa/sprint6-verification.md)
- 판정: **partial pass** (API·스키마·스크랩 UI·사후보고·worknet NOT_CONFIGURED 스텁·**59/59** 확인). 브라우저 DoD·`file_ids` 전용 테스트·`also_scraped` 단언은 약함
- STATUS %: Sprint 6 **~80%** · 전체 P0 **~62%** · 워크넷 **10%** — **정직 유지** (하향 불필요)
- 게이트: 워크넷/알림톡 `unknown` — 실연동 금지 유지

```
Handoff: verifier/monitor → frontend/qa
REQ: REQ-COM-002/003, REQ-TRP-003, REQ-REC-002 UI
Need: community/scrap/after-report/jobs 관심 브라우저 페르소나 기록
Done: sprint6-verification.md; 59/59 reconfirmed
```

## Sprint 5 완료 기록 (요약)

COM scrap/report/blind/categories/popular, company-profile B-LS, persona smoke. 상세는 이전 STATUS/커밋 `6a0c418`.

## Sprint 4 완료 기록 (요약)

networking 가드, recommendations P0, field_trips P0. 상세: [docs/qa/sprint4-verification.md](qa/sprint4-verification.md).

## Sprint 3 완료 기록 (요약)

posts/announcements/certificates/education-programs school 가드, files 동일교 프라이버시, admin-board/profile API.

## Phase 0 / Wave 1 / Sprint 1–2 verification

이전 검증 절은 `docs/qa/*-verification.md` 참고.
