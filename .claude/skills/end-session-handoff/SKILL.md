---
name: end-session-handoff
description: Use at the end of a work session, before the context gets long, or when the user says they are done or switching topics. Refreshes docs/HANDOFF.md and the memory notes so the next session continues without rereading the repo.
---

# End-of-session hand-off

Goal: the next session reads `CLAUDE.md` + `docs/HANDOFF.md` (about 100 lines in total) and can continue. Spend a few minutes here to save a lot of tokens later.

## 1. Refresh `docs/HANDOFF.md` (keep it under about 70 lines)
- **Where things stand**: branch, last commit, what is uncommitted (`git status --short | wc -l`), which servers are running and who started them.
- **Built since the last release**: one bullet per feature with a pointer to its `docs/dev/` file. Delete bullets that were committed or released.
- **Before a release**: migrations to apply, zips to rebuild, version files not yet updated.
- **Open items**, most useful first, each with the next concrete step and where to look. Delete what is done. Do not keep history or narrative; keep decisions and the reason.
- **This machine's state**: anything changed outside the repo (preferences, DB rows, background processes, real data copies).
- **Gotchas** learned this session that would cost time again.
- Update the "Last refreshed" date.

## 2. Put new knowledge where it will be found
- Behaviour or design decisions for an area: the matching `docs/dev/*.md` file (and the `dev.md` index row if new).
- Project rules or conventions that apply to every session: `CLAUDE.md` (keep it short; it is loaded every time).
- The user's preferences or reminders: the memory directory (one small note each, plus a one-line entry in `MEMORY.md`). Check for an existing note to update first. Do not store anything the repo already records.

## 3. Verify before saying "done"
- `npx tsc --noEmit` in `backend/` and `frontend/`; the tests for what changed.
- No leftovers: `ls frontend/tests/e2e | grep "^_"`, no `QA` data in the app, no real student data in temp files or screenshots.

## 4. Tell the user
A short summary: what is done, what is open, that nothing is committed (if so), and that `docs/HANDOFF.md` is current.
