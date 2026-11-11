<!-- Moved unchanged from dev.md (lines 607-825). Index: dev.md -->

### 15. Forms: Validation and Labels

**Validation**

- We avoid HTML `required` on inputs so that fields can be left blank while editing without immediate browser validation.
- Validation runs **on submit**: validators check required fields and business rules; errors are shown (e.g. inline or toast) and the form is not submitted until valid.
- Applied across CRUD forms: Student Classes, Curriculum, Departments, Rooms, Academic Years, Subjects, Users.

**Labels**

- Forms use visible **labels** (not only placeholders) for fields so the purpose of each field is clear even when the field already has a value (e.g. Student Class form).

---

### 16. Theme (Light / Dark / System)

**Mechanics**

- Tailwind v4 is configured via CSS in `src/style.css` using `@theme` for semantic tokens like `--color-surface`, `--color-foreground`, `--color-border`, etc.
- We added `@custom-variant dark (&:where(.dark, .dark *));` so `dark:*` utilities can be used based on a `.dark` class on the root.
- Light palette is the default `@theme` block; dark mode overrides the same CSS variables inside `:root.dark { ... }`, so classes like `bg-surface` / `text-foreground` automatically switch when dark mode is active.

**Bootstrap (no FOUC)**

- `index.html` includes a small inline `<script>` in `<head>` that runs before React:
  - Reads `localStorage.theme` (`\"light\" | \"dark\" | \"system\"`).
  - Falls back to `\"system\"` when unset or invalid.
  - Applies / removes the `dark` class on `<html>` based on the stored preference + `prefers-color-scheme: dark`.
- This prevents a flash of the wrong theme between first paint and React hydration.

**Runtime theme context**

- `src/context/ThemeContext.tsx` exports a `ThemeProvider` and `useTheme()` hook.
- `ThemePreference` is one of `\"light\" | \"dark\" | \"system\"` (user preference); `ResolvedTheme` is `\"light\" | \"dark\"` (what is actually shown).
- The provider:
  - Initializes from `localStorage.theme` (or `\"system\"`).
  - Computes `resolvedTheme` using `matchMedia(\"(prefers-color-scheme: dark)\")` when in `\"system\"` mode.
  - Writes updates back to `localStorage` and keeps `document.documentElement.classList` in sync (adds/removes `.dark`).
  - When following system, listens for OS theme changes and updates `resolvedTheme` + root class accordingly.
- `main.tsx` wraps the app in `<ThemeProvider>` so any component can read or change the theme.

**Toggle UI**

- `AppBar` uses `useTheme()` to show a small theme toggle button in the top-right.
- The button cycles `ThemePreference` in order: Light → Dark → System → Light.
- It shows:
  - An icon: ☀️ for resolved light, 🌙 for resolved dark.
  - A label: `Light`, `Dark`, or `System` (current preference).
- This lets users explicitly choose a theme or follow their OS preference at any time.

**Schedule grid colors**

- `ScheduleGrid` keeps a palette of 12 subject colors, now tuned for both themes:
  - Each entry uses a light + dark class, e.g. `bg-blue-300 dark:bg-blue-600`.
  - This ensures subject blocks remain distinct and readable on both light and dark surfaces.

---

### 18. Curriculum Builder: Remove & Optimistic Updates

**Remove behavior**

- In `CurriculumBuildPage`:
  - **Drag to pool**: Dragging a subject from any year/semester/`Ungrouped` zone into the **Subject pool** removes it from the curriculum via `PATCH /subjects/:id` with `curriculumId: null`, `yearLevel: null`, and `semester: null`.
  - **X button**: Each subject tile in the curriculum tree has an `×` button; clicking it performs the same update to remove the subject from the curriculum.

**Optimistic updates**

- Previously, the builder reloaded all data after every change, which felt slow even when the backend was fast.
- Now:
  - On remove (X or drag-to-pool), the subject is immediately removed from `curriculumSubjects` and its entry in `allSubjects` is updated to clear `curriculumId/yearLevel/semester`. The API call runs in the background; on error we reload once.
  - On move/add (drag from pool into a year/semester, or drag within the tree), the subject’s `yearLevel/semester` (and `curriculumId` when adding) are updated in memory first, then patched via API. Errors trigger a reload to resync.
- This makes curriculum building feel instant while still keeping the backend as the source of truth.

---

### 19. Whole-College Workload Excel Report (REMOVED in v0.3.5)

> Removed: the plain `GET /reports/college-workload` export and its Reports card were replaced by the registrar-layout **College Workload** card (section 30), which counts lab units 3x and shows regular load and overload. The notes below are kept as history only.

**Endpoint & access**

- `GET /reports/college-workload?academicYearId=...&semester=...` returns an Excel workbook summarizing all faculty loads for a given academic year + semester.
- Lives in the `reports` module:
  - Controller: `collegeWorkloadReport` in `backend/src/modules/reports/reportController.ts`.
  - Service: `getCollegeFacultyLoadsForReport` and `buildCollegeWorkloadWorkbook` in `backend/src/modules/reports/reportService.ts`.
