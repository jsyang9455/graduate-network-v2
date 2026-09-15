# Mobile navigation — 2026-09-15

Frontend fix for QA finding: at ≤768px top nav links were `display: none` with **no hamburger**.

## Approach

- Shared `js/nav.js` injects hamburger + panel (no per-page markup copy).
- **Header pages**: wrap `.nav-links` + auth/user menu in a right **drawer** (navy→leaf-green gradient).
- **Header + sidebar pages**: on mobile, move the real `.sidebar` DOM into the same drawer under “전체 메뉴” (no clones → RBAC `display:none` still applies).
- **Sidebar-only** (admin / community): sticky top bar with logo + hamburger; left off-canvas sidebar.
- A11y: `aria-label` / `aria-expanded`, Esc close, light focus cycle, backdrop click, body scroll lock, `inert` on closed mobile drawer only.

## Files

| File | Change |
|------|--------|
| `js/nav.js` | new shared mobile nav |
| `css/style.css` | toggle, drawer, backdrop, mobile-sidebar-bar |
| `css/dashboard.css` | sidebar off-canvas; hide in-flow sidebar when embedded |
| `*.html` (26 w/ `auth.js` + **`help.html`**) | `<script src="js/nav.js">` after auth; help also got shared header chrome |

## Browser verification (375×812, MCP)

| Page | Result |
|------|--------|
| `index.html` | Logo + hamburger; open/close; Esc; links + logout in drawer |
| `dashboard.html` | Top links + embedded sidebar (“전체 메뉴”) in one drawer |
| `community.html` | Mobile bar + left sidebar drawer |
| `login.html` | Hamburger present (session may show logout) |
| `help.html` | Shared header + logo; hamburger opens drawer; Esc closes; nav links present (2026-09-15 follow-up) |

Also checked open state computed `transform` / `getBoundingClientRect` at 375px.

## Remaining gaps

- Dev utilities without app chrome intentionally excluded: `setup-test-profile.html`, `check-storage.html`.
- Full form responsive polish still out of scope.
- Admin pages need staff session for full RBAC menu check in browser (company session redirects).
