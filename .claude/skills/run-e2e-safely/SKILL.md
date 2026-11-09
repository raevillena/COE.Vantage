---
name: run-e2e-safely
description: Use before running or writing Playwright e2e tests, probes or screenshot scripts against the local COE Vantage stack. Covers servers, test-data hygiene (QA prefix, cleanup), the public lookup rate limit, and Windows gotchas.
---

# Run e2e tests and probes safely

## Before running
- The stack must be up: backend `:4000`, frontend `:5173`, seeded database (`curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/auth/login -X POST -H "Content-Type: application/json" -d "{}"` should answer, not refuse). `tests/e2e/mmsuPush.spec.ts` needs neither.
- Run one file or one test, not the whole suite: `npx playwright test tests/e2e/grades.spec.ts` or `smoke.spec.ts -g "name"`. Playwright wipes `tests/e2e/.results/` at the start of every run, so view screenshots straight after.

## Test data hygiene
- Create only what the test needs, with made-up students and a `QA ` name prefix. Delete it in `finally` (including when the test fails).
- Tests that change a user's experimental preferences must read them first and restore them in `finally`.
- Name the College of Engineering explicitly when a call needs a college: `COE = "00000000-0000-0000-0000-0000000000a2"`.
- After a run, check nothing is left: list `/grade-subjects` (or the relevant list) with an admin token and look for `QA` names.
- **Never copy the user's real student data into the repo or temp files.** If a probe has to look at a real subject or a downloaded sheet, print counts only, and delete the copy and any screenshots afterwards.
- Throwaway probe specs: name them `_something.spec.ts`, delete them when done, and `ls tests/e2e | grep "^_"` before finishing.

## Gotchas
- The public grade lookup allows 80 requests per 15 minutes per IP, counted in backend memory. Never loop over it; a 429 locks the user's own page too. Restarting the backend clears it.
- Waiting: poll for the state you need (`expect.poll`, `toBeVisible`) instead of acting right after navigation; several flakes here were "clicked before it was sized".
- A new tab opened by an extension starts navigating before Playwright can intercept it (it can reach the real internet). Stub the call instead.
- Windows: stop the backend before `npx prisma generate`. Heredocs containing quotes break in Git Bash: use the Write tool or a script file. A Python `/tmp` path is not Git Bash's `/tmp` (use `cygpath -w`).
- Long operations: give commands a `timeout`, and give Playwright actions a short default timeout (`page.setDefaultTimeout(10_000)`) so a hang fails fast instead of eating the test timeout and skipping cleanup.
