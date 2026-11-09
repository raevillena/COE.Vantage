# COE Vantage - project guide

Faculty-load scheduling for the MMSU College of Engineering (several colleges can exist). Product context: `PRODUCT.md`.

## Start of a session (saves tokens: do not reread the repo)
1. Read `docs/HANDOFF.md` - current state, open items, the next step. That is usually enough to continue.
2. For one area, open only its notes: `dev.md` is an index, the notes live in `docs/dev/*.md`. Never read all of them.
3. Prefer `grep` and line ranges over reading whole files. Big ones: `ExperimentalGradesPage.tsx` (2,700 lines), `SchedulerPage.tsx` (2,260), `tests/e2e/smoke.spec.ts` (2,860; grades tests are in `grades.spec.ts`).
4. At the end of a session, refresh `docs/HANDOFF.md` (skill `end-session-handoff`).

## Stack and layout
- `frontend/`: React 19, Vite 7, Tailwind CSS v4, Redux Toolkit, react-router 7, Radix UI, lucide-react. API calls go through `src/api/apiClient`.
- `backend/`: Express 4, Prisma 5 + PostgreSQL, Redis, JWT, zod. Each area is `src/modules/<area>/{routes,controller,service,schemas}`.
- `k8s/`: manifests (prisma migrate job runs migrations in production). Roles: ADMIN, DEAN, CHAIRMAN, FACULTY, OFFICER, COLLEGE_SECRETARY, PRESIDENT, UNIT.

## Run and test (servers are normally already running)
- Backend `:4000` (no `/api` prefix): `cd backend && npm run dev` (tsx watch). Frontend `:5173`: `cd frontend && npm run dev`.
- Type-check both after edits: `npx tsc --noEmit` in `backend/` and in `frontend/`.
- Migrations: `npx prisma migrate deploy`. `npx prisma generate` fails on Windows while the backend runs - stop it first.
- E2E (needs the stack, seeded DB): `cd frontend && npx playwright test tests/e2e/grades.spec.ts` or `smoke.spec.ts -g "name"`. `mmsuPush.spec.ts` needs no stack. Shared helpers: `tests/e2e/support.ts` (seed accounts such as `admin@coe.vantage`, `chairman@coe.vantage`; password is in that file).
- Playwright wipes `tests/e2e/.results/` at the start of every run, so look at screenshots right after a run.

## Conventions that have bitten before
- **Colors:** tokens live in `frontend/src/style.css`: use `bg-surface`, `bg-surface-muted`, `text-foreground(-muted)`, `border-border`. There is **no** `bg-background` (it generates no CSS). Tailwind only sees class names written out in full: never build `from-${x}` at runtime.
- **Sticky table cells:** every `position: sticky` cell costs a compositor layer per row. Keep few frozen columns (open item in HANDOFF).
- **Dialogs:** `components/ui/dialog` `description` is plain text, not markdown. Menus: `components/ui/dropdownMenu`.
- **Experimental features** are per user and off by default (skill `add-experimental-feature`).
- **Windows + Git Bash:** heredocs containing quotes break. Write files with the Write tool or a script file, not inline heredocs. Use forward slashes in paths.

## Rules
- **Never commit or push unless asked.** Say plainly that changes are uncommitted.
- Changelog / version bumps only when asked to package a release (skill `package-release`).
- Tests that create data use made-up students and a `QA ` name prefix and delete everything in `finally`; check for leftovers afterwards. The College of Engineering id is named explicitly in tests (`00000000-0000-0000-0000-0000000000a2`).
- **Never leave real student data around**: delete downloaded sheets and screenshots that show real names. `portal_*.txt` in the repo root are git-ignored for this reason.
- The public grade lookup is rate limited (80 requests / 15 min / IP, counted in backend memory). Do not loop over it; restarting the backend clears the counter.
- Reports to the user: short, and honest about what was and was not tested.

## Skills in `.claude/skills/`
`add-experimental-feature`, `rebuild-mmsu-extension`, `run-e2e-safely`, `package-release`, `end-session-handoff` (plus the third-party `impeccable` design skill).
