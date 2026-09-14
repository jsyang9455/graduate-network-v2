# Sprint 4 검증 보고서 — Role Verifier + Progress Monitor

- **일자:** 2026-09-14
- **커밋:** `b7277f2745f3119a35d591f2190e5ce835e08d3a` (`feat(sprint4): recommendations, field trips, networking school scope`)
- **포함:** Wave 1·Sprint 1–3 QA는 부모 히스토리. 본 검증은 `b7277f2` 트리.
- **역할:** Role Verifier → Progress Monitor (읽기 전용; 앱/테스트/마이그레이션 미수정)
- **판정:** Sprint 4 **부분 통과 (partial / P0 슬라이스 강함)**. networking schoolScope·타교 connect 403, recommendations 스키마·설명 가능 요인·API·cron, `field_trips` 이관·신청·명단·출결, 테스트 **46/46**은 실재. REC-002·COM·워크넷·Playwright·사후 보고는 미충족. STATUS Sprint 4 **75%**·P0 **~52%**·워크넷 **0%/게이트 unknown**은 **대체로 정직**.

## 1. Role compliance

| 검사 | 결과 | 메모 |
|------|------|------|
| 스택 계승 (OUT-01 React 금지) | **Pass** | Express 모듈/라우트 + SQL 마이그레이션 + HTML/JS 소폭 |
| 테넌시 (`school_id` + 가드) | **Pass** (범위 내) | networking mentors/connect/mentorship; recommendations school-scoped feed; field-trips apply/roster 403 |
| 시크릿 `.env` 커밋 | **Pass** | 커밋에 시크릿 없음 |
| 업무 `localStorage` 신규 키 | **Pass** | dashboard/industry-visit는 API. `token` getItem만 (기존 JWT 패턴). B-LS `company_profile_*` 잔존 |
| REQ 인용 | **Pass** | 커밋·STATUS·테스트·`docs/04`에 REQ-REC-001/003/004/005, REQ-TRP-001~003, REQ-IAM-009 |
| docs 03/04/OpenAPI + STATUS | **Pass** | 마이그레이션 주석, API 목록, 스코어링 표, openapi paths, STATUS Sprint 4 기록 |
| 프론트 브라우저 검증 명시 | **Partial** | STATUS에 curl·API·「백엔드 기동 시」언급. Playwright/페르소나 E2E 기록 없음 |
| 한 세션 = 한 역할 | **Fail (process)** | 단일 커밋이 backend + api docs + frontend + QA (기존 Sprint 패턴) |

## 2. Sprint 4 DoD 항목

공통: STATUS 「Sprint 4 완료 기록」. delivery-plan W9–11 Wave D는 추천·견학·커뮤니티·메시지 전체 — 본 커밋은 **추천 P0 + 견학 P0 + networking 가드** 슬라이스.

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 마이그레이션 `014_v2_sprint4_recommendations_fieldtrips.sql` | **Pass** | `resume_keywords`/`job_keywords`/`job_recommendations`/`recommendation_feedback`; `field_trips`/`field_trip_applications`; industry-visit INSERT 이관 + applications DO 블록 |
| 2 | Explainable scoring factors | **Pass** (P0 해석) | `skill_overlap`, `location_match`, `deadline_boost`, `major_fit`, `freshness`. 모듈 주석·`docs/04` 표·유닛 테스트. 전문 TF-IDF 스택은 아님(백-오브-워즈 코사인 유사) |
| 3 | recommendations API + school scope | **Pass** | `GET /me`, `POST /recompute`, `POST /feedback`. 테스트: A 공고 포함·B 공고 제외·`reasons` 존재 |
| 4 | cron 재계산 (REQ-REC-005) | **Pass** (코드) | `backend/jobs/cron.js` + `server.js` `startCronJobs`. `DISABLE_CRON=1`/`NODE_ENV=test` 비활성. 스케줄 실기동 E2E 없음 |
| 5 | networking schoolScope 403 | **Pass** | mentors `u.school_id` 필터; connect/mentorship `forbidCrossSchool`. 테스트: cross connect 403, mentors A/B 격리 |
| 6 | field_trips list/apply 테넌시 | **Pass** | 목록 학교 필터, 타교 apply 403, 정원 `CAPACITY` 400 |
| 7 | roster / attendance (REQ-TRP-003 일부) | **Pass** | 교사 roster 200, 타교 roster 403, attendance PATCH 200. **사후 보고** 미구현 |
| 8 | apply 인앱 알림 | **Pass** (코드) | `notifyInApp` FIELD_TRIP_APPLY. 전용 알림 테스트 없음 |
| 9 | 프론트 dashboard / industry-visit | **Pass** (코드) | `/recommendations/me`, `/field-trips` API. 브라우저 DoD 약함 |
| 10 | QA sprint4 + 전체 회귀 | **Pass** | sprint4 **7** + 이전 39 = **46/46** (본 세션 재실행) |
| 11 | REQ-REC-002 연관 추천 | **Not started** | STATUS와 일치 |
| 12 | REQ-COM-* 커뮤니티 고도화 | **Not started** | 0% |
| 13 | 워크넷 실연동 | **Not started / gated** | `backend/modules/worknet` 없음. STATUS 0%, 게이트 `unknown`. 가짜 완성 없음 |
| 14 | Playwright / 브라우저 페르소나 | **Fail** | node:test만 |

