/**
 * JJOBB 전북 직업계고 졸업생 취업 네트워크 — 매뉴얼용 자동 스크린샷 캡처
 * 실행: node scripts/capture-screenshots.js
 * 전제조건: 백엔드 API, 프론트엔드(8080) 실행 중 + DX 테스트 계정(@jjob.com) 적재
 *   API_URL=http://localhost:5050/api  (기본 5050; macOS AirPlay가 5000 점유)
 *   CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 * 인증: localStorage에는 JWT(token)만 주입한다 (REQ-PLT-001).
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const API_URL = process.env.API_URL || 'http://localhost:5050/api';
const CHROME_PATH = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(__dirname, '..', 'manual-screenshots');
const PASSWORD = process.env.MANUAL_PASSWORD || 'password123';

const ACCOUNTS = {
  student: 'student@jjob.com',
  teacher: 'teacher@jjob.com',
  company: 'company@jjob.com',
  admin: 'admin@jjob.com',
};

async function clickByText(page, selector, text) {
  await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
    if (el) el.click();
  }, selector, text);
  await new Promise((r) => setTimeout(r, 1200));
}

const PAGES = [
  // 공개
  { id: '01_main', url: '/index.html', auth: null, title: '메인 페이지' },
  { id: '02_login', url: '/login.html', auth: null, title: '로그인' },
  { id: '03_register', url: '/register.html', auth: null, title: '회원가입' },

  // 학생·졸업생
  { id: '04_student_dashboard', url: '/dashboard.html', auth: 'student', title: '학생 대시보드' },
  { id: '05_student_jobs', url: '/jobs.html', auth: 'student', title: '채용 정보' },
  {
    id: '06_student_job_detail', url: '/jobs.html', auth: 'student', title: '채용 공고 상세',
    action: (page) => page.evaluate(() => document.querySelector('.job-card-link')?.click())
      .then(() => new Promise((r) => setTimeout(r, 1200))),
  },
  { id: '07_student_career', url: '/career.html', auth: 'student', title: '이력서·경력 관리' },
  { id: '08_student_profile', url: '/profile.html', auth: 'student', title: '내 프로필' },
  { id: '09_student_counseling', url: '/counseling.html', auth: 'student', title: '진로 상담' },
  { id: '10_student_networking', url: '/networking.html', auth: 'student', title: 'JJOBB 밴드' },
  { id: '11_student_community', url: '/community.html', auth: 'student', title: '커뮤니티' },
  { id: '12_student_jobfair', url: '/job-fair.html', auth: 'student', title: '취업 박람회' },
  { id: '13_student_industryvisit', url: '/industry-visit.html', auth: 'student', title: '산업체 견학' },
  { id: '14_student_certification', url: '/certification-support.html', auth: 'student', title: '자격증 지원' },

  // 교사
  { id: '15_teacher_dashboard', url: '/dashboard.html', auth: 'teacher', title: '교사 대시보드' },
  { id: '16_teacher_counseling', url: '/counseling.html', auth: 'teacher', title: '진로 상담 관리' },
  { id: '17_teacher_journal', url: '/counseling-journal.html', auth: 'teacher', title: '상담일지' },

  // 기업
  { id: '18_company_dashboard', url: '/dashboard.html', auth: 'company', title: '기업 대시보드' },
  { id: '19_company_job_create', url: '/job-create.html', auth: 'company', title: '채용 공고 등록' },
  { id: '20_company_profile', url: '/company-profile.html', auth: 'company', title: '기업 정보' },

  // 관리자
  { id: '21_admin_dashboard', url: '/dashboard.html', auth: 'admin', title: '관리자 대시보드' },
  { id: '22_admin_users', url: '/admin-users.html', auth: 'admin', title: '회원 관리' },
  {
    id: '23_admin_company_approval', url: '/admin-users.html', auth: 'admin', title: '기업 승인',
    action: (page) => clickByText(page, '#userTabs button, .admin-tabs button', '기업 승인'),
  },
  { id: '24_admin_permissions', url: '/admin-permissions.html', auth: 'admin', title: '권한 매트릭스' },
  { id: '25_admin_jobs', url: '/admin-jobs.html', auth: 'admin', title: '채용공고 관리' },
  { id: '26_admin_board', url: '/admin-board.html', auth: 'admin', title: '게시판 관리' },
  { id: '27_admin_codes', url: '/admin-codes.html', auth: 'admin', title: '코드 관리' },
  { id: '28_admin_announcements', url: '/admin-announcements.html', auth: 'admin', title: '공지사항 관리' },

  // 모바일
  { id: '29_mobile_jobs', url: '/jobs.html', auth: 'student', title: '모바일 채용 정보 (375px)', mobile: true },
];

async function login(email) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`로그인 실패 ${email}: ${JSON.stringify(data)}`);
  return { token: data.token, name: data.user && data.user.name };
}

async function prepareStorage(page, token) {
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((apiBase, tok) => {
    localStorage.clear();
    localStorage.setItem('jjobb_api_base', apiBase);
    if (tok) localStorage.setItem('token', tok);
  }, API_URL, token || null);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ko-KR'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const sessions = {};
  for (const [type, email] of Object.entries(ACCOUNTS)) {
    try {
      sessions[type] = await login(email);
      console.log(`✅ ${type} 로그인 (${sessions[type].name})`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }

  const results = [];
  for (const pg of PAGES) {
    const page = await browser.newPage();
    try {
      if (pg.mobile) {
        await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      }
      const session = pg.auth ? sessions[pg.auth] : null;
      if (pg.auth && !session) throw new Error(`${pg.auth} 세션 없음`);
      await prepareStorage(page, session && session.token);
      await page.goto(`${BASE_URL}${pg.url}`, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise((r) => setTimeout(r, 2000));
      if (pg.action) await pg.action(page);

      const outFile = path.join(OUT_DIR, `${pg.id}.png`);
      await page.screenshot({ path: outFile, fullPage: false });
      console.log(`📸 ${pg.id} ${pg.title}`);
      results.push({ id: pg.id, title: pg.title, auth: pg.auth, file: `${pg.id}.png`, success: true });
    } catch (err) {
      console.log(`❌ ${pg.id}: ${err.message}`);
      results.push({ id: pg.id, title: pg.title, auth: pg.auth, file: null, success: false, error: err.message });
    } finally {
      await page.close();
    }
  }
  await browser.close();

  const ok = results.filter((r) => r.success).length;
  console.log(`\n완료: ${ok}/${results.length}`);
  fs.writeFileSync(path.join(OUT_DIR, 'screenshot-list.json'), JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
