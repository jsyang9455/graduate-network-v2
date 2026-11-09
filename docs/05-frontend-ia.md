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
| 회원가입 | `register.html` | **Wave 1:** 학교 목록은 `GET /api/schools` select. LocalStorage `schools` 제거. **기업** 유형 선택 + 기업명·연락처·업종·협력학교. 가입 후 `company-profile.html` |
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
| 커뮤니티 | `community.html` | Sprint 6: 분류·태그·스크랩·첨부·내 스크랩 (REQ-COM-002/003) |
| 프로필 | `profile.html` | `/auth/me`만 |

### 교사

| 화면 | 파일 | v2 |
|------|------|----|
| 상담일지 | `counseling-journal.html` | **Sprint 2:** 소속 학생 타임라인 조회. 유형 확장, PDF/DOCX, 통계 바 |
| 대시보드 | `dashboard.html` | 폴백 제거, 소속 학생만 |

### 기업

| 화면 | 파일 | v2 |
|------|------|----|
| 공고 등록/수정 | `job-create.html`, `job-edit.html` | 직종·스킬 필드. 기업 내비. 미승인 기업은 폼 비활성(REQ-JOB-007). 상태값 `active`/`closed`/`draft` |
| 지원자 | `applicant-detail.html` | **Sprint 2:** 상태 머신 UI + `PATCH .../status` |
| 기업 프로필 | `company-profile.html` + `js/company-profile.js` | API만 (`GET/PUT /api/users/company-profile`). **승인 배너**: pending/rejected 시 안내, 공고 등록 CTA 비활성 |

### 관리

| 화면 | 파일 | v2 |
|------|------|----|
| 회원 | `admin-users.html` | school_admin은 소속만, 전입/전출, 역할 지정. **기업 승인 탭**: pending 목록 → 승인/반려 (`PATCH .../company-approval`). v1 `admin` 표시명 → **시스템 관리자** |
| 공고 | `admin-jobs.html` | **Sprint 1:** LocalStorage `jobPostings` 폴백 삭제. `/api/jobs`만 |
| 게시판 | `admin-board.html` | API만. Sprint 5: 블라인드 버튼(`include_blinded`) |
| 공지/행사 | `admin-announcements.html` | 견학 모듈과 정렬 |
| 코드 | `admin-codes.html` | 학교 등록: **주 담당자 필수** + 로고 업로드(`POST …/logo`). `GET/POST/PATCH /api/schools`. LocalStorage 삭제 |
| (신규) 학교 관리 | `admin-schools.html` | system_admin |
| **권한 매트릭스** | `admin-permissions.html` | system_admin — 역할별 `company_approval` 부여/회수 |
| (신규) 워크넷 | `admin-worknet.html` | 동기화·로그 |
| (신규) 메시지 | `admin-messages.html` | P2 또는 인앱 브로드캐스트 |
| (신규) 감사 로그 | `admin-audit.html` | |
| (신규) 추천 모니터 | `admin-recommendations.html` | 선택 |

개발용 `check-storage.html`, `dashboard-test.html`은 운영 빌드에서 제외.
`setup-test-profile.html`은 Sprint 5에서 `PUT /api/users/company-profile`만 사용(B-LS; `company_profile_*` LocalStorage 제거).

## 3. 공통 UX

