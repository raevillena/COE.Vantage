---
name: package-release
description: Use ONLY when the user asks to package, version or release COE Vantage (for example "update for v0.7.6"). Lists every version, changelog and manifest file to keep in sync. Do not run it on ordinary feature work.
---

# Package a release

Only when asked. Changelog and version files are deliberately NOT updated during normal work.

## Decide the content first
- Summarise what changed since the last version commit: `git log --oneline`, `git diff --stat <last version commit>`, and `docs/HANDOFF.md` "Built since".
- One entry: a title, the date, and a short list of user-visible items. Do not mention internal or admin-only pages that users cannot reach unless they asked.

## Files to keep in sync (previous releases touched all of these)
- `frontend/src/data/changelog.ts` - the in-app "What's new" entry (shown on the login page).
- `CHANGELOG.md` - the same entry.
- `README.md` - the version row/table.
- `frontend/.env.production` - `VITE_APP_VERSION`.
- `frontend/package.json` and `frontend/package-lock.json` - `version` (two places in the lock file).
- `k8s/backend.yaml`, `k8s/frontend.yaml`, `k8s/prisma-migrate-job.yaml`, `k8s/prisma-seed-job.yaml` - image tags.
- `todo.txt` - mark done items with the version.
- `docs/dev/features-v06-v075.md` (or the newest feature file) - a numbered section for the release, and `dev.md` index if a file was added.
- `frontend/tests/e2e/smoke.spec.ts` - the "shows the release notes" test asserts the newest version heading; update it.

Find them all: `grep -rn "<old version>" --include=*.ts --include=*.tsx --include=*.json --include=*.yaml --include=*.md --include=.env.production . --exclude-dir=node_modules`.

## Also check
- New migrations exist and the k8s migrate job will run them. If `frontend/extensions/` changed, run the `rebuild-mmsu-extension` skill so the committed zip matches.
- `npx tsc --noEmit` in `backend/` and `frontend/`, and the release-notes test.
- Do not commit or push unless asked.
