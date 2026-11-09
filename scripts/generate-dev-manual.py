"""
JJOBB 전북 직업계고 졸업생 취업 네트워크 - 개발자 매뉴얼 DOCX 생성 (v2)
실행: python3 scripts/generate-dev-manual.py
"""

import os
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, '전북지역_졸업생네트워크_개발자매뉴얼.docx')

VERSION = 'v2.1'
DATE = '2026년 11월 9일'

BRAND_NAVY  = RGBColor(0x0f, 0x2b, 0x4c)
DARK        = RGBColor(0x1f, 0x29, 0x37)
GRAY        = RGBColor(0x6b, 0x72, 0x80)


# ─────────────────────────── 헬퍼 ────────────────────────────

def add_page_break(doc):
    doc.add_page_break()


def h1(doc, text):
    p = doc.add_heading(text, level=1)
    p.runs[0].font.color.rgb = BRAND_NAVY
    p.runs[0].font.size = Pt(16)
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(6)
    return p


def h2(doc, text):
    p = doc.add_heading(text, level=2)
    p.runs[0].font.color.rgb = DARK
    p.runs[0].font.size = Pt(13)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    return p


def h3(doc, text):
    p = doc.add_heading(text, level=3)
    p.runs[0].font.color.rgb = DARK
    p.runs[0].font.size = Pt(11)
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    return p


def body(doc, text):
    p = doc.add_paragraph(text)
    p.runs[0].font.size = Pt(10.5)
    return p


def code_block(doc, text):
    """코드 블록 스타일의 단락"""
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), 'F1F5F9')
    pPr.append(shd)
    run = p.add_run(text)
    run.font.name = 'Courier New'
    run.font.size = Pt(9.5)
    run.font.color.rgb = RGBColor(0x0f, 0x17, 0x2a)
    return p


def add_bullets(doc, items, indent=0):
    for item in items:
        p = doc.add_paragraph(item, style='List Bullet')
        p.paragraph_format.left_indent = Cm(0.5 + indent * 0.5)
        p.runs[0].font.size = Pt(10.5)


def add_note(doc, text, kind='info'):
    prefix = '💡 ' if kind == 'info' else ('⚠️ ' if kind == 'warning' else '🔴 ')
    color  = RGBColor(0x1e,0x56,0xa0) if kind=='info' else (RGBColor(0x92,0x40,0x0e) if kind=='warning' else RGBColor(0x7f,0x1d,0x1d))
    p = doc.add_paragraph()
    run = p.add_run(f'{prefix}{text}')
    run.font.size = Pt(10)
    run.font.color.rgb = color
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(4)


def add_table(doc, header, rows, size=9.5):
    tbl = doc.add_table(rows=1 + len(rows), cols=len(header))
    tbl.style = 'Light Shading Accent 1'
    for ci, h in enumerate(header):
        cell = tbl.cell(0, ci)
        cell.text = h
        cell.paragraphs[0].runs[0].font.bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(size + 0.5)
    for ri, row in enumerate(rows, 1):
        for ci, val in enumerate(row):
            tbl.cell(ri, ci).text = val
            tbl.cell(ri, ci).paragraphs[0].runs[0].font.size = Pt(size)
    doc.add_paragraph()


def add_api_table(doc, rows):
    """rows = [(method, endpoint, 권한, 설명), ...]"""
    method_colors = {'GET': RGBColor(0x05,0x78,0x03), 'POST': RGBColor(0x00,0x4e,0xc7),
                     'PUT': RGBColor(0x92,0x40,0x0e), 'DELETE': RGBColor(0x7f,0x1d,0x1d), 'PATCH': RGBColor(0x5b,0x21,0xb6)}
    tbl = doc.add_table(rows=1 + len(rows), cols=4)
    tbl.style = 'Light Shading Accent 1'
    for i, h in enumerate(['Method', 'Endpoint', '권한', '설명']):
        cell = tbl.cell(0, i)
        cell.text = h
        cell.paragraphs[0].runs[0].font.bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(10)
    for ri, (method, endpoint, auth, desc) in enumerate(rows, 1):
        for ci, val in enumerate([method, endpoint, auth, desc]):
            tbl.cell(ri, ci).text = val
            tbl.cell(ri, ci).paragraphs[0].runs[0].font.size = Pt(9.5)
        run = tbl.cell(ri, 0).paragraphs[0].runs[0]
        run.font.color.rgb = method_colors.get(method, GRAY)
        run.font.bold = True
    doc.add_paragraph()


