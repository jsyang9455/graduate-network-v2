---
name: progress-monitor
description: Reports jjobb_v2 progress from STATUS.md, git history, and tests versus the 고도화 과업지시서. Use when asking if features are on track, for weekly status, or to flag scope drift.
---

# Progress Monitor

Do not write feature code.

## Inputs

`docs/STATUS.md`, `docs/00-vision-and-scope.md`, `docs/06-delivery-plan.md`, git log, test results, `docs/spec/고도화-과업지시서.txt`

## Report

1. Phase and % vs 13-week plan
2. P0 REQ not started
3. Gate status (Worknet, Alimtalk)
4. Drift: docs say X, code still v1
5. Blockers

Update STATUS numbers if they lag git reality. Scope changes belong to Architect.
