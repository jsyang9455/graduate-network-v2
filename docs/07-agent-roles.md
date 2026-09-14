# 에이전트 역할 헌장 — jjobb_v2

실행 세션은 **한 역할로만** 구현한다. 교차가 필요하면 핸드오프 섹션을 STATUS에 남기고 중단한다.  
Cursor 규칙은 `.cursor/rules/`, 스킬은 `.cursor/skills/`를 따른다. 워크플로 개요는 루트 `AGENTS.md`.

공통 필수 독서: `docs/00-vision-and-scope.md`, `docs/STATUS.md`, 본인 영역 문서.

공통 DoD: `docs/06-delivery-plan.md` §4.

---

## Architect / PM

- **Mission:** 범위·우선순위·문서 일관성. 과업지시서 드리프트 방지.
- **In:** docs/*, REQ 번호, 게이트(워크넷/알림톡), 마일스톤, 충돌 중재.
- **Out:** 기능 코드 대량 구현, 스키마 무단 확대.
- **Reading:** 전체 docs, `docs/spec/고도화-과업지시서.txt`.
- **DoD:** 문서 교차 링크 유효, STATUS와 일정 일치, OUT-of-scope 명시.
- **STATUS:** Phase, %, 게이트, 블로커 테이블 갱신. 본인 owner=`architect`.
- **Handoff:** Wave 작업 목록을 Frontend/Backend/API/QA에 번호로 전달.

## Frontend

- **Mission:** HTML/CSS/JS 화면, 클라이언트 상태, 접근성, 권한 메뉴.
- **In:** `*.html`, `js/`, `css/`, 브라우저 검증.
- **Out:** `backend/`, SQL, 외부 API 키, 권한 정책 창작(매트릭스는 문서 따름).
- **Reading:** `05-frontend-ia.md`, `04-api-design.md`(계약), `01-requirements.md`.
- **DoD:** LocalStorage 업무데이터 없음, 권한 메뉴 일치, 페르소나 E2E 브라우저 확인.
- **STATUS:** 화면 단위 %. owner=`frontend`.
- **Handoff:** 필요한 엔드포인트 공백은 API 에이전트에 REQ/경로로 요청.

## Backend

- **Mission:** 도메인 로직, DB 마이그레이션, 인가 가드, 배치, 스토리지, 문서/추천/알림 모듈.
- **In:** `backend/` (routes 구현 시 API 계약 준수), `database/`.
- **Out:** HTML 레이아웃, 독자적인 breaking API 변경(API 에이전트와 합의 없이).
- **Reading:** `02-architecture.md`, `03-data-model.md`, `01-requirements.md`.
- **DoD:** school_id 가드, 마이그레이션 재실행 가능, 시크릿 없음.
- **STATUS:** 모듈/테이블 %. owner=`backend`.
- **Handoff:** 라우트 시그니처 확정 후 API 문서 갱신 요청.

## API

- **Mission:** REST 계약, 호환성, 에러 코드, OpenAPI, 프론트-백 인터페이스.
- **In:** `backend/routes/` 계약, `docs/04-api-design.md`, 향후 `docs/openapi.yaml`.
- **Out:** UI, 추천 알고리즘 세부, 인프라 계정.
- **Reading:** `04-api-design.md`, `01-requirements.md`, `js/api.js`.
- **DoD:** v1 응답 키 호환, 401/403/503 코드, 신규 경로가 04 문서에 존재.
- **STATUS:** 엔드포인트 인벤토리 %. owner=`api`.
- **Handoff:** 프론트에 변경점 changelog, 백엔드에 가드 누락 목록.

## QA / Test

- **Mission:** REQ 기반 테스트, 회귀, 권한·멀티스쿨 시나리오.
- **In:** 테스트 코드/체크리스트, 재현, 실패 로그.
- **Out:** 기능 구현으로 테스트 우회(가짜 통과).
- **Reading:** `08-test-strategy.md`, `01-requirements.md`.
- **DoD:** P0 시나리오 결과 기록, 실패는 블로커로 STATUS.
- **STATUS:** 테스트 pass/fail. owner=`qa`.
- **Handoff:** 실패를 해당 구현 역할에 REQ ID와 함께 반환.

## Role Verifier

- **Mission:** 구현 에이전트가 역할을 지켰는지, 문서를 읽었는지, DoD를 건너뛰지 않았는지 검사.
- **In:** diff 리뷰, 문서 갱신 여부, LocalStorage/시크릿/가드 우회 탐지.
- **Out:** 기능 재구현.
- **Reading:** 본 문서, `AGENTS.md`, 변경 파일에 해당하는 영역 docs.
- **DoD:** 위반 시 머지 금지 의견. 예: Frontend가 SQL 작성, Backend가 화면 CSS 대규모 변경, REQ 미인용, STATUS 미갱신.
- **STATUS:** 검증 결과 한 줄. owner=`verifier`.
- **Handoff:** 통과 시 Progress Monitor, 실패 시 원 역할로 재작업.

## Progress Monitor

- **Mission:** STATUS + git + 테스트로 진척을 과업지시서 대비 보고. 드리프트 경보.
- **In:** 읽기 전용 분석, STATUS 요약 갱신(수치), 게이트 상태.
- **Out:** 기능 코드 작성.
- **Reading:** `STATUS.md`, `00`, `06`, spec 원문.
- **DoD:** P0 커버리지, 지연 Wave, 게이트 미제공, 문서-코드 불일치 플래그.
- **STATUS:** 대시보드 %와 블로커가 진실. owner=`monitor`.
- **Handoff:** 주간 요약. 범위 변경은 Architect만.

## 충돌 규칙

1. 범위 논쟁 → Architect.
2. 계약 논쟁 → API 문서가 이김. 코드가 앞서면 문서를 같은 PR에서 맞춤.
3. 과업지시서와 문서 충돌 → spec 원문 + Architect가 00/01 수정.
4. P2 게이트 미제공 → 구현하지 말고 STATUS에 `blocked`만 표시.
