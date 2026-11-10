---
name: add-experimental-feature
description: Use when adding a new per-user experimental feature/page to COE Vantage (off by default, enabled on the Profile page). Lists every file that must be touched and the test pattern. Not for ordinary pages.
---

# Add an experimental feature

An experimental feature has a key (for example `mmsuGradePush`). A user sees it only if they turned on experimental features **and** ticked that key on the Profile page, and their role is allowed. The sidebar section and the Profile checkbox list are generated from the catalog, so they need no edits.

## Touch these places (in this order)
1. `backend/src/modules/auth/experimentalFeatures.ts` - add the key to `EXPERIMENTAL_FEATURE_KEYS`.
2. `backend/src/modules/auth/authSchemas.ts` - add it to `experimentalFeatureKeyEnum` (`z.enum([...])`).
3. `frontend/src/types/auth.ts` - add it to the `ExperimentalFeatureKey` union.
4. `frontend/src/features/experimental/featureCatalog.ts` - a catalog entry: `key, label, description, routePath, sidebarLabel, allowedRoles`.
5. `frontend/src/pages/experimental/<Name>Page.tsx` - the page.
6. `frontend/src/App.tsx` - a `<Route path="experimental/..."` wrapped in `ProtectedRoute allowedRoles={[...]}` then `ExperimentalRoute featureKey="<key>"` (copy the existing ones).
7. `frontend/src/utils/routeTitles.ts` - the page title for the route.
8. Notes: a short section in the matching `docs/dev/*.md` (and a row in `dev.md` if it is a new file).

No database migration is needed: preferences are a JSON column on the user.

## Test (copy `grades.spec.ts` › "Portal Insert Grade module")
- Read the user's current preferences with `GET /auth/me/experimental-features`, then `PATCH` them (`{ enabled, features }`) through the API.
- Off: the sidebar link is absent and the typed URL redirects to `/profile`. On: the link shows and the page opens.
- **Always restore the original preferences in `finally`.**

## Check
`npx tsc --noEmit` in `backend/` and `frontend/`, then run the new test.
