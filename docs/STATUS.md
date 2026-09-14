# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Sprint 5 (커뮤니티 P0·B-LS·persona smoke)**  
전체 P0 구현: **약 58%** (Wave 1–Sprint 4 + REQ-COM P0 슬라이스(스크랩·신고·블라인드·분류·인기)·company_profile API·persona smoke. 워크넷·알림톡 실연동·REC-002·COM-002 태그·첨부 고도화 미착수)

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
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 88 | in-progress (COM paths) |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 90 | in-progress (메시지/워크넷 잔여) |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 95 | done |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 70 | in-progress (**워크넷 0%**) |
| Sprint 3 | 커뮤니티·공지 테넌시·B-LS | backend + api + frontend | 70 | done-ish (tenancy + Sprint5 COM) |
| Sprint 4 | 추천·견학·networking | backend + api + frontend | 75 | done-ish (REC/TRP P0. REC-002 잔여) |
| Sprint 5 | COM P0·B-LS·persona smoke | backend + api + frontend + qa | 80 | in-progress (COM P0·B-LS·smoke. 태그/첨부·브라우저 UI 잔여) |
| 4 | 테스트·UAT·보안 | qa | 72 | in-progress (API **54/54** + persona smoke. Playwright optional) |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 90 | networking + posts scrap/report school 범위 |
| IAM API·OpenAPI | api | 90 | COM scrap/report/blind + company-profile |
| 권한 메뉴·schools UI | frontend | 72 | admin-board 블라인드 |
| 이력서 PDF | backend/frontend | 90 | |
| 상담 문서 | backend/frontend | 95 | |
| 채용 워크플로우 알림 | api/frontend | 70 | |
| 워크넷 | backend | 0 | 게이트 unknown |
| 추천 엔진 | backend | 70 | REC-002 미구현 |
| 견학 모듈 | backend/frontend | 65 | |
| 커뮤니티 고도화 | api/frontend | 55 | COM-001/003/004/005 P0. COM-002·첨부 미완 |
| 알림톡/SMS | backend | 15 | NOT_CONFIGURED |
| QA 스위트 | qa | 80 | sprint5 + persona-smoke. 선택 `npm run test:e2e` |

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

## Sprint 5 완료 기록 (REQ-COM-001/003/004/005 P0, REQ-PLT-001 B-LS, persona smoke)

- 마이그레이션 `database/migrations/015_v2_sprint5_community_extras.sql`
  - `post_categories`, `post_scraps`, `post_reports`
  - `posts.is_anonymous`, `blinded_at`/`blinded_by`/`blind_reason`, tags/file_ids 컬럼
- API: categories, scrap, report, blind, popular sort, company-profile
- 프론트: admin-board 블라인드, setup-test-profile API, `jjobb_api_base` 오버라이드
- QA: `sprint5-community.test.js` + `persona-smoke.test.js` (node:test). 선택 Puppeteer `npm run test:e2e`
- 문서: `docs/qa/e2e-persona-smoke.md`, README 포트/DX
- 워크넷·알림톡·REC-002·COM-002 **안 함**. Playwright 풀 스위트 **안 함**(경량 스모크)

```
Handoff: sprint5-owner → qa
REQ: REQ-COM-001,003,004,005, REQ-PLT-001
Need: admin-board 블라인드 브라우저 확인; scrap UI는 API 우선
Done: COM P0 API, B-LS company profile, persona smoke in node:test

Handoff: sprint5-owner → backend
REQ: REQ-WN-*, REQ-REC-002, REQ-COM-002
Need: 워크넷 게이트, 연관 추천, 직무·기업 태그
Done: scrap/report/blind/categories/popular + company-profile API
```

### Sprint 5 검증 (Role Verifier + Progress Monitor)

- **기준 커밋:** `6a0c418` · 상세: [docs/qa/sprint5-verification.md](qa/sprint5-verification.md)
- **판정:** partial pass (COM P0 API·B-LS·persona smoke 강함). COM-002·첨부·브라우저 UI·워크넷 잔여(의도)
- **테스트 재실행:** **54/54 pass** (2026-09-14). Playwright 풀 스위트 없음(선택 Puppeteer)
- **STATUS 정직성:** Sprint 5 **~80%** · 전체 P0 **~58%** · 워크넷 **0%/게이트 unknown** — 모니터 **유지 권장**(과대 없음)
- 수치 변경 없음(git 실진척과 일치).

## Sprint 4 완료 기록 (요약)

networking 가드, recommendations P0, field_trips P0. QA 46 tests → Sprint 5에서 확장. 상세: [docs/qa/sprint4-verification.md](qa/sprint4-verification.md) (기준 `b7277f2`).

## Sprint 3 완료 기록 (요약)

posts/announcements/certificates/education-programs school 가드, files 동일교 프라이버시, admin-board/profile API.

## Phase 0 / Wave 1 / Sprint 1–2 verification

이전 검증 절은 `docs/qa/*-verification.md` 참고.