### Sprint 3 검증 잔여 추적

| 이전 리스크 | Sprint 4 이후 | 메모 |
|-------------|---------------|------|
| networking 가드 없음 | **해소** (API) | connect 403 + mentors 스코프 테스트 |
| REQ-REC-* | **P0 슬라이스 해소** | REC-002 잔여 |
| REQ-TRP-* | **P0 슬라이스 해소** | 사후 보고 잔여 |
| Playwright / UI DoD | **미해소** | |
| COM / 워크넷 | **미해소** | |
| B-LS `company_profile_*` | **미해소** | |

## 3. 테스트 실행 (테스트 코드 미변경)

명령: `npm --prefix backend test` (`node --test --test-concurrency=1 tests/*.test.js`)

| 파일 | 결과 |
|------|------|
| `backend/tests/roles.test.js` | **2/2 pass** |
| `backend/tests/wave1-tenancy.test.js` | **10/10 pass** |
| `backend/tests/sprint1-documents.test.js` | **9/9 pass** |
| `backend/tests/sprint2-workflow.test.js` | **12/12 pass** |
| `backend/tests/sprint3-community.test.js` | **6/6 pass** |
| `backend/tests/sprint4-recommendations-fieldtrips.test.js` | **7/7 pass** |

합계 **46 pass / 0 fail** (2026-09-14 본 세션). Playwright 없음.

커버 (Sprint 4 추가): scoring reasons, recommendations/me 학교 범위, networking connect 403, mentors 격리, field-trips list/apply 403, capacity, roster/attendance 403.

미커버: mentorship 타교 403 전용, feedback cron tick, recommendations feedback 이벤트, approval-mode 견학, UI E2E, worknet status 엔드포인트(미구현).

## 4. Spec 커버리지 (REQ → Sprint 4 슬라이스)

| REQ | P | Sprint 4 | 메모 |
|-----|---|----------|------|
| REQ-IAM-009 | P0 | **Pass** (networking) | mentors/connect/mentorship. posts 등은 Sprint 3 |
| REQ-REC-001 | P0 | **Partial→Pass (P0)** | 콘텐츠 매칭은 키워드 오버랩+코사인 유사. 전문 TF-IDF 미달이나 STATUS/모듈이 명시 |
| REQ-REC-003 | P0 | **Pass** | 지역·마감·학과·신규 보정 |
| REQ-REC-004 | P0 | **Pass** | 점수순 + `reasons` |
| REQ-REC-005 | P0 | **Pass** (코드+수동 recompute) | cron 등록. 스케줄 실기동 미검증 |
| REQ-REC-002 | P1 | **Not started** | |
| REQ-REC-006 | P1 | **Partial** | feedback API/테이블 존재. 학습형 미구현 |
| REQ-TRP-001 | P0 | **Pass** | `field_trips` 스키마·CRUD |
| REQ-TRP-002 | P0 | **Pass** | fifo/approval mode, apply·승인 패치·정원 |
| REQ-TRP-003 | P0 | **Partial** | 인앱 알림·명단·출결 Pass. **사후 보고** 없음 |
| REQ-COM-* | P0/P1 | **Not started** | |
| REQ-WN-* | P2/게이트 | **N/A / Not started** | 키 없음·모듈 없음. 가짜 연동 없음 |

