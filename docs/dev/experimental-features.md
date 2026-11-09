<!-- Moved unchanged from dev.md (lines 103-144). Index: dev.md -->

## Experimental Features Framework Notes

### Context

This section tracks the initial experimental feature system so future chats can add more experiments without reworking auth/profile/sidebar logic.

### What was added

- **Per-user experimental preferences (backend):**
  - `User.experimentalFeatures` JSON field in Prisma and SQL migration.
  - Authenticated endpoints:
    - `GET /auth/me/experimental-features`
    - `PATCH /auth/me/experimental-features`
  - Login payload now includes normalized `user.experimentalFeatures`.

- **Shared experimental model (frontend):**
  - `ExperimentalFeaturesPreference` and `ExperimentalFeatureKey` in auth types.
  - Central feature registry at `frontend/src/features/experimental/featureCatalog.ts`.
  - First registered feature key: `gradeModule`.

- **Profile controls:**
  - `UserProfilePage` now has:
    - Global toggle: enable/disable experimental features.
    - Per-feature selection list (role-filtered).
  - Preferences are persisted via `/auth/me/experimental-features`.
  - Redux `authSlice` updates user preferences immediately for reactive UI.

- **Sidebar + route gating:**
  - Sidebar renders an **Experimental** section only when enabled features exist for the user.
  - Added reusable `ExperimentalRoute` guard for manual URL access control.
  - Added route/page: `/experimental/grades` (full experimental grade module UI; gated by preferences + `featureCatalog` roles).

### Important behavior

- If global experimental toggle is off, experimental routes are inaccessible and hidden in sidebar.
- Feature check is both:
  - **role-based** (from feature catalog `allowedRoles`), and
  - **user preference-based** (`enabled + selected feature key`).
- Current implementation is intentionally generic so adding a new experiment is mostly a catalog entry plus route/page.

---

### Admin grants (2026-11)

- Stored JSON is now `{ enabled, features, granted }`. `granted` = what an administrator allows; `features` (what the user switched on) is always filtered to `granted`. Records saved before grants have no `granted`: it defaults to what they had on, so nobody lost access. ADMIN is always granted everything (`normalizeExperimentalFeatures(value, role)`).
- Admin endpoints: `GET/PUT /users/:id/experimental-features` (`{ granted: [...] }`; revoking also switches the feature off for that user).
- UI: Users page > row menu > "Experimental access" (`components/users/ExperimentalAccessDialog.tsx`). Profile only lists granted features.
- A new experiment still needs adding to `EXPERIMENTAL_FEATURE_KEYS` (backend), `authSchemas` enum and `featureCatalog`.
- Test: `tests/e2e/experimentalAccess.spec.ts`.
