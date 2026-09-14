# STATUS — jjobb_v2 (living)

최종 갱신: 2026-09-14  
현재 단계: **Phase 0 완료** (착수 문서·역할·저장소 부트스트랩)  
전체 P0 구현: **0%** (설계/부트스트랩만 완료)

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
| 2 | ERD 확정, OpenAPI, 화면 확정 | architect + api | 0 | todo |
| 3 | 멀티스쿨·RBAC·스토리지·가드 | backend + api + frontend | 0 | todo |
| Sprint 1 | 이력서·상담 문서 | backend + frontend | 0 | todo |
| Sprint 2 | 채용 워크플로우·워크넷 | api + backend + frontend | 0 | todo |
| Sprint 3 | 추천·견학·커뮤니티·메시지 | all implementers | 0 | todo |
| 4 | 테스트·UAT·보안 | qa | 0 | todo |
| 5 | 이관·교육·오픈 | architect | 0 | todo |

## Workstreams

| 스트림 | Owner | % | 메모 |
|--------|-------|---|------|
| 멀티스쿨 스키마/가드 | backend | 0 | Wave A |
| IAM API·OpenAPI | api | 0 | |
| 권한 메뉴·schools UI | frontend | 0 | LocalStorage schools 철거 |
| 이력서 PDF | backend/frontend | 0 | |
| 상담 문서 | backend/frontend | 0 | 유형 코드 불일치 해소 |
| 채용 워크플로우 알림 | api/frontend | 0 | |
| 워크넷 | backend | 0 | 게이트 |
| 추천 엔진 | backend | 0 | |
| 견학 모듈 | backend/frontend | 0 | announcements 이관 |
| 커뮤니티 고도화 | api/frontend | 0 | |
| 알림톡/SMS | backend | 0 | 게이트 |
| QA 스위트 | qa | 0 | v1 자동테스트 부재 |

## Blockers

| ID | 내용 | 영향 | Owner |
|----|------|------|-------|
| B-GATE | 학교 측 워크넷 키·알림톡 계정 미확인 | Sprint 2/3 일부 | architect |
| B-PORT | 로컬 API 포트 5000 vs 프론트 5001 불일치 | 개발 DX | api |
| B-LS | career/admin-codes 등 LocalStorage 운영 데이터 이관 불가 | 재입력 필요 | architect |

## 에이전트 갱신 규칙

- 구현 완료 시 해당 행 %와 메모만 수정하고 날짜를 올린다.
- 범위 변경은 Architect만 `00`/`01`과 함께 수정한다.
- Progress Monitor는 매주 %의 합이 git 실제 진척과 맞는지 검사한다.

## Phase 0 완료 기록

- v1 소스 분석 (graduate-network `main` / `7f331fc`)
- 고도화 과업지시서 반영한 docs 00–08
- Cursor 규칙/스킬 및 `AGENTS.md`
- GitHub v2 원격: 부트스트랩 시점에 `gh` 미로그인일 수 있음. 확정 URL은 README 상단과 이 칸을 동기화한다.