- Auth:
  - Only `ADMIN`, `DEAN`, and `CHAIRMAN` can download the whole-college workload.
- Query parameters:
  - `academicYearId` (required, must be an active academic year).
  - `semester` (1, 2, or 3 for Mid Year).

**Excel structure (built with `exceljs`)**

- Workbook has three sheets:
  - **`Workload`**:
    - One row per scheduled block (`faculty`, `subject`, `class`, `day`, `time`, `room`, `lab` flag, units).
    - Useful as a raw export for custom analysis.
  - **`Totals`**:
    - One row per faculty with:
      - `Faculty`
      - `Total Units` (sum of unique subject-unit combinations per class)
      - `Subjects` (count of distinct subject+class combinations taught).
  - **`FacultyDetail`**:
    - Stacked per-faculty sections matching the manual workload template:
      - Header row: `Faculty: {Name}`.
      - Columns: `Course Code`, `Course Title`, `Units`, `Time`, `Day`, `Room / Building`, `Instructor`.
      - Rows are **grouped per subject + class + time + room**; all meeting days for that group are combined into one `Day` pattern:
        - Uses tokens `M`, `T`, `W`, `Th`, `F`, `S`, e.g. `MWF`, `TTh`, `MW`, etc.
      - `Units` shows the subject’s units once per subject/class, not per meeting.
      - A `Total Units` row at the bottom of each faculty section sums units across unique subject+class combinations for that faculty.

**Frontend integration**

- `ReportsPage.tsx` adds a **College workload (Excel)** card:
  - Reuses the existing **Academic Year** (active-only) and **Semester** selectors.
  - Button: `Download Excel` calls `/reports/college-workload` with `academicYearId` and `semester`.
  - Downloaded filename: `college-workload-{academicYearName}-S{semester}.xlsx` (or AY id fallback).

---

### 17. Schedule Color Palettes (Per User)

**Palette system**

- `src/context/SchedulePaletteContext.tsx` defines named palettes of Tailwind background classes for subject blocks:
  - Base palettes: `balanced`, `soft`, `vivid`, `cool`, `warm`, `earth`, `ocean`, `forest`.
  - Dark-tuned variants: `balancedDark`, `softDark`, `vividDark`, `coolDark`, `warmDark`, `earthDark`, `oceanDark`, `forestDark`.
- Each palette is a list of 12 color classes (with `dark:` variants) used round-robin across subjects.
- The current palette is stored in `localStorage.schedulePalette` and exposed via `useSchedulePalette()` (`paletteId`, `palette`, `setPaletteId`, and the list of available palettes).

**Usage**

- `ScheduleGrid` no longer hardcodes a `SUBJECT_COLORS` array; instead it calls `useSchedulePalette()` and uses `palette.colors` when computing the block background class.
- Text inside schedule blocks uses high-contrast neutral text colors (`text-gray-900 dark:text-gray-100` for primary line, `text-gray-700 dark:text-gray-300` for secondary line) so it remains readable regardless of palette.

**Palette selection**

- **Profile page (`UserProfilePage`)**:
  - Adds a “Schedule color palette” section with a select (`Balanced`, `Soft`, `Vivid`, `Cool`, `Warm`, `Earth`, `Ocean`, `Forest`, plus dark variants).
  - Changes update `schedulePalette` in localStorage and immediately update colors in all scheduler views.
- **Scheduler toolbar (`SchedulerPage`)**:
  - Adds a compact “Block colors” select on the right of the toolbar so users can change the palette while scheduling.

---

### 20. Auth & Branding (Login / Reset / Theme)

**Auth layout**

- `src/components/layout/AuthLayout.tsx` is the shared layout for unauthenticated pages (`LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`):
  - Left side: branded banner (`/banner.svg` in light mode, `/banner-dark.svg` in dark mode) within a bordered panel.
  - Right side: centered card with logo, app title/subtitle, and the actual form.
  - The outer wrapper uses `auth-bg` to apply a subtle, CSS-only abstract background; the login card itself is rendered above it (`relative z-10`) so the card surface stays clean.
- A small footer under the card shows the app version:
  - `const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.0.0";`
  - Rendered as: `COE.Vantage • {APP_VERSION}`.

**Theme toggle (light / dark / system)**

- `AuthLayout` and `AppBar` both use `useTheme()` (from `src/context/ThemeContext.tsx`) to expose a theme toggle:
  - Preference cycles: **Light → Dark → System → Light**.
  - `ResolvedTheme` (`"light" | "dark"`) drives visuals and the `.dark` class on `<html>`.
- Toggle UI:
  - Top-right button in `AuthLayout` (visible on login and reset-password screens).
  - Right side of the top app bar in authenticated views.
  - Each toggle shows:
    - A **monochrome SVG icon** using `stroke="currentColor"`:
      - Sun icon when `resolvedTheme === "light"`.
      - Crescent moon icon when `resolvedTheme === "dark"`.
    - A label: `Light`, `Dark`, or `System` (current preference).

