# AGENTS.md — jjobb_v2 멀티에이전트 워크플로

이 저장소는 전북지역 졸업생 취업지원플랫폼 **v2 고도화** 코드와 설계 문서이다.  
구현 에이전트는 아래 규칙을 따른다.

## 시작 전

1. `docs/STATUS.md`를 읽고 현재 Phase와 블로커를 확인한다.
2. `docs/00-vision-and-scope.md`의 In/Out of scope를 확인한다. OUT-* 는 구현하지 않는다.
3. 사용자 요청이 역할과 다르면 **역할 헌장**(`docs/07-agent-roles.md`)에 맞게 범위만 수행하거나, 다른 역할 핸드오프를 STATUS에 남긴다.
4. 프로젝트 스킬 `.cursor/skills/<role>/SKILL.md`가 있으면 따른다.

## 역할

| 역할 | 언제 | 주 산출물 |
|------|------|-----------|
| Architect / PM | 범위, 일정, 문서, 게이트 | `docs/*`, STATUS |
| Frontend | 화면·CSS·js, 브라우저 검증 | `*.html`, `js/`, `css/` |
| Backend | DB, 도메인, 가드, cron, 스토리지 | `backend/`, `database/` |
| API | REST 계약, 호환, OpenAPI | `backend/routes/`, `docs/04-api-design.md` |
| QA / Test | REQ 테스트, 회귀 | 테스트·체크리스트 |
| Role Verifier | PR/작업 후 역할·DoD 검사 | 리뷰 코멘트 |
| Progress Monitor | 진척 vs 과업지시서 | STATUS 요약 |

한 세션 = 한 역할. 프론트가 SQL을 넣거나, 백엔드가 페이지 전체를 다시 그리지 않는다. 계약 변경은 API 문서와 같은 변경 묶음이어야 한다.

## 필수 문서

| 하고 싶은 일 | 읽을 것 |
|--------------|---------|
| 무엇을 만들지 | `docs/01-requirements.md` |
| 스택·가드 | `docs/02-architecture.md` |
| 테이블 | `docs/03-data-model.md` |
| 엔드포인트 | `docs/04-api-design.md` |
| 화면 | `docs/05-frontend-ia.md` |
| 순서·DoD | `docs/06-delivery-plan.md` |
| 테스트 | `docs/08-test-strategy.md` |
| 원문 | `docs/spec/고도화-과업지시서.txt` |

## 기술 불변

- 스택 계승: HTML/CSS/JS + Node/Express + PostgreSQL + Docker/Nginx.
- 테넌시: `school_id` + 인가 가드. 타교 데이터 누수 금지.
- 클라이언트: 업무 데이터를 `localStorage`에 저장하지 않는다. JWT만.
- 시크릿: `.env` 커밋 금지.
- 조건부: 워크넷 키·알림톡 계정 없으면 실연동을 가짜로 완성하지 말고 `NOT_CONFIGURED` / STATUS 게이트.

## 핸드오프 템플릿

STATUS 또는 PR에:

```
Handoff: <from-role> → <to-role>
REQ: REQ-xxx
Need: <엔드포인트/스키마/재현 단계>
Done: <이번 세션에서 끝난 것>
```

## Role Verifier 체크 (매 구현 PR)

- [ ] 파일이 역할 glob 안에 있는가
- [ ] REQ-xxx 인용
- [ ] 해당 docs 갱신
- [ ] STATUS % 갱신
- [ ] 가드/테넌시 우회 없음
- [ ] UI면 브라우저 검증을 수행했다고 명시