# ─────────────────────────── 본문 ────────────────────────────

def build_manual():
    doc = Document()
    for section in doc.sections:
        section.top_margin    = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin   = Cm(3.0)
        section.right_margin  = Cm(2.5)

    # ── 표지 ──
    for _ in range(3):
        doc.add_paragraph()
    for text, size, color in [
        ('JJOBB', 28, BRAND_NAVY),
        ('전북 직업계고 졸업생 취업 네트워크', 18, BRAND_NAVY),
        ('개 발 자 매 뉴 얼', 16, DARK),
    ]:
        t = doc.add_heading(text, level=0)
        t.alignment = WD_ALIGN_PARAGRAPH.CENTER
        t.runs[0].font.color.rgb = color
        t.runs[0].font.size = Pt(size)
    doc.add_paragraph()
    for line in [
        f'버전: {VERSION} (v2 고도화)',
        f'작성일: {DATE}',
        '대상: 백엔드 / 프론트엔드 / 운영 담당 개발자',
        'GitHub: https://github.com/jsyang9455/graduate-network-v2',
        '설계 문서: docs/ (STATUS.md, 01~08, openapi.yaml)',
    ]:
        p = doc.add_paragraph(line)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.runs[0].font.size = Pt(10.5)
        p.runs[0].font.color.rgb = GRAY
    add_page_break(doc)

    # ── 목차 ──
    h1(doc, '목   차')
    for num, title in [
        ('1장', '아키텍처 개요'),
        ('2장', '개발 환경 설정'),
        ('3장', '프로젝트 구조'),
        ('4장', '데이터베이스 · 마이그레이션'),
        ('5장', '인증 · 인가 (JWT, RBAC, 학교 범위)'),
        ('6장', 'Backend API 레퍼런스'),
        ('7장', '프론트엔드 구조'),
        ('8장', '테스트'),
        ('9장', '배포 (Docker / AWS)'),
        ('10장', '환경 변수 · Nginx'),
        ('부록', '트러블슈팅 · 테스트 계정 · 개발 규칙'),
    ]:
        p = doc.add_paragraph()
        p.add_run(f'{num}  ').font.bold = True
        p.add_run(title).font.size = Pt(11)
        p.paragraph_format.space_after = Pt(4)
    add_page_break(doc)

    # ── 1장 ──
    h1(doc, '1장. 아키텍처 개요')
    h2(doc, '1.1 전체 구성')
    add_bullets(doc, [
        '클라이언트: HTML + CSS + Vanilla JS (다중 HTML, 프레임워크 없음). css/theme.css를 모든 페이지에서 마지막에 로드',
        '프론트 서버: Nginx — 정적 파일 + /api/ 역방향 프록시 (호스트 포트 기본 8090)',
        '백엔드: Node.js + Express (컨테이너 5000, 로컬 macOS는 5050 권장)',
        'DB: PostgreSQL 15 — 기동 시 database/migrations 자동 적용',
        '파일 저장: STORAGE_DRIVER=local(기본, /app/uploads 볼륨) 또는 s3',
        '문서 생성: pdfkit(이력서·상담일지 PDF), docx(상담일지 DOCX)',
    ])
    h2(doc, '1.2 v2 핵심 변경')
    add_table(doc, ['영역', 'v1', 'v2'], [
        ['테넌시', '단일 학교', '다중 학교 (users.school_id, schools 테이블)'],
        ['인가', 'user_type 체크', 'RBAC 메뉴 권한(role_menu_permissions) + 학교 범위 가드'],
        ['클라이언트 저장', 'localStorage에 사용자·업무 데이터', 'localStorage에는 JWT(token)만'],
        ['이력서', '프로필 텍스트', 'resumes / resume_items, PDF 생성, 지원 시 첨부'],
        ['신규 기능', '-', '상담일지 PDF/DOCX, 견학(정원·선착순/승인), 커뮤니티 신고·블라인드, 추천, 알림, 기업 승인, 학교 로고'],
        ['외부 연동', '-', '워크넷·알림톡은 키 없으면 NOT_CONFIGURED (가짜 연동 금지)'],
    ])
    h2(doc, '1.3 요청 흐름')
    add_bullets(doc, [
        '브라우저 → Nginx(:8090) → 정적 파일 직접 서빙',
        '/api/* → backend:5000 프록시',
        'Express: auth(JWT) → authorize(menu, action) → schoolScope → 핸들러 → PostgreSQL',
    ])
    add_page_break(doc)

    # ── 2장 ──
    h1(doc, '2장. 개발 환경 설정')
    h2(doc, '2.1 필수 도구')
    add_bullets(doc, ['Node.js 18 이상 (권장 22)', 'PostgreSQL 15', 'Git', 'Docker Desktop (통합 실행 시)'])
    h2(doc, '2.2 로컬 백엔드')
    code_block(doc, 'git clone https://github.com/jsyang9455/graduate-network-v2.git jjobb_v2\ncd jjobb_v2/backend\nnpm install\ncp .env.example .env      # DB_*, JWT_SECRET 수정, PORT=5050 (macOS AirPlay가 5000 점유)')
    code_block(doc, '# DB 초기화 (최초 1회)\ncreatedb graduate_network\npsql -d graduate_network -f ../database/schema.sql\npsql -d graduate_network -f ../database/seed.sql\nnpm run migrate           # database/migrations/*.sql 순차 적용\n\n# 테스트 계정(@jjob.com) 로드\n../scripts/load-test-accounts.sh\n\nnpm run dev               # nodemon')
    h2(doc, '2.3 로컬 프론트엔드')
    code_block(doc, '# 저장소 루트\npython3 -m http.server 8080\n# 브라우저 콘솔에서 API 주소 지정 (5050 사용 시)\nlocalStorage.setItem("jjobb_api_base", "http://localhost:5050/api")')
    add_note(doc, 'jjobb_api_base는 개발용 오버라이드로, localStorage에 허용되는 유일한 비토큰 키입니다.')
    h2(doc, '2.4 Docker Compose 전체 실행')
    code_block(doc, 'cp .env.example .env      # JWT_SECRET 필수 (없으면 compose가 실패)\ndocker compose up -d --build\ndocker compose ps\n# 프론트: http://localhost:8090  /  API: http://localhost:5000/api/health')
    add_page_break(doc)

    # ── 3장 ──
    h1(doc, '3장. 프로젝트 구조')
    code_block(doc,
'''jjobb_v2/
├── *.html                  # index, login, register, dashboard, jobs, career,
│                           # profile, counseling, counseling-journal, networking,
│                           # community, job-fair, industry-visit, certification-support,
│                           # applicant-detail, admin-*.html (6개) ...
├── css/                    # style.css, theme.css(마지막 로드), 페이지별 css
├── js/
│   ├── api.js              # API_BASE_URL, fetch 래퍼, 파일 업로드, 날짜 포맷(KST)
│   ├── auth.js             # 메모리 사용자 상태, /api/auth/me, 메뉴 권한 적용
│   └── <page>.js
├── images/                 # 로고(SVG) 등
├── backend/
│   ├── server.js           # 라우터 마운트, 기동 시 마이그레이션
│   ├── middleware/         # auth.js, authorize.js(RBAC), schoolScope.js
│   ├── modules/            # rbac, storage, documents(PDF/DOCX), notify,
│   │                       # recommendations, audit.js
│   ├── lib/                # roles, applicationStatus, companyApproval, httpErrors ...
│   ├── routes/             # 23개 라우터 (6장)
│   ├── scripts/            # migrate.js, apply-migrations.js, healthcheck.js
│   └── tests/              # node:test 통합 테스트
├── database/
│   ├── schema.sql, seed.sql, test-accounts.sql, demo-seed.sql
│   └── migrations/         # 002~003 (v1), 010~021 (v2)
├── docs/                   # STATUS, 요구사항, 아키텍처, 데이터 모델, API, IA, QA
├── scripts/                # aws-up.sh, load-test-accounts.sh, capture-screenshots.js,
│                           # generate-manual.py, generate-dev-manual.py
├── docker-compose.yml, Dockerfile, nginx.conf
└── AGENTS.md               # 멀티에이전트 역할 규칙''')
    add_page_break(doc)

    # ── 4장 ──
    h1(doc, '4장. 데이터베이스 · 마이그레이션')
    h2(doc, '4.1 v2 마이그레이션')
    add_table(doc, ['파일', '내용'], [
        ['010_v2_multischool', 'schools, departments, roles, menus, role_menu_permissions, user_roles, school_transfers, audit_logs, 주요 테이블 school_id'],
        ['011_v2_sprint1_resumes', 'files, resumes, resume_items, resume_documents, counseling_documents'],
        ['012_v2_sprint2_workflow', '지원 상태 워크플로, 알림'],
        ['013_v2_sprint3_community_tenancy', '커뮤니티 학교 범위'],
        ['014_v2_sprint4_recommendations_fieldtrips', 'resume_keywords, job_keywords, job_recommendations, recommendation_feedback, field_trips, field_trip_applications'],
        ['015_v2_sprint5_community_extras', 'post_categories, post_scraps, post_reports'],
        ['016_v2_sprint6_associated_com_trip', 'job_scraps, field_trip_reports'],
        ['017 / 019_v2_company_approval', '기업 승인 상태·사유, 승인 정책과 공고 권한'],
        ['018_v2_legacy_company_seed_repair', '레거시 기업 시드 보정'],
        ['020_v2_school_logo_primary_admin', '학교 로고, 주 담당자'],
        ['021_v2_brand_name_jjobb', '표시 이름 JJOBB 보정'],
    ])
    add_note(doc, '백엔드 기동 시 applyPendingMigrations가 미적용 파일을 순서대로 실행합니다. 수동 실행: npm run migrate')
    add_note(doc, '이미 적용된 마이그레이션 파일은 수정하지 말고, 새 번호 파일로 보정합니다. DROP 금지, IF NOT EXISTS 사용.', 'warning')
    h2(doc, '4.2 핵심 관계')
    add_bullets(doc, [
        'schools 1:N users (users.school_id) — 업무 테이블 대부분이 school_id 보유',
        'users N:M roles (user_roles) → role_menu_permissions(menu, can_read/can_write/can_manage)',
        'users(company) 1:N jobs → job_applications(resume_id 첨부) ← users(student)',
        'users 1:N resumes 1:N resume_items, resume_documents(PDF)',
        'counseling_sessions(student, counselor), counseling_journals(teacher, student)',
        'field_trips 1:N field_trip_applications, field_trip_reports',
        'posts → comments, post_reports, post_scraps / notifications(user_id)',
    ])
    body(doc, '컬럼 상세는 docs/03-data-model.md를 참고합니다.')
    add_page_break(doc)

    # ── 5장 ──
    h1(doc, '5장. 인증 · 인가')
    h2(doc, '5.1 역할')
    add_table(doc, ['역할 코드', '표시명', '비고'], [
        ['system_admin (v1 admin)', '시스템 관리자', '전 학교 접근'],
        ['school_admin', '학교 관리자', '소속 학교만 관리'],
        ['teacher', '교사', '상담·일지·견학·신고 처리'],
        ['student / graduate', '학생 / 졸업생', '본인 데이터'],
        ['company', '기업', 'company_approval_status=approved일 때 공고·학생 정보 접근'],
    ])
    h2(doc, '5.2 미들웨어 체인')
    code_block(doc, '''// routes 예시
router.patch('/:id/company-approval',
  auth,                                   // JWT 검증 → req.user
  authorize('company_approval', 'write'), // RBAC 메뉴 권한 (modules/rbac)
  schoolScope,                            // 학교 범위 (system_admin 제외)
  handler);

// 리소스 단위 확인
if (!assertSameSchool(req, row.school_id)) return forbidCrossSchool(res);''')
    add_bullets(doc, [
        '오류 형식: { error: "메시지", code, status } — UNAUTHENTICATED(401), FORBIDDEN(403), VALIDATION(400), NOT_FOUND(404), CONFLICT(409), COMPANY_NOT_APPROVED(403)',
        '연락처 마스킹: 이메일·전화는 본인, 관리자, 같은 학교 교사만 원문 (users.js canSeeContact)',
        '중복 가입·중복 지원은 409 CONFLICT',
    ])
    h2(doc, '5.3 프론트 권한 적용')
    add_bullets(doc, [
        'GET /api/me/permissions 결과로 메뉴 표시 제어',
        'HTML 요소에 data-menu="jobs" data-menu-min="write" 지정 → 권한 없으면 숨김',
        '서버 가드가 최종 판단 — 프론트 숨김은 UX일 뿐 보안 경계 아님',
    ])
    h2(doc, '5.4 토큰 저장 규칙')
    code_block(doc, '''// localStorage: token 만 (+ 개발용 jjobb_api_base)
localStorage.setItem("token", token);

// 사용자 정보는 메모리 — /api/auth/me 로 로드
await auth.whenUserLoaded();
const user = auth.getCurrentUser();''')
    add_note(doc, '이력서, 학교코드, 공고, 사용자 객체를 localStorage에 저장하지 않습니다. auth.js는 로드 시 레거시 키(graduateNetwork_user 등)를 삭제합니다.', 'warning')
    add_page_break(doc)

    # ── 6장 ──
    h1(doc, '6장. Backend API 레퍼런스')
    body(doc, 'Base URL: /api (운영, Nginx 프록시) · http://localhost:5050/api (로컬). 전체 계약은 docs/04-api-design.md, docs/openapi.yaml.')
    code_block(doc, 'GET /api/health  →  {"status":"OK", ...}')

    h2(doc, '6.1 인증 · 나')
    add_api_table(doc, [
        ('POST', '/api/auth/register', '공개', '회원가입 (school_id, user_type, 비밀번호 8자 이상)'),
        ('POST', '/api/auth/login', '공개', '로그인 → token'),
        ('GET', '/api/auth/me', 'JWT', '현재 사용자'),
        ('POST', '/api/auth/change-password', 'JWT', '비밀번호 변경'),
        ('GET', '/api/me/permissions', 'JWT', '메뉴 권한 목록'),
    ])
    h2(doc, '6.2 학교 · 역할 · 사용자')
    add_api_table(doc, [
        ('GET', '/api/schools', '공개', '학교 목록 (가입 화면)'),
        ('POST / PATCH', '/api/schools, /api/schools/:id', 'schools 권한', '학교 등록·수정, 주 담당자'),
        ('GET / POST', '/api/schools/:id/logo', '조회 공개 / 관리자', '로고 (없으면 204)'),
        ('GET / POST', '/api/schools/:id/departments', 'JWT', '학과'),
        ('GET / PUT', '/api/roles/:code/permissions', 'schools manage', '권한 매트릭스'),
        ('GET', '/api/users', 'users 권한', '회원 목록 (include_withdrawn은 관리자만)'),
        ('GET', '/api/users/companies', 'company_approval read', '기업 승인 대상'),
        ('PATCH', '/api/users/:id/company-approval', 'company_approval write', '승인/반려(사유 필수)'),
        ('POST', '/api/users/:id/roles · /:id/transfer', '관리자', '역할 부여 · 전학 처리'),
        ('PUT / GET', '/api/users/profile · /company-profile · /graduate-profile', 'JWT', '본인 프로필'),
        ('POST', '/api/users/withdraw', 'JWT', '회원 탈퇴'),
    ])
    h2(doc, '6.3 채용 · 지원 · 이력서 · 파일')
    add_api_table(doc, [
        ('GET', '/api/jobs', 'JWT', '공고 목록 (학교 범위, 필터)'),
        ('POST / PUT / DELETE', '/api/jobs, /api/jobs/:id', '승인된 기업 · 관리자', '공고 등록·수정·삭제'),
        ('POST', '/api/jobs/:id/apply', '학생', '지원 (resume_id) — 중복 409'),
        ('GET', '/api/jobs/:id/applicants', '기업 · 교사 · 관리자', '지원자 목록'),
        ('PATCH', '/api/jobs/applications/:id/status', '기업 · 교사 · 관리자', '상태 전이 (아래 표)'),
        ('GET', '/api/jobs/my/applications', '학생', '내 지원'),
        ('POST / DELETE', '/api/jobs/:id/scrap', 'JWT', '공고 스크랩'),
        ('GET / POST / PUT / DELETE', '/api/resumes[/:id]', '본인', '이력서 CRUD'),
        ('POST', '/api/resumes/:id/primary · /:id/pdf', '본인', '대표 지정 · PDF 생성'),
        ('GET', '/api/resumes/:id/preview', '본인 · 열람 권한자', '미리보기'),
        ('POST / GET', '/api/files, /api/files/:id', 'JWT', '업로드 · 다운로드 (권한 확인)'),
        ('GET / POST', '/api/recommendations/me · /recompute · /feedback', 'JWT', '추천 공고'),
    ])
    add_table(doc, ['현재 상태', '변경 가능'], [
        ['pending (대기)', 'reviewed, rejected'],
        ['reviewed (서류검토)', 'interviewed, accepted, rejected'],
        ['interviewed (면접)', 'accepted, rejected'],
        ['accepted / rejected', '없음 (종료)'],
    ])
    h2(doc, '6.4 상담 · 상담일지')
    add_api_table(doc, [
        ('GET', '/api/counseling/teachers · /available-slots', 'JWT', '같은 학교 교사 · 시간'),
        ('GET / POST', '/api/counseling', 'JWT', '상담 목록 · 신청'),
        ('PUT', '/api/counseling/:id', '담당 교사 · 관리자 (학생은 cancelled만)', '승인/거절/완료, 담당자 변경(같은 학교 교사만)'),
        ('GET / POST / PUT / DELETE', '/api/counseling-journals[/:id]', '교사', '상담일지 CRUD (is_private, follow_up_at → 알림)'),
        ('GET', '/api/counseling-journals/stats · /timeline/:studentId', '교사', '통계 · 학생 타임라인'),
        ('POST', '/api/counseling-journals/:id/pdf · /:id/docx', '교사', '문서 출력'),
    ])
    h2(doc, '6.5 커뮤니티 · 견학 · 공지 · 알림 · 기타')
    add_api_table(doc, [
        ('GET / POST', '/api/posts', 'JWT', '게시글 (카테고리·태그·익명)'),
        ('POST', '/api/posts/:id/comments · /like · /scrap', 'JWT', '댓글 · 좋아요 · 스크랩'),
        ('POST', '/api/posts/:id/report', 'JWT', '신고'),
        ('GET / POST / DELETE', '/api/posts/reports · /:id/blind', '교사 · 관리자', '신고 목록 · 블라인드'),
        ('GET / POST / PUT', '/api/field-trips[/:id]', '조회 JWT / 등록 교사', '견학 (capacity, mode=fifo|approval, deadline)'),
        ('POST', '/api/field-trips/:id/apply', '학생', '신청 (applicant_name, applicant_phone)'),
        ('PATCH', '/api/field-trips/applications/:id · /:id/attendance', '교사', '승인 · 출석'),
        ('GET / PUT', '/api/field-trips/:id/roster · /:id/report', '교사', '명단 · 결과 보고'),
        ('GET / POST / PUT / DELETE', '/api/announcements', '조회 공개 / 관리', '박람회·견학·자격증 공지'),
        ('GET', '/api/notifications', 'JWT', '알림 (created_at UTC → 프론트 KST 표시)'),
        ('PATCH / POST', '/api/notifications/:id/read · /read-all', 'JWT', '읽음 처리'),
        ('GET', '/api/notifications/providers', 'JWT', '알림톡/SMS 설정 상태 (미설정 시 NOT_CONFIGURED)'),
        ('GET / POST', '/api/worknet/status · /sync · /logs', '관리자', '워크넷 (키 없으면 NOT_CONFIGURED)'),
        ('GET', '/api/networking/*, /api/messages/*', 'JWT', '동문 네트워크 · 메시지'),
        ('GET', '/api/audit-logs', '관리자', '감사 로그'),
        ('GET / POST / PUT / DELETE', '/api/majors, /api/education-programs, /api/certificates, /api/stats', '권한별', '코드 · 교육 · 자격증 · 통계'),
    ])
    add_page_break(doc)

    # ── 7장 ──
    h1(doc, '7장. 프론트엔드 구조')
    h2(doc, '7.1 js/api.js')
    code_block(doc, '''const API_BASE_URL = (() => {
  const override = localStorage.getItem('jjobb_api_base');  // 개발용, localhost에서만 적용
  if (override && isLocal) return override;
  // localhost → http://localhost:5000/api, 그 외 → /api (Nginx)
})();

formatLocalDate(value)      // YYYY-MM-DD (로컬)
formatLocalDateTime(value)  // YYYY-MM-DD HH:mm (Asia/Seoul)''')
    add_note(doc, 'HTML/JS에 API 주소를 하드코딩하지 말고 API_BASE_URL과 api 래퍼를 사용합니다.', 'warning')
    h2(doc, '7.2 js/auth.js')
    add_bullets(doc, [
        '사용자 객체는 메모리에만 보관, /api/auth/me 로 로드 (응답 전에는 JWT 디코드 값으로 임시 표시)',
        'auth.ready / auth.whenUserLoaded(): 사용자 로드 완료 대기',
        'logout(): token 삭제 후 로그인 페이지 이동',
        '로그인 필요 페이지는 returnUrl과 함께 login.html로 이동',
    ])
    h2(doc, '7.3 관리자 화면')
    body(doc, 'admin-*.html 6개 페이지는 동일한 사이드바(대시보드 · 회원 관리 · 권한 매트릭스 · 채용공고 관리 · 게시판 관리 · 코드 관리 · 공지사항 관리)를 사용하며, 현재 페이지 항목에 active 클래스를 지정합니다. 메뉴 항목에는 data-menu / data-menu-min을 지정합니다.')
    h2(doc, '7.4 신규 페이지 체크리스트')
    add_bullets(doc, [
        'css/style.css → 페이지 css → css/theme.css(마지막) 순서로 로드',
        'js/api.js, js/auth.js 포함, 메뉴에 data-menu 권한 지정',
        '업무 데이터는 API로만 조회 — localStorage 폴백 금지',
        '모바일(375px) 확인 및 브라우저 검증 후 docs/05-frontend-ia.md 갱신',
        '배포 후 캐시 문제 시 강력 새로고침 안내 (Ctrl+Shift+R)',
    ])
    add_page_break(doc)

    # ── 8장 ──
    h1(doc, '8장. 테스트')
    code_block(doc, 'cd backend\nnpm test        # node:test 통합 테스트 (114개, 실제 DB 사용)')
    add_bullets(doc, [
        '테스트는 학교 A/B를 만들어 타교 데이터 접근이 403/404인지 검증 (멀티스쿨 격리)',
        'REQ-xxx와 테스트 매핑: docs/08-test-strategy.md',
        'QA 보고서: docs/qa/comprehensive-test-report-2026-11-09.md',
        '매뉴얼 스크린샷: node scripts/capture-screenshots.js (API_URL, CHROME_PATH, MANUAL_PASSWORD 환경변수)',
        '매뉴얼 생성: python3 scripts/generate-manual.py / generate-dev-manual.py (python-docx 필요)',
    ])
    add_page_break(doc)

    # ── 9장 ──
    h1(doc, '9장. 배포 (Docker / AWS)')
    h2(doc, '9.1 서비스 구성')
    add_table(doc, ['서비스', '컨테이너', '포트(호스트:컨테이너)', '비고'], [
        ['postgres', 'graduate-network-db', '5432:5432', 'postgres_data 볼륨, 최초 schema+seed+010'],
        ['backend', 'graduate-network-backend', '5000:5000', '기동 시 마이그레이션, backend_uploads 볼륨, ./database 마운트'],
        ['frontend', 'graduate-network-frontend', '${FRONTEND_PORT:-8090}:80', 'Nginx, 소스·nginx.conf 바인드 마운트'],
    ])
    h2(doc, '9.2 EC2 최초 배포')
    code_block(doc, 'git clone https://github.com/jsyang9455/graduate-network-v2.git jjobb_v2\ncd jjobb_v2\ncp .env.example .env     # JWT_SECRET, DB_PASSWORD 설정 (커밋 금지)\n./scripts/aws-up.sh      # 빌드·기동·헬스체크 (비운영은 테스트 계정 자동 로드)\n# 운영: DEPLOY_ENV=production 또는 --no-test-accounts')
    h2(doc, '9.3 코드 변경 후 재배포')
    code_block(doc, 'cd jjobb_v2\ngit pull origin main\n./scripts/aws-up.sh\n# 또는\ndocker compose up -d --build\ndocker compose ps\ncurl -s http://127.0.0.1:8090/api/health')
    add_bullets(doc, [
        'HTML/CSS/JS: 소스가 바인드 마운트되어 git pull 즉시 반영 (브라우저 강력 새로고침)',
        'nginx.conf 변경: docker compose restart frontend',
        '백엔드 변경: docker compose up -d --build backend (마이그레이션 자동 적용)',
        '로그: docker compose logs -f backend',
    ])
    add_note(doc, 'docker compose down -v 는 DB 볼륨까지 삭제합니다. 운영에서 사용 금지.', 'danger')
    add_page_break(doc)

    # ── 10장 ──
    h1(doc, '10장. 환경 변수 · Nginx')
    h2(doc, '10.1 환경 변수 (.env / backend/.env)')
    add_table(doc, ['변수', '설명'], [
        ['JWT_SECRET', '필수. 32자 이상 임의 문자열 (compose는 미설정 시 실패)'],
        ['JWT_EXPIRE', '토큰 만료 (기본 7d)'],
        ['DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD', 'PostgreSQL 접속 (compose 내부 DB_HOST=postgres)'],
        ['PORT', '백엔드 포트 (컨테이너 5000, 로컬 macOS 5050)'],
        ['FRONTEND_PORT', 'Nginx 호스트 포트 (기본 8090)'],
        ['STORAGE_DRIVER / STORAGE_LOCAL_DIR', 'local | s3, 로컬 저장 경로'],
        ['S3_BUCKET / S3_ENDPOINT / AWS_*', 'S3 사용 시'],
        ['DEPLOY_ENV / LOAD_TEST_ACCOUNTS', 'aws-up.sh 테스트 계정 로드 제어'],
        ['워크넷·알림톡 키', '미설정 시 NOT_CONFIGURED 응답 (가짜 성공 금지)'],
    ])
    add_note(doc, '.env 파일은 커밋하지 않습니다. 예시는 .env.example, backend/.env.example.', 'warning')
    h2(doc, '10.2 nginx.conf')
    add_bullets(doc, [
        'location /api/ → proxy_pass http://backend:5000/api/ (컨테이너 서비스명 사용)',
        '정적 파일 try_files, 민감 경로(.env, .git, backend 등) 접근 차단',
        'JS/CSS 캐시 비활성화로 배포 즉시 반영',
    ])
    add_page_break(doc)

    # ── 부록 ──
    h1(doc, '부록')
    h2(doc, 'A. 트러블슈팅')
    for title_text, steps in [
        ('로컬에서 API 연결 실패 (macOS)', ['AirPlay 수신기가 5000 포트 점유 → PORT=5050',
                                       'localStorage.jjobb_api_base = "http://localhost:5050/api"']),
        ('compose 기동 실패: Set JWT_SECRET', ['저장소 루트 .env에 JWT_SECRET 설정']),
        ('nginx 502 /api/*', ['backend 컨테이너 상태·로그 확인 (마이그레이션 실패 여부)',
                             './database 마운트 확인']),
        ('column does not exist', ['npm run migrate 또는 백엔드 재기동으로 마이그레이션 적용']),
        ('403 FORBIDDEN / COMPANY_NOT_APPROVED', ['권한 매트릭스와 사용자 역할 확인', '기업은 승인 상태 확인']),
        ('화면이 예전 버전', ['강력 새로고침 (Ctrl+Shift+R / Cmd+Shift+R)']),
    ]:
        p = doc.add_paragraph()
        r = p.add_run(f'■ {title_text}')
        r.font.bold = True
        r.font.size = Pt(11)
        add_bullets(doc, steps)

    h2(doc, 'B. 테스트 계정 (로컬 · 테스트 서버)')
    add_table(doc, ['역할', '이메일', '비밀번호'], [
        ['학생', 'student@jjob.com', 'password123'],
        ['졸업생', 'graduate@jjob.com', 'password123'],
        ['교사', 'teacher@jjob.com', 'password123'],
        ['기업', 'company@jjob.com', 'password123'],
        ['관리자', 'admin@jjob.com', 'password123'],
    ], size=10)
    add_note(doc, 'scripts/load-test-accounts.sh 로 생성됩니다. 운영 서버에는 로드하지 마세요.', 'warning')

    h2(doc, 'C. 개발 규칙 (AGENTS.md 요약)')
    add_bullets(doc, [
        '작업 전 docs/STATUS.md와 docs/00-vision-and-scope.md 확인, OUT-of-scope 구현 금지',
        '한 세션 = 한 역할 (Frontend / Backend / API / QA ...)',
        '모든 업무 API는 school_id 범위 + 메뉴 권한',
        'API 계약 변경 시 docs/04-api-design.md, openapi.yaml 동시 갱신',
        '완료 시 REQ-xxx 인용, 관련 docs 갱신, STATUS % 갱신',
    ])

    doc.add_paragraph()
    footer = doc.add_paragraph(f'JJOBB 전북 직업계고 졸업생 취업 네트워크  |  개발자 매뉴얼 {VERSION}  |  {DATE}')
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.runs[0].font.color.rgb = GRAY
    footer.runs[0].font.size = Pt(9)

    doc.save(OUTPUT_FILE)
    print(f'✅ 개발자 매뉴얼 저장 완료: {OUTPUT_FILE}')


if __name__ == '__main__':
    build_manual()
