# COE.Vantage — Faculty Load Scheduling System

Full-stack web application for College of Engineering faculty load scheduling. Chairmen create and manage teaching loads with conflict detection; Deans view all schedules; Admins manage users and academic years.

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, PostgreSQL, Prisma, Redis, JWT (access + refresh), Zod, bcrypt
- **Frontend:** React, TypeScript, Vite, React Router, Axios, Redux Toolkit, Tailwind CSS v4

## Prerequisites

- Node.js 18+
- PostgreSQL
- Redis

## Setup

### 1. Backend

```bash
cd backend
npm install
```

Copy `backend/.env.example` to `backend/.env` and set:

- `DATABASE_URL` — PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/coe_vantage`)
- `REDIS_URL` — e.g. `redis://localhost:6379`
- `JWT_ACCESS_SECRET` — long random string
- `JWT_REFRESH_SECRET` — long random string
- `FRONTEND_ORIGIN` — e.g. `http://localhost:5173`

Run migrations and seed:

```bash
npx prisma migrate deploy
npx prisma db seed
```

Start the server:

```bash
npm run dev
```

Backend runs at `http://localhost:4000`.

Default admin: **admin@coe.vantage** / **Admin123!** (change in production.)

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env` if you need to override the API base URL:

```
VITE_API_URL=http://localhost:4000
```

For same-origin proxy (default), the Vite dev server proxies `/api` to `http://localhost:4000`, so you can leave this unset.

Start the dev server:

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Features

- **Auth:** Login, refresh token (HTTP-only cookie), logout, register (ADMIN only)
- **RBAC:** ADMIN, DEAN, CHAIRMAN, FACULTY, OFFICER with protected routes
- **CRUD:** Users, Departments, Rooms, Curriculum, Subjects, Student Classes, Academic Years
- **Faculty loads:** Create with conflict checks (faculty/room/class overlap, capacity, lab room)
- **Preview:** `POST /faculty-loads/preview` returns conflict flags before saving
- **Schedules:** Faculty, student class, and room views with color-coded weekly grid
- **Room availability:** Filter by room, academic year, semester
- **Reports:** PDF download for faculty, student class, and room (weekly grid + summary)

## API Overview

- `POST /auth/login` — body: `{ email, password }` → `{ accessToken, user }`
- `POST /auth/refresh` — cookie: refreshToken → `{ accessToken }`
- `POST /auth/logout` — clears refresh cookie
- `POST /auth/register` — ADMIN only
- `GET/POST/PATCH/DELETE` — `/users`, `/departments`, `/rooms`, `/curriculum`, `/subjects`, `/student-classes`, `/academic-years`
- `GET /academic-years/active` — get active academic year
- `GET/POST/PATCH/DELETE /faculty-loads` — query params: facultyId, roomId, studentClassId, academicYearId, semester
- `POST /faculty-loads/preview` — body: same as create → `{ facultyConflict, roomConflict, studentConflict, capacityIssue, labRoomMismatch }`
- `GET /reports/faculty/:id`, `/reports/student-class/:id`, `/reports/room/:id` — query: academicYearId, semester → PDF

## Project structure

```
COE.Vantage/
├── backend/
│   ├── prisma/schema.prisma, migrations, seed.ts
│   └── src/
│       ├── config/       env, redis
│       ├── middleware/   authenticate, authorize, validate, errorHandler
│       ├── modules/      auth, users, departments, rooms, curriculum, subjects, studentClasses, academicYears, facultyLoads, reports
│       ├── prisma/       client singleton
│       ├── types/        Express user augmentation
│       └── utils/        errors
├── frontend/
│   └── src/
│       ├── api/          apiClient (axios + refresh interceptor)
│       ├── components/   layout, protectedRoute, scheduleGrid, addFacultyLoadModal
│       ├── pages/        login, dashboard, users, rooms, curriculum, subjects, studentClasses, academicYears, scheduler, schedules/*, reports
│       ├── store/        auth slice, hooks
│       └── types/
└── README.md
```

## License

Private / internal use.
