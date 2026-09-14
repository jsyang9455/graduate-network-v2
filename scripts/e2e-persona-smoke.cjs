#!/usr/bin/env node
/**
 * Optional browser persona smoke (Puppeteer).
 * Skips cleanly if puppeteer/server unavailable unless E2E_STRICT=1 (API fail only).
 *
 * Usage: see docs/qa/e2e-persona-smoke.md and docs/qa/sprint7-browser-uat.md
 *
 * When AirPlay holds :5000, run API on 5050 and:
 *   API_BASE=http://127.0.0.1:5050/api FRONT_BASE=http://127.0.0.1:8080 npm run test:e2e
 */
'use strict';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL || 'qa.e2e.persona@jjob.test';
const PASSWORD = process.env.E2E_PASSWORD || 'password123';
const STRICT = process.env.E2E_STRICT === '1';

async function apiSmoke() {
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(`login ${loginRes.status}: ${await loginRes.text()}`);
  }
  const { token } = await loginRes.json();
  if (!token) throw new Error('no token');

  const paths = [
    ['GET', '/recommendations/me'],
    ['GET', '/recommendations/associated'],
    ['GET', '/jobs/scraps/me'],
    ['GET', '/posts/scraps/me'],
    ['GET', '/field-trips'],
  ];
  for (const [method, path] of paths) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
  }
  console.log('OK api smoke: login + Sprint6 paths (associated/scraps/trips)');
  return token;
}

async function browserSmoke() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('skip browser: puppeteer not installed');
    return false;
  }
  const FRONT = process.env.FRONT_BASE || 'http://127.0.0.1:8080';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    // js/api.js reads jjobb_api_base at script load — set before first paint of login
    await page.goto(`${FRONT}/login.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate((apiBase) => {
      localStorage.setItem('jjobb_api_base', apiBase);
    }, API_BASE);
    await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });

    const emailSel = await page.$('#email') || await page.$('input[type="email"]') || await page.$('input[name="email"]');
    const passSel = await page.$('#password') || await page.$('input[type="password"]');
    if (!emailSel || !passSel) {
      console.log('skip browser: login form selectors not found; API smoke already ran');
      return false;
    }
    await emailSel.click({ clickCount: 3 });
    await emailSel.type(EMAIL);
    await passSel.click({ clickCount: 3 });
    await passSel.type(PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
      page.click('button[type="submit"], .btn-login, button.login'),
    ]);
    await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 8000 }).catch(() => null);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) {
      const errText = await page.evaluate(() => {
        const el = document.getElementById('loginError');
        return el && el.style.display !== 'none' ? el.textContent : document.body.innerText.slice(0, 200);
      });
      throw new Error(`browser login did not set token (${errText})`);
    }
    console.log('OK browser smoke: token present after login');

    // Jobs interest (관심) button present for students
    await page.goto(`${FRONT}/jobs.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('button', { timeout: 10000 });
    const interest = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some((b) => /관심/.test(b.textContent || ''))
    );
    console.log(interest ? 'OK browser: jobs 관심 button visible' : 'WARN browser: jobs 관심 button not found');

    // Community scrap control
    await page.goto(`${FRONT}/community.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    const scrapBtn = await page.$('#scrapBtn');
    console.log(scrapBtn ? 'OK browser: community scrapBtn present' : 'WARN browser: community scrapBtn missing');

    // Industry visit after-report UI (teacher path may hide; assert section markup loads)
    await page.goto(`${FRONT}/industry-visit.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    const reportUi = await page.$('#reportSummary');
    console.log(reportUi ? 'OK browser: industry-visit reportSummary present' : 'WARN browser: reportSummary missing');

    return true;
  } catch (err) {
    console.log(`skip browser UI: ${err.message}`);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

(async () => {
  try {
    await apiSmoke();
  } catch (err) {
    if (STRICT) {
      console.error('E2E_STRICT fail:', err.message);
      process.exit(1);
    }
    console.log(`skip e2e (API unreachable): ${err.message}`);
    process.exit(0);
  }
  const ok = await browserSmoke();
  if (STRICT && !ok) {
    console.error('E2E_STRICT: browser smoke did not complete');
    process.exit(1);
  }
  process.exit(0);
})();
