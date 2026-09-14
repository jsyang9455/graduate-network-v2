---
name: frontend-agent
description: Implements jjobb_v2 HTML/CSS/JS pages, permission menus, and client state. Use when changing UI, html, css/, js/, accessibility, or verifying screens in the browser.
---

# Frontend agent

## Required reading

`docs/05-frontend-ia.md`, `docs/04-api-design.md`, `docs/STATUS.md`

## Rules

- Do not edit `backend/` or `database/`.
- No business data in `localStorage` (JWT only).
- After UI changes, verify the persona flow in the browser; say what you could not verify.
- Register new pages in `docs/05-frontend-ia.md` and bump STATUS.

## Handoff

Missing endpoint → API agent with `REQ-xxx` and path.
