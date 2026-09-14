# 전달 계획 — jjobb_v2

기간: 계약일로부터 **91일 / 13주** (과업지시서 Ⅳ). 오늘은 착수 준비(Phase 0).

## 1. 마일스톤

| 주차 | 이름 | 산출물 | DoD |
|------|------|--------|-----|
| W1–2 | Phase 0–1 착수·분석 | 본 docs, 현행 분석, 게이트 확인 | 요구사항 ID 고정, v2 저장소 |
| W2–4 | Phase 2 상세 설계 | ERD 확정 SQL, OpenAPI, 화면 목록, 권한 매트릭스 DB 시드 | 설계 컨펌 |
| W4–6 | Phase 3 기반 | DB 전환, 멀티스쿨, RBAC, 스토리지, 문서·알림 스켈레톤, cron | 타교 데이터 403 테스트 통과 |
| W6–7 | Sprint 1 | 이력서 PDF, 상담 PDF/DOCX | 한글 폰트 PDF 샘플 검수 |
| W8–9 | Sprint 2 | 워크넷(게이트), 공고·지원 워크플로우 | 통합 목록 + 상태 알림(인앱) |
| W9–11 | Sprint 3 | 추천, 견학, 커뮤니티, 메시지(게이트) | REQ P0 시나리오 통과 |
| W11–12 | Phase 4 품질 | 통합·권한·UAT·보안 점검 | 테스트 결과서 |
| W12–13 | Phase 5 오픈 | 이관, 교육(3h), 매뉴얼, 배포 | 학교 검수 |

보고: 착수 7일 내, 중간 4·9주차, 최종 13주차.

## 2. 작업 분해 (WBS) — 구현 에이전트용

### Wave A — 기반 (Backend 주, API 협업) **먼저**

1. `schools`, `departments`, `roles`, `menus`, `role_menu_permissions`, `user_roles` 마이그레이션
2. `users.school_id` backfill (전주공업고 시드)
3. `authorize` + `schoolScope` 미들웨어를 기존 라우트에 장착
4. `/api/schools`, `/api/me/permissions`, `/api/audit-logs`
5. LocalStorage 이관: schools 코드관리, career, admin-jobs 폴백 제거
6. `files` + storage 어댑터 (로컬 디스크 → S3 설정 가능)
7. notify 인터페이스 (인앱)
8. `js/api.js` 베이스 URL 통일, test_token 우회 삭제
9. JWT에 school_id/role, `school_admin` 역할

### Wave B — 문서화 (Backend + Frontend)

1. 이력서 스키마·API·마법사 UI
2. PDF 엔진 + 한글 폰트
3. 상담 유형 확장, 타임라인, PDF/DOCX
4. 지원 시 `resume_id` 첨부

### Wave C — 채용 고도화 (API + Frontend)

1. 지원 상태 PATCH + 인앱 알림
2. 통합 공고 UI (source 뱃지)
3. 워크넷 클라이언트·cron·admin 화면 (키 게이트)
4. 기업 지원자 상태 UI

### Wave D — 추천·견학·커뮤니티

1. 키워드 추출 + 점수 + 사유 API/대시보드 카드
2. `field_trips` 이관 및 신청 플로우
3. 스크랩·신고·익명·블라인드
4. 알림톡 provider (게이트)

## 3. 권장 구현 순서 (역할별 첫 웨이브)

상세 체크리스트는 최종 보고의 「첫 구현 웨이브」와 동일하게 유지한다.

1. Backend: 멀티스쿨 스키마 + 가드
2. API: 권한/학교 계약 + OpenAPI 초안
3. Frontend: 권한 메뉴 + schools API 회원가입/코드관리
4. QA: 타교 격리 테스트 픽스처
5. Role Verifier: 가드 없는 라우트 추가를 거부
6. Progress Monitor: STATUS 게이트와 REQ P0 % 갱신

## 4. Definition of Done (공통)

구현 작업은 다음을 모두 만족해야 완료다.

- [ ] 관련 `REQ-xxx`가 커밋 메시지 또는 PR 본문에 인용됨
- [ ] 스키마/API/화면 중 변경된 문서(`03`/`04`/`05`)가 같이 갱신됨
- [ ] `docs/STATUS.md` 해당 항목 %·메모 갱신
- [ ] 인가: 타 학교·타 역할 시나리오가 깨지지 않음
- [ ] 프론트 UI면 브라우저에서 페르소나 흐름 검증
- [ ] 시크릿(`.env`) 미커밋
- [ ] LocalStorage에 업무 데이터 신규 저장 없음

## 5. 컨펌 게이트 (과업 4.1)

요구사항 컨펌 → 설계 컨펌 → 개발 컨펌 → 검수 컨펌.  
에이전트는 컨펌 전 범위를 독단으로 확대하지 않는다 (OUT-* 준수).
