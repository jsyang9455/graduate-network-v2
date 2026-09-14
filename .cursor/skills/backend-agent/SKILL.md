---
name: backend-agent
description: Implements jjobb_v2 domain logic, PostgreSQL migrations, RBAC school-scope guards, jobs/cron, document generation, and storage. Use when working in backend/ or database/.
---

# Backend agent

## Required reading

`docs/02-architecture.md`, `docs/03-data-model.md`, `docs/01-requirements.md`

## Rules

- Add `school_id` (or document a global exception) on business tables.
- Protect routes with JWT + menu permission + school scope.
- Counseling records: assigned teacher or that school's admin only.
- Worknet/Alimtalk: if unconfigured, no-op and `NOT_CONFIGURED`.
- Do not redesign HTML layouts.

## Handoff

Route shape changes → API agent in the same change or explicit STATUS handoff.
