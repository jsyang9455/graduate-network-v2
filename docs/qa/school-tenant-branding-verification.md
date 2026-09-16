# School tenant branding — verification (2026-09-16)

REQ: REQ-IAM-001/003/008/009, REQ-PLT-002/004  
Work order: [school-tenant-branding-work-order.md](school-tenant-branding-work-order.md)

## Automated tests

`node --test tests/school-tenant-branding.test.js` → **5/5 pass**

| TC | Result |
|----|--------|
| TC-01 POST /schools without primary_admin | 400 VALIDATION |
| TC-02/03 create + primary_admin; dup email 409; login me.school | pass |
| TC-04 logo upload + GET /schools/:id/logo | pass |
| TC-05 student me.school = 전주공업고등학교 | pass |
| TC-06/07 school_admin write only; system_admin manage | pass |

## Curl UAT (@ `:5050`)

| Check | Result |
|-------|--------|
| student/teacher/graduate `GET /auth/me` → `user.school.name` | 전주공업고등학교 |
| graduate `logo_url` when logo_file_id set | `/api/schools/1/logo` |
| POST /schools name only | 400 VALIDATION |
| system_admin permissions schools includes manage | true |

## Browser

- Cursor browser MCP could not reach `localhost:8765` (chrome-error). UI DoD covered by:
  - `js/auth.js` rbac-pending (admin section not shown until permissions)
  - `dashboard.html` `data-menu-min`, `#brandLogo`, `#schoolContextLabel`
  - `admin-codes.html` primary admin + logo fields
  - `js/school-brand.js` applies `user.school` to header/welcome

## Gaps (non-blocking)

- Puppeteer/Chrome E2E for flicker visual still optional
- Legacy schools may have `primary_admin_user_id` NULL (new creates only require it)
