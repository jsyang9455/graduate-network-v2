/**
 * 전주공업고등학교 졸업생 네트워크 - 자동 스크린샷 캡처
 * 실행: node scripts/capture-screenshots.js
 * 전제조건: 백엔드(5000), 프론트엔드(8080) 서버 실행 중
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const API_URL = 'http://localhost:5000/api';
const OUT_DIR = path.join(__dirname, '..', 'manual-screenshots');

// 계정 정보
const ACCOUNTS = {
  student: { email: 'jung.yuna@example.com', password: 'manual123' },
  teacher: { email: 'teacher.kim@example.com', password: 'manual123' },
  admin:   { email: 'admin@jeonjutech.edu',   password: 'manual123' },
};

// 캡처할 페이지 목록
const PAGES = [
  // ─── 공개 페이지 ─────────────────────────────
  { id: '01_main',     url: '/index.html',    auth: null,      title: '메인 페이지' },
  { id: '02_login',    url: '/login.html',    auth: null,      title: '로그인' },
  { id: '03_register', url: '/register.html', auth: null,      title: '회원가입' },

  // ─── 학생 페이지 ─────────────────────────────
  { id: '04_student_dashboard',     url: '/dashboard.html',              auth: 'student', title: '학생 대시보드' },
  { id: '05_student_jobs',          url: '/jobs.html',                   auth: 'student', title: '채용 정보' },
  { id: '06_student_jobfair',       url: '/job-fair.html',               auth: 'student', title: '취업박람회' },
  { id: '07_student_industryvisit', url: '/industry-visit.html',         auth: 'student', title: '산업체 견학' },
  { id: '08_student_certification', url: '/certification-support.html',  auth: 'student', title: '자격증 지원' },
  { id: '09_student_counseling',    url: '/counseling.html',             auth: 'student', title: '진로 상담' },
  { id: '10_student_networking',    url: '/networking.html',             auth: 'student', title: 'JOB밴드' },
  { id: '11_student_profile',       url: '/profile.html',                auth: 'student', title: '내 프로필' },
  { id: '12_student_career',        url: '/career.html',                 auth: 'student', title: '경력 관리' },

  // ─── 교사 페이지 ─────────────────────────────
  { id: '13_teacher_dashboard',     url: '/dashboard.html',              auth: 'teacher', title: '교사 대시보드' },
  { id: '14_teacher_counseling',    url: '/counseling.html',             auth: 'teacher', title: '진로 상담 관리' },

  // ─── 관리자 페이지 ────────────────────────────
  { id: '15_admin_dashboard',       url: '/dashboard.html',              auth: 'admin',   title: '관리자 대시보드' },
  { id: '16_admin_users',           url: '/admin-users.html',            auth: 'admin',   title: '회원 관리' },
  { id: '17_admin_jobs',            url: '/admin-jobs.html',             auth: 'admin',   title: '채용공고 관리' },
  { id: '18_admin_board',           url: '/admin-board.html',            auth: 'admin',   title: '게시판 관리' },
  { id: '19_admin_announcements',   url: '/admin-announcements.html',    auth: 'admin',   title: '공지사항 관리' },
  { id: '20_admin_codes',           url: '/admin-codes.html',            auth: 'admin',   title: '코드 관리' },
];

// 로그인 → JWT 토큰 + 유저 정보 반환
async function loginAPI(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`로그인 실패: ${JSON.stringify(data)}`);
  return { token: data.token, user: data.user };
}

// localStorage에 인증 정보 주입
async function injectAuth(page, session) {
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('graduateNetwork_user', JSON.stringify(user));
  }, session);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('🚀 Chrome 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ko-KR'],
    defaultViewport: { width: 1440, height: 900 },
  });

  // 세션 캐시 (계정 유형별로 한 번만 로그인)
  const sessions = {};
  for (const [type, cred] of Object.entries(ACCOUNTS)) {
    try {
      console.log(`🔑 ${type} 로그인 중...`);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cred),
      });
      const data = await res.json();
      if (data.token) {
        sessions[type] = { token: data.token, user: data.user };
        console.log(`   ✅ ${type} 로그인 성공 (${data.user.name})`);
      } else {
        console.log(`   ❌ ${type} 로그인 실패:`, data);
      }
    } catch (e) {
      console.log(`   ❌ ${type} 로그인 오류:`, e.message);
    }
  }

  const results = [];

  for (const pg of PAGES) {
    const page = await browser.newPage();
    try {
      console.log(`📸 [${pg.id}] ${pg.title} 캡처 중...`);

      // 인증이 필요한 경우: 임시 URL로 이동해서 localStorage 주입 후 실제 URL로
      if (pg.auth && sessions[pg.auth]) {
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await injectAuth(page, sessions[pg.auth]);
      }

      await page.goto(`${BASE_URL}${pg.url}`, { waitUntil: 'networkidle2', timeout: 20000 });

      // 로그인 페이지로 리다이렉트 된 경우 재주입
      const currentUrl = page.url();
      if (pg.auth && currentUrl.includes('login.html')) {
        await injectAuth(page, sessions[pg.auth]);
        await page.goto(`${BASE_URL}${pg.url}`, { waitUntil: 'networkidle2', timeout: 20000 });
      }

      // 추가 렌더링 대기 (API 데이터 로딩)
      await new Promise(r => setTimeout(r, 2000));

      // 로딩 스피너 숨기기
      await page.evaluate(() => {
        document.querySelectorAll('.loading, .spinner, [class*="loading"], [class*="spinner"]')
          .forEach(el => el.style.display = 'none');
      });

      const outFile = path.join(OUT_DIR, `${pg.id}.png`);
      await page.screenshot({ path: outFile, fullPage: false });
      console.log(`   ✅ 저장: ${pg.id}.png`);
      results.push({ id: pg.id, title: pg.title, auth: pg.auth, file: outFile, success: true });

    } catch (err) {
      console.log(`   ❌ 오류: ${err.message}`);
      results.push({ id: pg.id, title: pg.title, auth: pg.auth, file: null, success: false, error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // 결과 요약
  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  console.log(`\n✅ 완료: ${ok}개 성공, ${fail}개 실패`);
  if (fail > 0) {
    results.filter(r => !r.success).forEach(r => console.log(`  ❌ ${r.id}: ${r.error}`));
  }

  // 결과 JSON 저장 (DOCX 생성 스크립트가 참조용)
  fs.writeFileSync(path.join(OUT_DIR, 'screenshot-list.json'), JSON.stringify(results, null, 2));
  console.log('\n📄 screenshot-list.json 저장 완료');
  console.log(`📁 스크린샷 폴더: ${OUT_DIR}`);
}

main().catch(console.error);