- **권한 메뉴:** `GET /api/me/permissions` 로드 전 `#adminMenuSection`/`[data-menu]` 숨김(`.rbac-pending`) — 플리커 방지. 권한 매트릭스=`schools`+`manage`, 코드 관리=`write`. `js/school-brand.js`가 `user.school`로 헤더·대시보드 브랜딩.
- **반응형:** 기존 `css/*.css` 계승, 이력서 마법사·테이블은 모바일 카드 레이아웃.
- **접근성:** 폼 label, 버튼 이름, 포커스. 신규 화면은 키보드 제출 가능.
- **에러:** 403이면 「소속 학교 권한이 없습니다」. 503 NOT_CONFIGURED이면 게이트 안내.
- **비주얼 시스템 (2026-09-15/16):** 로고 정렬 네이비(`--secondary-color`)·리프 그린(`--primary-color`) 토큰. 헤더 로고는 `images/logo.svg`(다크 헤더) / `images/logo-color.svg`(라이트). 랜딩 `index.html` 메인 배너는 `images/main-banner.jpg` 풀블리드. **아이콘:** 랜딩 서비스·사이드바·관리자 메뉴·대시보드 stat 모두 SVG mask(`data-icon`, stroke 1.8, `currentColor`). 메뉴 emoji 사용 금지. 모바일 drawer는 동일 사이드바 DOM을 재사용.
- **비주얼 시스템 v2 (2026-10-20, 원티드 레퍼런스):** 모든 페이지가 마지막에 `css/theme.css`를 로드해 기존 페이지별 CSS를 덮어씀. 원칙: 흰 헤더(로고: 전문직 톤 `images/logo-jjobb.svg` — 네이비 #0f2b4c 라운드 사각 심볼(흰 J + 그린 포인트) + 대문자 JJOBB 스트로크 워드마크, 높이 32px(모바일 28px). 메인 `index.html`만 HTML 텍스트 슬로건 `.logo-tagline`(구분선, 모바일 숨김). 파비콘 `images/logo-symbol.svg`는 같은 심볼. 환영 배너 기본 로고는 흰 pill 배경). 단독 심볼 `images/logo-symbol.svg`(그린 라운드 사각형 + 흰 J)는 전 페이지 파비콘. 다크 배경 환영 배너에서는 CSS filter로 흰색, 학교 로고는 `.school-branded` 네이비 pill), 1px hairline 카드(radius 12, 그림자·translate hover 없음), 플랫 버튼(radius 10), 회색 칩, `word-break: keep-all`. 토큰은 `css/style.css` `:root` (`--primary-color #00875a`, `--text-dark #171719`, `--border-color #e1e2e4`, `--radius-sm/md/lg`, `--focus-ring`). 랜딩 메인은 3장 배너 캐러셀(`images/banner-career|fair|mentoring.jpg`, `js/main.js` `setupHeroCarousel`, 6초 자동재생·hover/focus 정지·reduced-motion 존중). 로그인 좌측 비주얼은 `images/auth-visual.jpg`. 채용 목록은 그리드 카드(이니셜 로고·D-day 칩·회사/조건·태그), 상세/지원 모달은 `.job-modal*` 클래스. 고용형태 필터 값은 DB 코드(`full-time` 등), 화면 라벨은 `js/jobs.js` `JOB_TYPE_LABELS`. 관리 테이블 `td .btn-sm`은 외곽선 소형 버튼으로 한 줄 배치.

## 4. 핵심 사용자 흐름

### 학생: 이력서 → 추천 → 지원

1. 로그인 → 대시보드 추천 N건 (사유 표시)
2. 이력서 마법사 임시저장 → 대표 지정 → PDF
3. 공고 상세 → **이력서 선택** 첨부 지원 → 내 지원 현황

### 교사: 상담 문서화

1. 학생 검색(소속교) → 일지 작성 → PDF/DOCX 다운로드
2. 후속 일정 → 인앱 리마인드

### 기업: 공고 → 전형

1. `register.html`에서 기업 가입(협력 학교 선택) → 세션 → `company-profile.html` (**승인 대기** 배너)
2. 학교관리자가 `admin-users` 기업 승인 탭에서 승인 → 공고 등록(`job-create.html`) 가능
3. 지원자 목록 → 서류검토/면접/합격 변경 → 학생 알림
4. 대시보드 사이드바에 공고 등록·기업 프로필만 강조, 상담/경력 메뉴 숨김. 미승인이면 공고 등록 안내

### 학교관리자: 멀티스쿨 운영

1. 소속 **기업 승인**/회원·역할 → 견학 공고·명단 → 커뮤니티 신고 처리
2. 타교 기업 승인 시도·URL 조작 시 빈 목록/403

### 시스템관리자

1. 학교 등록 → 학교관리자 지정 → 워크넷 키 설정(게이트) → 동기화

## 5. 구현 규칙 (Frontend 에이전트)

- UI 변경 후 **브라우저에서 해당 페르소나 흐름을 끝까지** 검증한다.
- 페이지를 추가하면 이 문서와 `docs/STATUS.md`를 함께 수정한다.
- `localStorage`는 `token`만. 업무 데이터 setItem 추가 금지.
  - **유일한 예외(개발 설정, 업무 데이터 아님):** `jjobb_api_base` — 로컬 개발에서 API 엔드포인트를 바꾸는 개발자용 오버라이드(`js/api.js`, localhost에서만 적용). 예: `localStorage.setItem('jjobb_api_base','http://localhost:5050/api')`. 운영 사용자는 이 키를 갖지 않는다.
  - 사용자 정보는 **메모리만**(`auth.user`). 매 페이지 로드 시 `GET /api/auth/me`로 채우고, 응답 전에는 JWT 페이로드(`id, email, name, user_type, role, school_id`)를 디코드한 최소 사용자(`_partial: true`)를 `auth.getCurrentUser()`가 동기로 반환한다. `is_counselor`·`phone`·`school` 등 전체 필드가 필요하면 `await auth.whenUserLoaded()`(별칭 `auth.ready`). 갱신은 `auth.setUser()`. 로그아웃/401이면 토큰과 메모리를 비운다. 과거 `graduateNetwork_user(s)` 키는 로드 시 자동 삭제.
- 날짜 표시: API의 DATE/타임스탬프는 UTC ISO(`2026-12-30T15:00:00Z` = KST 12-31)로 오므로 `slice(0,10)` 금지. `js/api.js`의 `formatLocalDate()`(Asia/Seoul)를 쓴다(폼 `<input type="date">` 값 포함).
- 숫자 집계: API의 `COUNT` 값(`applications_count` 등)은 문자열로 올 수 있으므로 `Number()`로 변환 후 합산.
- 모달: `.modal`은 flex 센터링 레이아웃이므로 열 때 `style.display = 'flex'`(not `block`).
- 기존 파일명을 함부로 삭제하지 말고, 이동 시 리다이렉트 링크를 남긴다.

### 2026-11-09 QA 결함 수정 (D5–D11, `docs/qa/comprehensive-test-report-2026-11-09.md`)

- **D5 REQ-PLT-001:** `graduateNetwork_user` 저장 제거 — `js/auth.js` 메모리 사용자 + JWT 디코드 폴백 + `whenUserLoaded()`. `school-brand.js`·`counseling-journal.js`·`counseling.js`·`education-programs.js`·`dashboard.js`·`profile.html`이 `/me` 결과를 기다리거나 `auth.setUser()`로 갱신. `check-storage.html`은 허용 키 점검 도구로 재작성, `setup-test-profile.html` 레거시 키 삭제에 `graduateNetwork_user(s)` 포함.
- **D6 REQ-PLT-007:** 헤더 `backdrop-filter`가 fixed `.nav-drawer`의 containing block이 되어 닫힌 drawer가 문서 폭을 727px로 늘림 → 모바일에서 헤더 `overflow-x: clip`, 닫힘 시 `visibility: hidden`. 열림 시 헤더 z-index를 백드롭(1001) 위 1002로 올려 drawer 링크가 백드롭에 가려지던 문제도 수정. 대시보드 `.job-posting-item/actions` 모바일 세로 배치·줄바꿈 (`css/theme.css`).
- **D7 REQ-IAM-008:** `dashboard.html` `#adminMenuSection`의 정적 `rbac-pending` 클래스가 `display:none !important`로 남아 있었음 → `applyPermissionMenus()`가 권한 판정 후 클래스를 제거.
- **D8:** `profile.html` 프로필 수정·탈퇴 모달 `display:flex`로 가운데 정렬.
- **D9 REQ-JOB-001:** 마감일·지원일·상담일 표시/폼 값을 `formatLocalDate()`로(`dashboard.js`, `jobs.js`, `admin-jobs.html`, `counseling-journal.js`, `counseling.js`).
- **D10 REQ-JOB-006:** 기업 대시보드 총 지원자/조회수 `Number()` 합산.
- **D11:** `auth.updateAuthUI()`가 `#userMenu` 유무와 관계없이 `#userName`을 채움 → 대시보드·채용 헤더에 사용자 이름(JWT로 즉시, `/me` 후 갱신).
- **관리자 사이드바 통일 (REQ-IAM-008):** `admin-*.html` 6개 화면의 왼쪽 메뉴가 화면마다 달랐음(권한 매트릭스·공지사항 관리 누락, `data-menu` 없음). 모두 대시보드 `#adminMenuSection`과 같은 7개 항목·순서·`data-menu`/`data-menu-min`으로 통일 — 대시보드, 회원 관리, 권한 매트릭스, 채용공고 관리, 게시판 관리, 코드 관리, 공지사항 관리. 새 관리자 화면 추가 시 6개 파일의 메뉴를 함께 수정.
