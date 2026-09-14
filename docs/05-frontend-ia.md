# 프론트엔드 정보구조 — jjobb_v2

v1은 다페이지 HTML이다. 라우터 프레임워크 없이 **페이지 파일 + 공통 `js/auth.js`/`js/api.js`**를 유지한다. 권한에 따라 사이드바/메뉴를 숨긴다.

## 1. 페르소나

| 페르소나 | v1 진입 | v2 추가 핵심 화면 |
|----------|---------|-------------------|
| 학생/졸업생 | dashboard, jobs, career, counseling, networking | 이력서 마법사, PDF, 추천, 견학 신청, 커뮤니티 분류 |
| 교사 | dashboard, counseling, counseling-journal | 학생 타임라인, 문서 다운로드, 소속교 범위 |
| 학교관리자 | (없음, admin과 혼재) | 소속 회원/권한, 견학 운영, 커뮤니티 모더레이션 |
| 시스템관리자 | admin-* | 학교 관리, 권한 매트릭스, 워크넷 동기화, 감사 로그 |
| 기업 | job-create, applicant-detail, company-profile | 지원 상태 변경, 이력서 PDF 열람 |

## 2. 사이트맵 (현행 v1 파일 → v2)

### 공개

| 화면 | 파일 | v2 |
|------|------|----|
| 메인 | `index.html` | 학교 선택 불필요(로그인 후 소속). 현황은 `site_stats` |
| 로그인 | `login.html` | 유지 |
| 회원가입 | `register.html` | **Wave 1:** 학교 목록은 `GET /api/schools` select. LocalStorage `schools` 제거 |
| 도움말 | `help.html` | 역할별 섹션 보강 |

### 학생·졸업생

| 화면 | 파일 | v2 |
|------|------|----|
| 대시보드 | `dashboard.html` | 추천 카드, 지원 현황, 견학, 상담 일정 |
| 채용 | `jobs.html` | 자체/워크넷 뱃지, 추천 정렬 |
| 공고 상세/지원 | jobs 상세 흐름 | **Sprint 2:** 지원 시 이력서 선택 모달 (`resume_id`) |
| 경력/이력 | `career.html` + `js/career.js` | **Sprint 1:** 이력서 마법사(복수·대표·미리보기·PDF). LocalStorage `career_*` 제거. `/api/resumes` |
| 이력서 PDF | (신규 `resume.html` 또는 career 확장) | 미리보기·다운로드 |
| 상담 예약 | `counseling.html` | 유지 |
| 자격/교육/박람회/견학 | `certificates.html`, `education-programs.html`, `job-fair.html`, `industry-visit.html`, `certification-support.html` | Sprint 4: `industry-visit.html`은 `/api/field-trips` 사용(구 announcements type 유지 호환 별칭). 전용 `field-trips.html`은 선택 |
| 네트워킹 | `networking.html` | 유지 + 커뮤니티와 역할 정리 |
| 프로필 | `profile.html` | `/auth/me`만 |

### 교사

| 화면 | 파일 | v2 |
|------|------|----|
| 상담일지 | `counseling-journal.html` | **Sprint 2:** 소속 학생 타임라인 조회. 유형 확장, PDF/DOCX, 통계 바 |
| 대시보드 | `dashboard.html` | 폴백 제거, 소속 학생만 |

### 기업

| 화면 | 파일 | v2 |
|------|------|----|
| 공고 등록/수정 | `job-create.html`, `job-edit.html` | 직종·스킬 필드 |
| 지원자 | `applicant-detail.html` | **Sprint 2:** 상태 머신 UI + `PATCH .../status` |
| 기업 프로필 | `company-profile.html` | API만 |

### 관리

| 화면 | 파일 | v2 |
|------|------|----|
| 회원 | `admin-users.html` | school_admin은 소속만, 전입/전출, 역할 지정 |
| 공고 | `admin-jobs.html` | **Sprint 1:** LocalStorage `jobPostings` 폴백 삭제. `/api/jobs`만 |
| 게시판 | `admin-board.html` | API만. Sprint 5: 블라인드 버튼(`include_blinded`) |
| 공지/행사 | `admin-announcements.html` | 견학 모듈과 정렬 |
| 코드 | `admin-codes.html` | **Wave 1:** `GET/POST/PATCH /api/schools`. 비활성화만(하드 삭제 없음). LocalStorage 삭제 |
| (신규) 학교 관리 | `admin-schools.html` | system_admin |
| (신규) 권한 매트릭스 | `admin-permissions.html` | system_admin |
| (신규) 워크넷 | `admin-worknet.html` | 동기화·로그 |
| (신규) 메시지 | `admin-messages.html` | P2 또는 인앱 브로드캐스트 |
| (신규) 감사 로그 | `admin-audit.html` | |
| (신규) 추천 모니터 | `admin-recommendations.html` | 선택 |

개발용 `check-storage.html`, `dashboard-test.html`은 운영 빌드에서 제외.
`setup-test-profile.html`은 Sprint 5에서 `PUT /api/users/company-profile`만 사용(B-LS; `company_profile_*` LocalStorage 제거).

## 3. 공통 UX

- **권한 메뉴:** `GET /api/me/permissions` 후 사이드바 렌더. 매트릭스 「–」는 링크 숨김.
- **반응형:** 기존 `css/*.css` 계승, 이력서 마법사·테이블은 모바일 카드 레이아웃.
- **접근성:** 폼 label, 버튼 이름, 포커스. 신규 화면은 키보드 제출 가능.
- **에러:** 403이면 「소속 학교 권한이 없습니다」. 503 NOT_CONFIGURED이면 게이트 안내.

## 4. 핵심 사용자 흐름

### 학생: 이력서 → 추천 → 지원

1. 로그인 → 대시보드 추천 N건 (사유 표시)
2. 이력서 마법사 임시저장 → 대표 지정 → PDF
3. 공고 상세 → **이력서 선택** 첨부 지원 → 내 지원 현황

### 교사: 상담 문서화

1. 학생 검색(소속교) → 일지 작성 → PDF/DOCX 다운로드
2. 후속 일정 → 인앱 리마인드

### 기업: 공고 → 전형

1. 공고 등록 → 지원자 목록 → 서류검토/면접/합격 변경 → 학생 알림

### 학교관리자: 멀티스쿨 운영

1. 소속 회원 승인/역할 → 견학 공고·명단 → 커뮤니티 신고 처리
2. 타교 URL 조작 시 빈 목록/403

### 시스템관리자

1. 학교 등록 → 학교관리자 지정 → 워크넷 키 설정(게이트) → 동기화

## 5. 구현 규칙 (Frontend 에이전트)

- UI 변경 후 **브라우저에서 해당 페르소나 흐름을 끝까지** 검증한다.
- 페이지를 추가하면 이 문서와 `docs/STATUS.md`를 함께 수정한다.
- `localStorage`는 `token`만. 업무 데이터 setItem 추가 금지.
- 기존 파일명을 함부로 삭제하지 말고, 이동 시 리다이렉트 링크를 남긴다.
