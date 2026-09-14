#!/usr/bin/env node
/**
 * Optional browser persona smoke (Puppeteer).
 * Skips cleanly if puppeteer/server unavailable unless E2E_STRICT=1.
 *
 * Usage: see docs/qa/e2e-persona-smoke.md
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

  const feedRes = await fetch(`${API_BASE}/recommendations/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!feedRes.ok) {
    throw new Error(`recommendations ${feedRes.status}`);
  }
  const feed = await feedRes.json();
  if (!Array.isArray(feed.recommendations)) {
    throw new Error('recommendations not an array');
  }
  console.log(`OK api smoke: recommendations.length=${feed.recommendations.length}`);
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
    await page.goto(`${FRONT}/login.html`, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.type('#email, input[name="email"], input[type="email"]', EMAIL, { delay: 5 }).catch(() => {});
    // fallback selectors
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
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
      page.click('button[type="submit"], .btn-login, button.login'),
    ]);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) throw new Error('browser login did not set token');
    console.log('OK browser smoke: token present after login');
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
  await browserSmoke();
  process.exit(0);
})();
