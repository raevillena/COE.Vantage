# College deadlines with reminders (2026-11-11, uncommitted)

Migrations `20260626000000_college_deadlines` and `20260627000000_email_deadlines_pref` (`User.emailDeadlines`; tables `CollegeDeadline`, `CollegeDeadlineReminder`; `CollegeDeadline` is in `SCOPED_MODELS`). Applied to the dev DB.

## What it does
- The **college secretary** (and the admin) adds deadlines on the **Deadlines** page (sidebar, Management group; routes `/deadlines`): title, details, due date and time, who it is for, and the email reminders. **Everyone in the college** (dean, chairmen, faculty, officers, secretary) reads them. A deadline can be for everyone or for chosen roles (`audienceRoles`; empty = everyone); people outside the audience do not see it.
- **Reminder settings** per deadline: `reminderDays` (days before the due day; presets 14 / 7 / 3 / 1 / 0 = on the day) and `reminderHour` (Manila time). **Defaults: 7, 3 and 1 day before, at 8:00 AM.** The editor has a "use the defaults" link.
- The dashboard shows the next four deadlines (`components/dashboard/UpcomingDeadlines.tsx`), for every college role.
- Adding a deadline, or moving its due date, puts a bell notification ("New deadline", "Deadline moved") on the audience's bell. Moving the due date or the reminder hour starts its reminders over (the sent-marks are cleared).

## How reminders run (`modules/collegeDeadlines/deadlineReminders.ts`)
- Every 10 minutes (Redis lock, so several backend replicas run it once) `runDeadlineReminders` looks at deadlines that are not yet due. A reminder is due when `reminderTime(dueAt, daysBefore, hour)` (that hour, Manila time, on the day N days before the due day) has passed. It is **dropped if more than 12 hours late** (backend down, or the deadline was made after its time) and never sent after the due moment.
- It is **claimed first** in `CollegeDeadlineReminder` (unique on deadline + days): a reminder cannot go out twice, even with two runners. Reminders are not retried if the backend dies after claiming.
- Each person gets ONE email for everything that fired in that run (keeps the Gmail daily cap in mind: about 500), plus a bell notification per deadline. People who turned off "Remind me by email about college deadlines" on the Profile page (`User.emailDeadlines`) still get the bell; the digest switch does not affect deadline emails. The email is the same one-switch family as the digest: it only goes out when `EMAIL_DIGEST=true`; the bell reminders always run. `utils/email.ts` never sends to `@coe.vantage` or example addresses.
- Recipients: users of the deadline's college, not deleted, with a college role in the audience. The admin, president and unit viewers are never recipients.

## API
`GET /college-deadlines` (any college role; managers see all, others only theirs; past ones for 30 days), `POST`, `PATCH /:id`, `DELETE /:id` (college secretary and admin only, 403 for the rest). Body: `title`, `description?`, `dueAt`, `audienceRoles[]`, `reminderDays[]`, `reminderHour`.

## Tests
`tests/e2e/collegeDeadlines.spec.ts` (API rules, audience filtering, 403s, defaults, page add/remove). The reminder engine was checked with a throwaway script against made-up users `qa.deadline.*@example.com` (time maths; claimed once; one email per person; opted-out gets the bell only; 12-hour lateness; past deadlines): all passed; the script is not kept because it needs the database (use `runDeadlineReminders(now, { email, onlyUserIds })`: always pass `onlyUserIds` in tests).

## Not done
- No "send a test reminder to me" button, no per-deadline "mark as done" for a person, no recurring deadlines (every term the secretary re-adds them; copying last term's deadlines would be a good next step).
- No SMS or push; reminders are the bell and email only.
