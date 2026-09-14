# 테스트 전략 — jjobb_v2

v1은 자동 테스트 스위트가 거의 없다. v2는 **권한·테넌시·문서·지원 워크플로우**를 중심으로 테스트를 도입한다.

## 1. 수준

| 수준 | 도구 (권장) | 대상 |
|------|-------------|------|
| 단위 | Node `node:test` 또는 Jest | 추천 점수, RBAC 매트릭스, schoolScope 쿼리 빌더 |
| API 통합 | supertest + 테스트 DB | 라우트, 401/403, CRUD |
| 프론트 E2E | Playwright | 페르소나 핵심 경로 (브라우저 검증과 동일) |
| 보안 | 체크리스트 + 수동 | PII, HTTPS, 감사 로그, LocalStorage |
| UAT | 학교 시나리오 | W11–12 |

테스트 계정은 `TEST-ACCOUNTS.md`를 **개발 DB 전용**으로 유지하고 프로덕션 시드를 금지한다.

## 2. 픽스처

최소 2개 학교(`school_a`, `school_b`), 역할별 1계정.

- 교사A가 학교B 상담/학생을 GET → 403 또는 빈 목록
- 학생A가 학교B 견학에 신청 불가(정책에 따라 전역 견학이 아니면)
- system_admin은 양쪽 조회 가능
- company는 자기 공고 지원자만

## 3. 크리티컬 패스 (E2E)

1. 회원가입(학교 선택) → 로그인 → 권한 메뉴
2. 이력서 작성 → PDF 다운로드 (한글)
3. 공고 지원(이력서 첨부) → 기업 상태 변경 → 학생 인앱 알림
4. 교사 상담일지 → PDF/DOCX
5. 견학 신청 → 정원 초과 거부
6. 추천 목록 사유 표시
7. 커뮤니티 신고 → 블라인드

## 4. REQ 수용 체크리스트

### IAM (P0)

- [ ] REQ-IAM-001 학교 CRUD
- [ ] REQ-IAM-002 학과
- [ ] REQ-IAM-003 school_admin 지정
- [ ] REQ-IAM-004 소속 귀속
- [ ] REQ-IAM-005 전입/전출 로그
- [ ] REQ-IAM-006 역할 6종
- [ ] REQ-IAM-008 메뉴 매트릭스 = 화면 = API
- [ ] REQ-IAM-009 타교 차단
- [ ] REQ-IAM-010 감사 로그

### Platform

- [ ] REQ-PLT-001 업무 LocalStorage 없음
- [ ] REQ-PLT-003 가드 없는 신규 라우트 0
- [ ] REQ-PLT-007 모바일 폭 375px 주요 화면

### Resume / Counseling / Job / Rec / Trip / Community

- [ ] REQ-RSM-001~005
- [ ] REQ-CNS-001~006
- [ ] REQ-JOB-001,003,004,005,006
- [ ] REQ-REC-001,003,004,005
- [ ] REQ-TRP-001~003
- [ ] REQ-COM-001,003,004,005

### 조건부

- [ ] REQ-WN-* 키 있을 때만 필수. 없으면 `/worknet/status` configured=false
- [ ] REQ-MSG-* 계정 있을 때만. 없으면 인앱만 (REQ-MSG-010)

### NFR

- [ ] REQ-NFR-001~003,005,006
- [x] REQ-NFR-010 compose 기본 비밀 운영 사용 안 함 (Sprint 7: env / `.env.example`)

## 5. 회귀

- v1 로그인/채용 목록/상담 예약/게시글이 additive 변경 후에도 동작
- `user_type` 기존 5종 로그인
- 메인 `site_stats` 관리자 입력

## 6. QA 운영

실패 시 STATUS 블로커에 `REQ-xxx`, 재현 단계, 기대/실제를 적고 구현 역할에 핸드오프한다. 테스트만 약하게 바꿔 통과시키지 않는다.
