# Menu icons — line SVG (`data-icon`)

날짜: 2026-09-16  
역할: frontend  
범위: 상단 도움말 이모지 제거, 사이드바/관리자 메뉴·대시보드 stat/quick-action 아이콘을 랜딩과 동일 라인 SVG 마스크로 통일

## 접근

- 기존 랜딩 `service-icon[data-icon]` 패턴을 확장: `css/style.css`에 공유 `--icon-mask` 토큰(stroke 1.8)
- 메뉴: `<span class="icon" data-icon="…" aria-hidden="true">` + `css/dashboard.css`에서 `currentColor` (기본 네이비 `#163a5f`, active/hover 흰색)
- Stat 카드: `.stat-icon[data-icon]` + soft 배경, 네이비/리프 그린 교차
- `js/dashboard.js` 교사 대시보드 이모지 `textContent` → `data-icon` 속성 설정
- `data-menu` / `#adminMenuSection` / RBAC show-hide **미변경**

## 검증

- [x] 사이드바 메뉴 아이콘 마스크 렌더 (홈·대시보드·프로필·채용·밴드·상담·교육·관리자)
- [x] active 메뉴 아이콘 흰색
- [x] 대시보드 stat 아이콘 soft tile
- [ ] 로그인 후 실페르소나 RBAC 메뉴 표시 — 정적 CSS 프리뷰만 수행(비밀번호 자동화 제외). 수동 확인 권장: `admin@jjob.com` / `teacher@jjob.com`

## 파일

- `css/style.css`, `css/dashboard.css`, `js/dashboard.js`
- 사이드바 HTML 일괄 (`dashboard.html`, `admin-*.html`, `jobs.html`, …)
- 페이지 H1 이모지 제거(메뉴 chrome과 톤 맞춤)
