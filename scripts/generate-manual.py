"""
JJOBB 전북 직업계고 졸업생 취업 네트워크 - 사용자 매뉴얼 DOCX 생성 (v2)
실행: python3 scripts/generate-manual.py
전제조건: node scripts/capture-screenshots.js 로 manual-screenshots/ 생성
"""

import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOT_DIR = os.path.join(BASE_DIR, 'manual-screenshots')
OUTPUT_FILE = os.path.join(BASE_DIR, '전북지역_졸업생네트워크_사용자매뉴얼.docx')

VERSION = 'v2.1'
DATE = '2026년 11월 9일'

BRAND_NAVY = RGBColor(0x0f, 0x2b, 0x4c)
BRAND_GREEN = RGBColor(0x00, 0x8a, 0x5a)
DARK = RGBColor(0x1f, 0x29, 0x37)
GRAY = RGBColor(0x6b, 0x72, 0x80)


def img(name):
    path = os.path.join(SCREENSHOT_DIR, f'{name}.png')
    return path if os.path.exists(path) else None


def h1(doc, text):
    p = doc.add_heading(text, level=1)
    p.runs[0].font.color.rgb = BRAND_NAVY
    p.runs[0].font.size = Pt(16)
    p.paragraph_format.space_before = Pt(16)
    return p


def h2(doc, text):
    p = doc.add_heading(text, level=2)
    p.runs[0].font.color.rgb = DARK
    p.runs[0].font.size = Pt(13)
    p.paragraph_format.space_before = Pt(10)
    return p


def body(doc, text):
    p = doc.add_paragraph(text)
    p.runs[0].font.size = Pt(10.5)
    return p


def shot(doc, name, caption, width=Inches(5.8)):
    path = img(name)
    if path:
        para = doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.add_run().add_picture(path, width=width)
    else:
        p = doc.add_paragraph(f'[스크린샷 없음: {name}]')
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.runs[0].font.color.rgb = GRAY
    cap = doc.add_paragraph(caption)
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.runs[0].font.size = Pt(9)
    cap.runs[0].font.italic = True
    cap.runs[0].font.color.rgb = GRAY


def steps(doc, items):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph(f'{i}. {item}')
        p.paragraph_format.left_indent = Cm(0.5)
        p.paragraph_format.space_after = Pt(2)
        p.runs[0].font.size = Pt(10.5)


def bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(item, style='List Bullet')
        p.runs[0].font.size = Pt(10.5)


def note(doc, text, warn=False):
    p = doc.add_paragraph()
    run = p.add_run(('⚠️ ' if warn else '💡 ') + text)
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x92, 0x40, 0x0e) if warn else BRAND_NAVY
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(6)


def table(doc, header, rows):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = 'Light Grid Accent 1'
    for i, h in enumerate(header):
        cell = t.rows[0].cells[i]
        cell.text = h
        cell.paragraphs[0].runs[0].font.bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(10)
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v
            cells[i].paragraphs[0].runs[0].font.size = Pt(10)
    doc.add_paragraph()


