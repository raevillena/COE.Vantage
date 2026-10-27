<div align="center">

<img src="frontend/public/banner.svg" alt="COE.Vantage" width="420" />

### Faculty load scheduling for the College of Engineering

Build conflict-free teaching loads, see what's left to schedule, and print the registrar's forms, all in one place.

![Version](https://img.shields.io/badge/version-v0.3.6-197fa1)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61dafb?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169e1?logo=postgresql&logoColor=white)
![Status](https://img.shields.io/badge/license-internal%20use-lightgrey)

[Features](#-features) ·
[Quick start](#-quick-start) ·
[Roles](#-roles) ·
[What's new](#-whats-new) ·
[Deployment](#-deployment) ·
[Docs](#-documentation)

</div>

---

## ✨ Features

**Scheduling**
- 🧩 **Drag-and-drop scheduler** with live conflict preview: faculty, room and class overlaps, room capacity and laboratory mismatches are flagged before anything is saved.
- 🤖 **Auto-assign** for a class (optionally limiting a subject to specific rooms), using only the faculty listed as *possible subjects to teach* for that term, respecting unit caps, room capacity and lab needs.
- 🔂 **Repeat a block on other days**: tick extra days when adding a block; each one is conflict-checked before it can be ticked. Open a saved block to add or remove days later.
- 📋 **Copy a class schedule** from a previous term, and reset a class in one step.
- 🔁 **Cross-department requests**: assigning another department's faculty (also when changing the faculty of a saved load) goes to that department's chairman for approval.
- 🧪 **Team teaching** and off-system faculty or rooms.

**Faculty & rules**
- 👥 Per-department faculty with status and **maximum units**. Chairmen and deans carry teaching loads too.
- ⚖️ **Laboratory units count 3×** toward a faculty's load and maximum units.
- ➖ **Deloading** per term (designations, research, other assignments) is deducted from the maximum units. Anyone above the result is in **overload** (red), below it **underload** (amber), exactly at it fully loaded (green).
- 🗓️ **Possible subjects are kept per academic year and semester**, so planning a new term never rewrites an old one. Copy them from another term in one click.
- 🚪 Rooms can be **opened or closed** to other departments per term, and transferred between departments.

**Dashboard & reports**
- 📊 **Term overview** for chairmen, deans and the college secretary: curriculum scheduled, faculty load used, room use and scheduling gaps, with a projected-completion estimate and the top things that need action.
- 🙋 **Faculty dashboard**: a faculty member sees only their own workload, deloading and weekly schedule.
- 🚨 **Schedule conflict scan** that counts faculty, room and class double bookings in the saved schedule.
- 📤 **Dashboard export**: all metrics in one Excel workbook, or any detail view as Excel or CSV with its filters applied.
- 🔎 **Drill-down pages** behind every number, with search, filters and paging.
- 📑 **Excel forms in the registrar's layout**: class schedules and the *Summary of Faculty Workload* (actual load, regular load, overload).
- 🖨️ PDF schedules per faculty, class and room, plus the Notice of Teaching Assignment (NOTA).

**Platform**
- 🔐 JWT access and refresh tokens (HTTP-only cookie), password reset by email, six roles enforced on the server.
- 🌗 Light, dark and system themes, per-user schedule colour palettes.
- 🧭 *What's new* release notes on the login page.
- 🧪 Experimental **grade module** with a public, access-code grade lookup.

## 🧰 Tech stack

| Layer | Tools |
|---|---|
| Frontend | React, TypeScript, Vite, React Router, Redux Toolkit, Axios, Tailwind CSS v4, Radix UI, dnd-kit |
| Backend | Node.js, Express, TypeScript, Prisma, Zod, bcrypt, ExcelJS, PDFKit |
| Data | PostgreSQL, Redis (refresh and reset tokens) |
| Tests | Playwright smoke tests |
| Deploy | Docker, Kubernetes, nginx |

## 🚀 Quick start

**Prerequisites:** Node.js 18+, PostgreSQL, Redis.

```bash
git clone https://github.com/raevillena/COE.Vantage.git
cd COE.Vantage
```

**1. Backend**

```bash
cd backend
npm install
cp env.example .env        # then fill in the values below
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed        # demo accounts and sample data (optional)
npm run dev                # http://localhost:4000
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection (defaults to `redis://localhost:6379`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random strings |
| `FRONTEND_ORIGIN` | e.g. `http://localhost:5173` |
| `TRUST_PROXY` | `true` when running behind nginx |
| `RESET_PASSWORD_BASE_URL`, `SMTP_*` | Password-reset email |

Put machine-specific overrides in `backend/.env.local` (it is loaded after `.env` and is git-ignored). See [`backend/env.example`](backend/env.example) for every option.

**2. Frontend**

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:4000`. Set `VITE_API_URL` to point somewhere else.

**3. Sign in**

The seed creates demo accounts, all with password `Test123!`:

`admin@coe.vantage` · `dean@coe.vantage` · `chairman@coe.vantage` · `faculty1@coe.vantage` · `officer@coe.vantage`

> ⚠️ These are for local development. Change or remove them in production.

## 👤 Roles

| Role | Can do |
|---|---|
| **Admin** | Everything: users, academic years, scheduling rules, trash, college-wide data |
| **Dean** | College-wide view, rooms and departments, cross-department requests, reports |
| **Chairman** | Schedules their own department: scheduler, auto-assign, faculty, rooms, curricula, subjects, classes, requests |
| **College Secretary** | Views everything the dean can and generates every report and Excel form, **read-only** (enforced on the server) |
| **Officer** | Rooms, departments, curricula and student classes |
| **Faculty** | Their own schedule, NOTA and reports |

## 🆕 What's new

The full history is in **[CHANGELOG.md](CHANGELOG.md)**. The latest releases:

| Version | Highlights |
|---|---|
| **v0.3.6** | Feedback page with screenshots, admin status and notes, picture clean-up |
| **v0.3.5** | Deloading with overload and underload, faculty dashboard, schedule conflict scan, dashboard exports, (?) help tips, reload buttons |
| **v0.3.4** | Repeat a schedule block on other days (add or remove days when editing), limit a subject to specific rooms, Subjects page opens on the newest curriculum |
| **v0.3.3** | College Secretary role (college-wide, read-only, all reports) |
| **v0.3.1** | Possible subjects per academic year and semester, with copy from another term |
| **v0.3.0** | Dashboard overview and drill-downs, Excel registrar forms, lab load credit (3×), chairman as faculty, cross-department approval on edit |
| **v0.2.3** | Auto-assign uses possible subjects only; department codes in pickers |

The same notes appear in the app under **What's new** on the login page.

## 🧪 Testing

End-to-end smoke tests run against a local stack (backend on `:4000`, frontend on `:5173`, seeded database):

```bash
cd frontend
npx playwright install chromium   # first time only
npm run test:e2e
```

The suite also expects a `secretary@coe.vantage` account with the College Secretary role (create it from the Users page; it is not in the seed). Details are in [`dev.md`](dev.md), section 35.

## 📦 Deployment

Production runs as containers on Kubernetes behind nginx. The step-by-step guide, including the Prisma migrate and seed jobs, is in [`k8s/DEPLOYMENT.md`](k8s/DEPLOYMENT.md).

Release checklist:

1. Add the entry to `CHANGELOG.md` and `frontend/src/data/changelog.ts`, and set `VITE_APP_VERSION` for the frontend build.
2. Build and push both images with the new tag.
3. Update the image tag in `k8s/backend.yaml`, `k8s/frontend.yaml` and `k8s/prisma-migrate-job.yaml`.
4. Delete the old migrate job, apply the new one, and check its logs before rolling out the backend and frontend.

## 🗂️ Project structure

```
COE.Vantage/
├── backend/
│   ├── prisma/             schema, migrations, seed
│   └── src/
│       ├── config/         env, redis
│       ├── middleware/     authenticate, authorize (+ readOnly), validate, errors
│       ├── modules/        auth, users, departments, rooms, curriculum, subjects,
│       │                   studentClasses, academicYears, facultyLoads, assignmentRequests,
│       │                   schedulingRules, dashboard, reports, gradeSubjects
│       └── utils/          workload credit, errors, email templates
├── frontend/
│   ├── src/
│   │   ├── components/     layout, scheduler, scheduleGrid, ui, users
│   │   ├── data/           in-app changelog
│   │   ├── pages/          dashboard, scheduler, faculty, schedules, reports, rooms, …
│   │   └── store/          Redux auth state
│   └── tests/e2e/          Playwright smoke tests
├── k8s/                    manifests, migrate and seed jobs, deployment guide
├── CHANGELOG.md
└── dev.md                  design notes and behaviour reference
```

## 📚 Documentation

- [`dev.md`](dev.md): how the scheduler, auto-assign, exports, dashboard, per-term possible subjects and roles behave, and why.
- [`CHANGELOG.md`](CHANGELOG.md): release notes.
- [`PRODUCT.md`](PRODUCT.md): who the product is for and what it must do.
- [`k8s/DEPLOYMENT.md`](k8s/DEPLOYMENT.md): production deployment.

## 📄 License

Private, for internal use by the College of Engineering. All rights reserved.