## 5. STATUS 정직성 (`b7277f2` 기준)

| STATUS 주장 | 모니터 판단 |
|-------------|-------------|
| Sprint 4 **75%** | **정직 (70–80%).** REC/TRP P0·networking 실재. COM/메시지/REC-002·사후보고·E2E 잔여로 85%+는 과대 |
| 전체 P0 **약 52%** | **정직 (50–55%).** Sprint 3 ~44%에서 REC+TRP+networking 가산. WN/COM/Playwright 미착수 |
| Phase 3 **88%** | **경계~양호 (82–88%).** networking 포함은 맞음. 메시지/워크넷 잔여로 90%+는 과대 |
| 추천 엔진 **70%** | **정직.** P0 피드·cron. REC-002·학습형 없음 |
| 견학 **65%** | **정직~약간 보수.** apply/roster/attendance+알림. 사후 보고·관리 UI 깊이 부족 |
| QA **72%** / Phase 4 **62%** | **경계 (68–74% / 58–65%).** 46 API 테스트 가치 있음. E2E 0 |
| 워크넷 **0%** / 게이트 `unknown` | **정직.** 실파일·실연동 없음 |
| 알림톡 **15%** / `NOT_CONFIGURED` | **정직** (Sprint 2 스텁 유지) |
| 「전체 46/46」 | **정직** (본 세션 재확인) |
| Sprint 3 **55% done-ish** | **정직 (재분류).** 추천·견학을 Sprint 4로 넘긴 뒤 테넌시 슬라이스 재평가 |

**드리프트:** `docs/03` 표 「견학은 field_trips로 이관 **예정**」은 마이그레이션 적용 후 문구가 약간 낡음(본문 Sprint 4 적용 줄은 정확). 워크넷은 `NOT_CONFIGURED` 응답 경로보다 **미구현+게이트 unknown**이 정확한 상태 — STATUS「실연동 안 함」과 일치.

## 6. 잔여 리스크 (구현 금지 — 확인만)

1. **REQ-TRP-003 사후 보고** — roster/attendance만. 보고 산출물 없음.
2. **멘토십 교차 테스트** — 코드 가드만. connect와 달리 mentorship 403 전용 케이스 없음.
3. **이관 `school_id` 폴백** — industry-visit INSERT가 `전주공업고등학교` LATERAL 폴백. 다교 레거시 행 왜곡 가능.
4. **cron 실기동** — 등록만 확인. 운영 스케줄 검증 없음.
5. **UI DoD** — dashboard 추천·industry-visit 브라우저/Playwright 미기록.
6. **워크넷** — 모듈 0. 게이트 닫힘 유지 필요.
7. **B-LS** — `company_profile_*` 잔여.
8. **Sprint 5 병행** — docs 커밋 push 시 충돌 가능.

## 7. 권장 QA (테스트 약화 금지)

1. mentorship: 학교 A → 학교 B mentor POST = 403.
2. Playwright: dashboard 추천 카드 reasons 표시 · industry-visit 신청 → 타교 목록 미노출.
3. cron: `RECOMMENDATION_CRON` 단발 또는 recomputeAllActiveSchools 통합 스모크.
4. 회귀: 46 node:test 유지.
5. TRP approval mode + 사후 보고 스키마(후속).

## 8. 핸드오프

```
Handoff: verifier/monitor → architect
REQ: STATUS % (Sprint 4 75%·P0 ~52% 유지 권장)
Need: docs/03 「이관 예정」문구 정리 optional

Handoff: verifier/monitor → backend (Sprint 5+)
REQ: REQ-WN-*, REQ-REC-002, REQ-TRP-003 사후보고, REQ-COM-*
Need: 워크넷 게이트 ready 전 스텁만. 연관 추천·견학 보고

Handoff: verifier/monitor → frontend
REQ: docs/06 DoD, REQ-REC-004 UI
Need: dashboard/industry-visit 브라우저 검증 기록

Handoff: verifier/monitor → qa
REQ: docs/08, REQ-IAM-009, REQ-REC-004, REQ-TRP-002
Need: Playwright 페르소나. mentorship 403. 46 node:test 회귀
Done: sprint4 7 + 전체 46/46 (2026-09-14)
```