def build_manual():
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2.2)
        section.bottom_margin = Cm(2.2)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    # ── 표지 ──
    doc.add_paragraph()
    for text, size, color in [
        ('JJOBB', 30, BRAND_NAVY),
        ('전북 직업계고 졸업생 취업 네트워크', 18, BRAND_NAVY),
        ('사 용 자 매 뉴 얼', 16, DARK),
    ]:
        p = doc.add_heading(text, level=0)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.runs[0].font.size = Pt(size)
        p.runs[0].font.color.rgb = color
    doc.add_paragraph()
    shot(doc, '01_main', '메인 화면', width=Inches(5.2))
    p = doc.add_paragraph(f'버전 {VERSION}  |  {DATE}')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.runs[0].font.color.rgb = GRAY
    doc.add_page_break()

    # ── 목차 ──
    h1(doc, '목   차')
    toc = [
        ('1장', '시작하기', '서비스 소개 · 회원 유형 · 회원가입 · 로그인'),
        ('2장', '학생 · 졸업생', '대시보드 · 채용 정보 · 이력서 · 프로필 · 진로 상담 · JJOBB 밴드 · 커뮤니티 · 박람회 · 견학 · 자격증'),
        ('3장', '교사', '대시보드 · 상담 관리 · 상담일지 · 견학 운영 · 게시글 관리'),
        ('4장', '기업', '가입 승인 · 공고 등록 · 지원자 관리 · 기업 정보'),
        ('5장', '관리자', '회원 관리 · 기업 승인 · 권한 매트릭스 · 채용공고 · 게시판 · 코드 · 공지사항'),
        ('부록', '모바일 · 개인정보 · 문제 해결', ''),
    ]
    for num, title, detail in toc:
        p = doc.add_paragraph()
        r = p.add_run(f'{num}  {title}')
        r.font.bold = True
        r.font.size = Pt(11)
        if detail:
            r2 = p.add_run(f'\n      {detail}')
            r2.font.size = Pt(9.5)
            r2.font.color.rgb = GRAY
    doc.add_page_break()

    # ── 1장 ──
    h1(doc, '1장. 시작하기')
    h2(doc, '1.1 서비스 소개')
    body(doc, 'JJOBB는 전북 지역 직업계고 재학생·졸업생, 교사, 지역 기업을 잇는 취업 지원 플랫폼입니다. '
              '여러 학교가 함께 사용하며, 모든 데이터는 소속 학교 단위로 분리되어 다른 학교 사용자에게 보이지 않습니다.')
    h2(doc, '1.2 회원 유형')
    table(doc, ['유형', '주요 기능'], [
        ['재학생 · 졸업생', '채용 정보 조회·지원, 이력서 작성·PDF, 진로 상담, JJOBB 밴드, 커뮤니티, 견학·박람회 신청'],
        ['교사', '상담 승인·답변, 상담일지(PDF/DOCX), 견학 운영, 게시글 신고 처리, 같은 학교 지원 현황 확인'],
        ['기업', '관리자 승인 후 채용 공고 등록·수정, 지원자 이력서 확인, 지원 상태 변경'],
        ['학교 관리자 · 시스템 관리자', '회원·기업 승인, 권한 매트릭스, 채용공고·게시판·코드·공지사항 관리'],
    ])

    h2(doc, '1.3 회원가입')
    shot(doc, '03_register', '▲ 회원가입 화면')
    steps(doc, [
        '메인 화면 오른쪽 위 "회원가입" 클릭',
        '회원 유형 선택: 재학생 / 졸업생 / 교사 / 기업',
        '소속 학교 선택 (관리자가 등록한 학교 목록)',
        '이름, 이메일, 비밀번호(8자 이상)와 비밀번호 확인 입력',
        '재학생·졸업생은 졸업(예정)연도, 기업은 회사명 입력',
        '"가입하기" 클릭 → 자동 로그인 후 대시보드로 이동',
    ])
    note(doc, '기업 회원은 가입 직후 "승인 대기" 상태입니다. 관리자가 승인해야 공고 등록과 학생 정보 조회가 가능합니다.')
    note(doc, '관리자 계정은 회원가입으로 만들 수 없습니다. 시스템 관리자가 지정합니다.', warn=True)

    h2(doc, '1.4 로그인 · 로그아웃')
    shot(doc, '02_login', '▲ 로그인 화면')
    steps(doc, [
        '"로그인" 클릭 → 이메일·비밀번호 입력 → "로그인"',
        '회원 유형과 권한에 맞는 메뉴가 왼쪽에 표시됩니다',
        '오른쪽 위 "로그아웃"으로 종료',
    ])
    note(doc, '로그인하지 않은 상태에서 대시보드 주소로 들어가면 로그인 화면으로 이동하고, 로그인 후 원래 화면으로 돌아갑니다.')
    doc.add_page_break()

    # ── 2장 ──
    h1(doc, '2장. 학생 · 졸업생')
    h2(doc, '2.1 대시보드')
    shot(doc, '04_student_dashboard', '▲ 학생 대시보드')
    bullets(doc, [
        '신규 채용공고 · 지원 현황 · 네트워크 · 새 메시지 요약',
        '알림: 지원 상태 변경, 상담 답변, 견학 승인 등 (한국 시간 표시)',
        '추천 채용공고: 전공·희망 직무 기반 추천과 추천 사유',
        '최근 소식 · 평생교육 프로그램',
    ])

    h2(doc, '2.2 채용 정보 · 지원')
    shot(doc, '05_student_jobs', '▲ 채용 정보 목록')
    steps(doc, [
        '상단 메뉴 "채용 정보" 클릭 — 소속 학교에 공개된 공고만 표시',
        '회사명·공고명 검색, 고용 형태(정규직/계약직/파트타임/인턴)·모집 상태 필터 후 "검색"',
        '공고 제목 클릭 → 상세 정보(근무지, 급여, 마감일·D-day, 주요 업무)',
        '"지원하기" → 첨부할 이력서 선택(대표 이력서 기본) → 지원 완료',
    ])
    shot(doc, '06_student_job_detail', '▲ 채용 공고 상세')
    body(doc, '지원 상태는 기업이 변경하며, 변경될 때마다 알림으로 안내됩니다.')
    table(doc, ['상태', '의미'], [
        ['대기', '지원 접수'], ['서류검토', '기업이 이력서 검토 중'], ['면접', '면접 진행 단계'],
        ['합격 / 불합격', '최종 결과'],
    ])
    note(doc, '같은 공고에는 한 번만 지원할 수 있습니다. 이력서가 없으면 지원 전에 이력서 작성 안내가 표시됩니다.')

    h2(doc, '2.3 이력서 · 경력 관리')
    shot(doc, '07_student_career', '▲ 이력서·경력 관리')
    steps(doc, [
        '왼쪽 메뉴 "경력 관리" 클릭',
        '"새 이력서" → 제목, 자기소개, 학력·경력·자격증·활동 항목 입력 → 저장',
        '여러 이력서를 만들고 하나를 "대표 이력서"로 지정',
        '"미리보기"로 확인 후 "PDF 다운로드" (한글 지원)',
    ])
    note(doc, '이력서는 본인과, 지원한 공고의 기업·같은 학교 교사만 볼 수 있습니다.')

    h2(doc, '2.4 내 프로필')
    shot(doc, '08_student_profile', '▲ 내 프로필')
    steps(doc, ['왼쪽 메뉴 "내 프로필" → "수정"', '연락처, 전공, 희망 직무, 자기소개 등 수정 → "저장"'])
    note(doc, '내 이메일·전화번호는 본인, 관리자, 같은 학교 교사에게만 보입니다. 다른 학생이나 기업에게는 표시되지 않습니다.')

    h2(doc, '2.5 진로 상담')
    shot(doc, '09_student_counseling', '▲ 진로 상담')
    steps(doc, [
        '상단 메뉴 "진로 상담" → "상담 신청" 탭',
        '상담 유형, 상담교사(같은 학교 교사), 제목, 내용 입력 → 신청',
        '"내 상담" 탭에서 진행 상태와 교사 답변 확인',
        '필요하면 대기 중인 상담을 취소',
    ])
    note(doc, '상담 승인·완료 처리는 담당 교사만 할 수 있습니다. 담당 교사는 같은 학교 교사로만 변경할 수 있습니다.')

    h2(doc, '2.6 JJOBB 밴드 (동문 네트워킹)')
    shot(doc, '10_student_networking', '▲ JJOBB 밴드')
    bullets(doc, ['같은 학교 졸업생을 이름·회사·직무로 검색', '선배에게 메시지 보내기 · 멘토링 연결'])

    h2(doc, '2.7 커뮤니티')
    shot(doc, '11_student_community', '▲ 커뮤니티')
    bullets(doc, [
        '카테고리(취업 Q&A, 소식 등)와 태그로 글 작성·검색, 익명 작성 가능',
        '댓글 · 좋아요 · 스크랩',
        '부적절한 글은 사유와 함께 "신고" → 교사가 확인 후 블라인드 처리',
    ])

    h2(doc, '2.8 취업 박람회 · 산업체 견학 · 자격증 지원')
    shot(doc, '13_student_industryvisit', '▲ 산업체 견학')
    steps(doc, [
        '왼쪽 메뉴 "공지사항" 아래 해당 메뉴 클릭',
        '일정·장소·모집 인원·혜택 확인 후 "신청" → 이름·연락처 입력',
        '견학은 선착순(즉시 확정) 또는 교사 승인 방식이며, 정원이 차면 신청이 마감됩니다',
    ])
    shot(doc, '12_student_jobfair', '▲ 취업 박람회', width=Inches(4.8))
    shot(doc, '14_student_certification', '▲ 자격증 지원', width=Inches(4.8))
    doc.add_page_break()

    # ── 3장 ──
    h1(doc, '3장. 교사')
    h2(doc, '3.1 교사 대시보드')
    shot(doc, '15_teacher_dashboard', '▲ 교사 대시보드')
    bullets(doc, ['상담 신청 내역과 대기 건수', '최근 상담일지', '최근 소식 · 교육 프로그램'])

    h2(doc, '3.2 진로 상담 관리')
    shot(doc, '16_teacher_counseling', '▲ 진로 상담 관리')
    steps(doc, [
        '"진로 상담" → 나에게 배정된 상담 목록 확인',
        '상담 선택 → "승인" 또는 "거절", 답변(메모) 작성',
        '상담 후 "완료" 처리',
    ])

    h2(doc, '3.3 상담일지')
    shot(doc, '17_teacher_journal', '▲ 상담일지')
    steps(doc, [
        '왼쪽 메뉴 "상담일지" → "새 일지"',
        '학생, 상담일, 상담 유형(진학·취업 등), 제목, 내용, 후속 조치·후속 일정 입력',
        '필요하면 "비공개" 지정 후 저장 — 후속 일정이 있으면 학생에게 알림이 생성됩니다',
        '학생별 타임라인과 유형별 통계 확인',
        '"PDF" 또는 "DOCX"로 출력',
    ])
    note(doc, '상담일지는 같은 학교 안에서만 조회되며, 다른 학교에서는 보이지 않습니다.')

    h2(doc, '3.4 견학 운영 · 게시글 관리 · 지원 현황')
    bullets(doc, [
        '산업체 견학: 견학 등록(정원, 선착순/승인 방식, 마감일), 신청자 승인, 명단 확인',
        '커뮤니티: 같은 학교 신고 목록 확인 → 블라인드 처리',
        '채용: 같은 학교 공고의 지원자와 이력서 확인',
    ])
    doc.add_page_break()

    # ── 4장 ──
    h1(doc, '4장. 기업')
    h2(doc, '4.1 가입과 승인')
    steps(doc, [
        '회원가입에서 "기업" 선택 → 소속(협약) 학교, 회사명 입력',
        '가입 후 대시보드와 기업 정보 화면에 "승인 대기" 안내 표시',
        '관리자가 승인하면 공고 등록·지원자 관리 기능이 열립니다',
    ])
    note(doc, '승인 대기 중에는 공고를 등록할 수 없고, 학생 목록·연락처도 조회할 수 없습니다. 반려되면 반려 사유가 안내됩니다.', warn=True)

    h2(doc, '4.2 기업 대시보드')
    shot(doc, '18_company_dashboard', '▲ 기업 대시보드')
    bullets(doc, ['활성 채용공고 · 총 지원자 · 조회수 · 채용 완료 요약', '내 채용공고 목록(보기·수정)', '최근 지원자'])

    h2(doc, '4.3 채용 공고 등록 · 수정')
    shot(doc, '19_company_job_create', '▲ 채용 공고 등록')
    steps(doc, [
        '왼쪽 메뉴 "공고 등록"',
        '공고명, 고용 형태, 경력, 근무지, 급여, 채용 인원, 마감일, 주요 업무·자격 요건 입력 → 등록',
        '대시보드 "내 채용공고"에서 "수정"으로 내용 변경',
    ])

    h2(doc, '4.4 지원자 관리')
    steps(doc, [
        '대시보드 "최근 지원자" 또는 공고 "보기" → 지원자 선택',
        '첨부 이력서 확인·PDF 다운로드',
        '상태 변경: 대기 → 서류검토 → (면접) → 합격. 불합격은 진행 중 어느 단계에서나 가능하며, 합격·불합격 후에는 변경할 수 없습니다',
        '상태를 바꾸면 학생에게 알림이 전송됩니다',
    ])

    h2(doc, '4.5 기업 정보')
    shot(doc, '20_company_profile', '▲ 기업 정보')
    body(doc, '회사명, 업종, 규모, 홈페이지, 주소, 소개를 입력하면 공고 상세에 표시됩니다.')
    doc.add_page_break()

    # ── 5장 ──
    h1(doc, '5장. 관리자')
    body(doc, '관리자 화면의 왼쪽 메뉴는 모든 관리자 화면에서 동일합니다: 대시보드 · 회원 관리 · 권한 매트릭스 · '
              '채용공고 관리 · 게시판 관리 · 코드 관리 · 공지사항 관리. 학교 관리자는 소속 학교 데이터만 관리합니다.')
    h2(doc, '5.1 관리자 대시보드')
    shot(doc, '21_admin_dashboard', '▲ 관리자 대시보드')

    h2(doc, '5.2 회원 관리')
    shot(doc, '22_admin_users', '▲ 회원 관리')
    steps(doc, [
        '"활성 회원" 탭: 이름·이메일 검색, 회원 유형 필터',
        '회원 선택 → 기본 정보, 상담교사 지정, 학력·직업 정보 수정 → 저장',
        '"탈퇴 회원" 탭: 탈퇴 회원과 탈퇴 사유 조회 (관리자 전용)',
    ])

    h2(doc, '5.3 기업 승인')
    shot(doc, '23_admin_company_approval', '▲ 기업 승인')
    steps(doc, [
        '회원 관리 → "기업 승인" 탭 → 승인 상태(대기/승인/반려) 조회',
        '"승인" 클릭 → 즉시 공고 등록 가능',
        '"반려" 클릭 → 반려 사유 입력(필수)',
    ])
    note(doc, '승인·반려 이력은 감사 로그에 기록됩니다.')

    h2(doc, '5.4 권한 매트릭스')
    shot(doc, '24_admin_permissions', '▲ 권한 매트릭스')
    body(doc, '역할(학생·졸업생·교사·기업·학교 관리자 등)별로 메뉴의 조회·작성·관리 권한을 설정합니다. '
              '설정한 권한은 화면 메뉴와 서버 API에 동시에 적용됩니다.')

    h2(doc, '5.5 채용공고 관리')
    shot(doc, '25_admin_jobs', '▲ 채용공고 관리')
    bullets(doc, ['공고 검색·상태 필터(진행중/마감/만료)', '공고 등록·수정·만료·삭제', '공고별 지원자 목록'])

    h2(doc, '5.6 게시판 관리')
    shot(doc, '26_admin_board', '▲ 게시판 관리')
    bullets(doc, ['최근 소식 등록·수정·삭제', '평생교육 프로그램 등록·수정·삭제'])

    h2(doc, '5.7 코드 관리 (학교 · 학과)')
    shot(doc, '27_admin_codes', '▲ 코드 관리')
    steps(doc, [
        '학교 추가: 학교 코드, 학교명, 지역, 주 담당자(학교 관리자) 지정',
        '학교 로고 업로드 — 해당 학교 사용자의 헤더와 대시보드에 표시 (없으면 JJOBB 기본 로고)',
        '학과(전공) 코드 관리',
    ])
    note(doc, '소속 회원이 있는 학교는 삭제 대신 비활성화를 권장합니다.', warn=True)

    h2(doc, '5.8 공지사항 관리 (취업 박람회 · 산업체 견학 · 자격증 지원)')
    shot(doc, '28_admin_announcements', '▲ 공지사항 관리')
    steps(doc, [
        '"새 공지사항 등록" → 유형 선택(취업박람회/산업체견학/자격증지원)',
        '제목, 주최, 일정, 지역(시/도 → 시/군/구)과 상세 장소, 마감일, 모집 인원, 혜택, 연락처 입력 → 저장',
        '학생 화면에 즉시 반영, 목록에서 수정·삭제',
    ])
    doc.add_page_break()

    # ── 부록 ──
    h1(doc, '부록')
    h2(doc, 'A. 모바일 사용')
    shot(doc, '29_mobile_jobs', '▲ 모바일 화면 (375px)', width=Inches(2.6))
    body(doc, '휴대폰에서는 오른쪽 위 메뉴 버튼(☰)으로 메뉴를 엽니다. Chrome, Safari, Edge를 지원합니다.')

    h2(doc, 'B. 개인정보와 데이터 보호')
    bullets(doc, [
        '모든 데이터는 학교별로 분리되어 다른 학교 사용자에게 보이지 않습니다',
        '브라우저에는 로그인 토큰만 저장하며, 이력서·개인정보는 서버에만 보관합니다',
        '공용 PC에서는 사용 후 반드시 로그아웃하세요',
        '워크넷(고용24) 공고 연동과 알림톡·문자 발송은 학교 계정 준비 후 제공 예정이며, 현재는 사이트 내 알림으로 안내합니다',
    ])

    h2(doc, 'C. 문제 해결')
    problems = [
        ('로그인이 안 될 때', ['이메일·비밀번호 확인 (Mac은 이메일 첫 글자 자동 대문자에 주의)',
                          '기업 회원은 승인 여부 확인', '관리자에게 계정 확인 요청']),
        ('화면이 예전 모습이거나 메뉴가 이상할 때', ['강력 새로고침: Windows Ctrl+Shift+R, Mac Cmd+Shift+R',
                                       '로그아웃 후 다시 로그인']),
        ('메뉴가 보이지 않을 때', ['회원 유형·권한에 따라 메뉴가 다르게 표시됩니다',
                           '필요한 권한은 학교 관리자에게 요청']),
        ('"이미 지원한 공고" / "이미 가입된 이메일"', ['같은 공고 중복 지원, 같은 이메일 중복 가입은 할 수 없습니다']),
    ]
    for title, items in problems:
        p = doc.add_paragraph()
        r = p.add_run(f'■ {title}')
        r.font.bold = True
        r.font.size = Pt(11)
        steps(doc, items)

    doc.add_paragraph()
    footer = doc.add_paragraph(f'JJOBB 전북 직업계고 졸업생 취업 네트워크  |  사용자 매뉴얼 {VERSION}  |  {DATE}')
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.runs[0].font.color.rgb = GRAY
    footer.runs[0].font.size = Pt(9)

    doc.save(OUTPUT_FILE)
    print(f'✅ DOCX 저장 완료: {OUTPUT_FILE}')


if __name__ == '__main__':
    build_manual()