**Login validation & error handling**

- `src/pages/login/loginValidation.ts` centralizes login form validation and error parsing:
  - `validateLoginFields(email, password)`:
    - Trims email, requires non-empty email/password.
    - Checks a simple email regex matching backend expectations.
    - Returns per-field errors or `null` when valid.
  - `getLoginError(err)`:
    - Accepts an Axios error from `/auth/login`.
    - Distinguishes **network errors** (no `response`) from API responses:
      - Network: "Could not reach server. Check your connection and try again." (or a generic failure).
      - HTTP 400 with `ZodError` shape: maps first `email` / `password` messages from `errors.body` (or top-level `errors`) to inline field errors.
      - HTTP 401 with `AppError`: uses `data.message` (e.g. "Invalid email or password") as the main message.

**Forgot password flow**

- Login now includes a **"Forgot password?"** link (top-right of the password field) to `/forgot-password`.
- `src/pages/forgotPassword/ForgotPasswordPage.tsx` posts `{ email }` to `POST /auth/forgot-password` and always shows a generic success message to avoid account enumeration.
- Backend route `POST /auth/forgot-password` (in `authRoutes.ts`) reuses email validation (`sendPasswordResetEmailSchema`) and calls `requestPasswordResetByEmail` in `authService.ts`.
- `requestPasswordResetByEmail` performs case-insensitive email lookup, issues a Redis token when the account exists, and sends reset email; when the account does not exist, it returns silently (same client response).
- `POST /auth/forgot-password` is intentionally **public** (no `authenticate` middleware), while `POST /auth/send-password-reset-email` remains the admin-only path.
- `LoginPage`:
  - No longer uses HTML `required`; the form adds `noValidate` and relies on `validateLoginFields` on submit.
  - Tracks `fieldErrors` for `email` and `password`, shows inline messages and `aria-invalid`/`aria-describedby` for accessibility.
  - Clears field-specific errors on change for a smoother UX.
  - Uses `getLoginError` in both:
    - Normal login submit.
    - Quick sign-in (dev) buttons.
- API client integration:
  - `src/api/apiClient.ts` has a response interceptor that auto-refreshes access tokens on **401** via `/auth/refresh`, but it explicitly **skips** this behavior for auth endpoints:
    - For `/auth/login` and `/auth/refresh`, a 401 is passed through directly. This ensures:
      - Wrong credentials on login do **not** trigger refresh.
      - The login page receives the original 401 error and can show the correct message and stop the loading state.

**Environment variables (summary)**

- **Backend** (`backend/env.example`):
  - `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`.
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`.
  - `FRONTEND_ORIGIN` (e.g. `http://localhost:5173`) for CORS and password reset link generation.
  - Optional password reset + SMTP settings for emailing reset links. HTML + plain-text bodies are built in [`backend/src/utils/passwordResetEmailTemplate.ts`](backend/src/utils/passwordResetEmailTemplate.ts) and sent from [`backend/src/utils/email.ts`](backend/src/utils/email.ts).
- **Frontend** (`frontend/.env` – sample in `frontend/.env.example`):
  - `VITE_API_URL` — base URL for the backend API (e.g. `http://localhost:4000/api`).
  - `VITE_APP_VERSION` — string shown in the auth footer (e.g. `v1.0.0`); when unset, the UI falls back to `v0.0.0`.

---

## Google sign-in (uncommitted, 2026-11-11)
- Only for EXISTING accounts. `POST /auth/google {credential}` (Google Identity Services ID token): the server verifies it with `google-auth-library` against `GOOGLE_CLIENT_ID`, then `loginWithGoogleProfile` requires email_verified, the email to end with `@GOOGLE_ALLOWED_DOMAIN` (default `mmsu.edu.ph`; a different `hd` claim is refused), and a non-deleted user whose registered email equals it (case-insensitive). Nothing is created, passwords are untouched; the session (access token + refresh cookie) is the same as password login (`startSession`).
- `GET /auth/google/config` -> `{enabled, clientId, domain}` is public; the login page (`pages/login/GoogleSignIn.tsx`) loads Google's script and shows the button only when `enabled`. No frontend env var needed.
- NOT enabled until `GOOGLE_CLIENT_ID` is set (backend `.env.local`, k8s `backend-config.yaml`); in Google Cloud Console add the site origins as Authorized JavaScript origins. Accounts registered with a non-mmsu email (e.g. `admin@coe.vantage`) cannot use it.
- Tested: the rules (verified, domain, look-alike domain, hd claim, unknown and deleted account, letter case) with a throwaway script against the dev DB; endpoints/button visibility in `tests/e2e/googleLogin.spec.ts`. NOT tested: a real Google token (needs a client id and a real mmsu.edu.ph login).
