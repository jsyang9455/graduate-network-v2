# UI / CSS review — 2026-09-15

Frontend QA + fix pass. Static serve `http://127.0.0.1:8080`. Browser MCP screenshots + CDP computed styles.

## Pages reviewed

| Page | Notes |
|------|--------|
| `index.html` | Hero/banner/logo OK; mobile 375px nav hides links; contrast OK (CDP) |
| `login.html` / `register.html` | auth.css OK; company radio fields present |
| `dashboard.html` | Welcome banner + company sections load |
| `company-profile.html` | **Was broken** — missing form CSS |
| `job-create.html` | Approval gate banner + disabled form |
| `admin-users.html` | Markup/CSS (redirects for non-admin in session) |
| `education-programs.html` | Favicon path + heading token |
| `community.html`, `jobs.html`, `career.html`, `counseling.html`, `networking.html`, `profile.html`, `help.html` | stylesheet links present; shared chrome OK |

## Issues found

1. **`company-profile.html` only loaded `style.css`** — form used `auth-form` / `.form-group` without `auth.css`; `.profile-container` without `dashboard.css` → browser-default tiny inputs, no padding, misaligned labels.
2. **Missing shared `.content-header` CSS** — used on admin-* / community but undefined.
3. **Admin user tabs used hard-coded blue (`#3b82f6`) inline styles** — conflicted with navy/leaf-green tokens; no reusable tab classes.
4. **Approval banners** duplicated as inline styles in `company-profile.js` / `jobs.js` / `dashboard.js`.
5. **No `.btn:disabled` styles** — gated CTA looked active.
6. **`job-create` disabled fields** not visually muted.
7. **`education-programs.html`** heading used `#1e3a8a` (off-token); favicon pointed at root `favicon.svg` while other pages use `images/favicon.png`.

## Fixes applied

- Link `auth.css` + `dashboard.css` on company-profile; tighten `.profile-container` padding / company form card.
- Shared `.status-banner*` in `css/style.css`; wired in company-profile / jobs / dashboard JS.
- `.content-header`, `.admin-tabs`, `.admin-filter-bar`, scrollable `.users-table` in `dashboard.css`.
- `admin-users.html` + `switchUserTab` use `.admin-tab.active` (primary green) instead of blue inline.
- `.btn:disabled` + job-form disabled field styles.
- education-programs favicon + CSS variables for title.

## Remaining known issues

- Mobile header: top nav links hidden at ≤768px (no hamburger yet) — pre-existing.
- Many admin/community filter controls still use one-off inline styles (tables load OK with new overflow).
- Logged-in session as company user cannot open `admin-users` in browser (expected RBAC redirect); admin tab CSS verified via markup + class rules.
- Dev-only pages (`setup-test-profile.html`, `check-storage.html`) keep standalone styles — out of product chrome.
