# Assessments (exams, quizzes, assignments) with Safe Exam Browser - PLAN, not built

Status: planned 2026-11-11, nothing implemented. Decisions marked **OPEN** are waiting for the product owner.

## What it is
Staff create exams, quizzes and assignments; students take them inside **Safe Exam Browser (SEB)**, which locks their computer to the exam page. Vantage provides the question bank, scheduling, auto-grading and results.

## Key design points
- **Experimental, staff side.** A new feature key `examModule` (see skill `add-experimental-feature`): staff-only, off by default, shown in the Experimental sidebar group like Grades. NOT listed in release notes (experimental features never are, see skill `package-release`).
- **Students have no accounts.** Reuse the Grades approach: student number + a per-student access code. The roster is a Grades subject or class list; codes are emailed with the paced sender (`utils/email.ts`, pooled transport, `sendAccessCodes`-style background job, daily cap).
- **Student side is a public route** (like `/grades`), e.g. `/exam`, rate limited like the public grade lookup.
- **SEB enforcement.** SEB adds a hash header to every request (`X-SafeExamBrowser-RequestHash`, plus the config-key variant). The server computes `SHA-256(absolute request URL + key)` and compares with the exam's stored key; a normal browser is refused with a "open this in Safe Exam Browser" page. Vantage generates the `.seb` settings file per exam (start URL, quit URL, allowed URLs, quit password).
- **Honest limit.** SEB is a deterrent, not a guarantee. Treat it as a strong barrier and log the rest. The URL hash needs the server to see the real public URL: `TRUST_PROXY` and the public origin (`FRONTEND_ORIGIN`) must be right in production.

## Phases
1. **Foundation.** Feature key and page shell. Prisma models `Assessment`, `AssessmentQuestion`, `AssessmentOption`, `AssessmentAttempt`, `AssessmentAnswer`, added to `SCOPED_MODELS` in `backend/src/utils/collegeScope.ts`. Fields: type (exam / quiz / assignment), opens/closes, duration, attempts allowed, shuffle options. One migration (add it to the k8s migrate job flow).
2. **Authoring.** Question editor: multiple choice, true/false, short answer (essay later). Points per question, question bank copied between assessments, import from CSV or a sheet (like the Grades import).
3. **Roster and access.** Link an assessment to a Grades subject or class, generate codes, email them with throttling and progress (reuse the Grades send pipeline, including "skip already sent" and per-recipient failures).
4. **SEB layer.** `.seb` file download, request-hash middleware on the student routes, the "use Safe Exam Browser" page, quit URL.
5. **Taking the exam.** `/exam` (student number + code), server-side timer, autosave of answers, one attempt per student unless allowed, resume rule, auto-submit on timeout.
6. **Grading and results.** Instant auto-grading for objective questions, a manual grading screen for essays, a results table with export, and a "push scores into Grades" button.
7. **Integrity log.** Record start, submit, focus/tab loss where SEB reports it, IP changes and non-SEB attempts; a per-student timeline for the teacher.
8. **Tests and docs.** Playwright for authoring, the non-SEB refusal, a simulated SEB header, timing and grading (made-up students with a `QA ` prefix, cleaned up in `finally`). Replace this plan with real notes in `docs/dev/assessments.md` and update `docs/HANDOFF.md`.

## Decisions (OPEN)
1. **Scope first:** all three types in v1, or exams and quizzes first with assignments (file or text submission) later?
2. **Question types:** multiple choice, true/false and short answer only, or essay and file upload too?
3. **Roster:** reuse Grades subjects (recommended), or a separate roster entered inside the module?
4. **Strictness:** hard-require SEB for every assessment, or let the teacher choose per assessment?
5. **SEB keys:** is it fine for Vantage to generate the SEB config and store the key per exam (teacher hands students the `.seb` file or link)?
6. **Hosting:** will exams run from the same public site as the app? The URL hash check needs the real public address.

## Starting point when picking this up
Read `docs/dev/grades-module.md` (roster, access codes, public lookup, email sending) and the `add-experimental-feature` skill, then answer the OPEN decisions and begin with phases 1 and 2.
