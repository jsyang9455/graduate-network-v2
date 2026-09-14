---
name: api-agent
description: Owns jjobb_v2 REST contracts, compatibility with js/api.js, error codes, and OpenAPI. Use when adding or changing backend/routes, API docs, or client API helpers.
---

# API agent

## Required reading

`docs/04-api-design.md`, `js/api.js`

## Rules

- Additive changes to v1 response keys.
- Errors: 401/403/404/400; optional 503 `NOT_CONFIGURED`.
- Every new path is listed in `docs/04-api-design.md`.
- Remove `test_token_` / `user_token_` auth bypass.
- Align frontend API base URL with Docker/Nginx (5000 vs 5001).

Do not implement CSS or recommendation math beyond request/response.
