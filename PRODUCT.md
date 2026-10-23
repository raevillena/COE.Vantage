# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary users are department chairmen and deans of the College of Engineering, used about equally. Chairmen build and adjust teaching loads each semester and resolve conflicts. Deans review schedules across departments and act on cross-department requests. Secondary roles are Admin (users, rooms, curriculum, academic years), Faculty (own schedule, grades), Officer (cannot create grade subjects), and students, who use the public grade lookup.

## Product Purpose
COE Vantage (COE.Vantage) is a faculty load scheduling system for the College of Engineering. It lets chairmen assign faculty to subjects, rooms and student classes without conflicts, and lets deans see and approve the result. Success means a conflict-free semester schedule produced with little manual checking, plus accurate PDF reports per faculty, class and room.

## Positioning
- Conflict-aware loads: a live preview flags faculty, room and class overlaps, capacity problems and lab-room mismatches before anything is saved. A drag-and-drop scheduler and auto-assign build on it.
- College-specific rules: per-department faculty, min/max unit limits, possible subjects per curriculum, department vs. other rooms, open/closed rooms, and cross-department approval requests.
- A grades module (experimental) with public student lookup by access code, alongside PDF schedule reports.

## Operating Context
Used each semester against an active academic year. Chairmen work in a weekly grid in faculty, student class and room views. Chairmen and deans are both faculty by nature and carry teaching loads. Reports are printed or shared as PDFs. The system is internal to the college, self-hosted (k8s manifests in `k8s/`), and sits behind nginx in production.

## Capabilities and Constraints
- Roles: ADMIN, DEAN, CHAIRMAN, FACULTY, OFFICER, with protected routes.
- Stack: React, TypeScript, Vite, Redux Toolkit, Tailwind CSS v4 on the frontend. Express, Prisma, PostgreSQL and Redis on the backend, with JWT access and refresh tokens.
- Features: CRUD for users, departments, rooms, curriculum, subjects, student classes and academic years. Faculty loads, requests, a trash view, a dashboard, profile and password reset, and the experimental grades module at `/experimental/grades` with the public `/grades` page.
- Department abbreviations come from a shorthand such as "(CPE)", not from first letters.
- Open decisions: the dashboard content, which should surface actionable items on classes and rooms (see `todo.txt`).

## Brand Commitments
Institutional tool for MMSU College of Engineering. The product name is COE Vantage. No logo, palette or voice commitments were stated.

## Evidence on Hand
Real workflow notes are in `todo.txt` and `dev.md`. No testimonials, usage metrics or brand assets exist in the repo, and none should be invented.

## Product Principles
1. Prevent conflicts before they are saved, not after.
2. Make the next action clear: show what needs a decision from the chairman or dean.
3. Encode the college's real rules (units, curriculum, departments) instead of generic scheduling concepts.
4. Keep the public student page simple and safe.
5. Chairmen and deans are also teachers, so treat them as faculty in every flow.

## Accessibility & Inclusion
No product-specific standard was established; default to sensible baselines (contrast, keyboard use, readable on phones for the public grade page).
