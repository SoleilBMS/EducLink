# Demo walkthrough (15–20 min, pilot-ready)

This walkthrough is designed for staging/pilot demos with seeded PostgreSQL data.

## Setup before demo

1. Ensure DB is migrated and seeded.
2. Start app in staging mode.
3. Open `/demo` and `/login`.

All seeded demo users use password: `password123`.

Role switch rule: logout, then login with the next role.

## Demo accounts (`school-a`)

| Role | Email | Landing dashboard |
|---|---|---|
| Admin | `admin@school-a.test` | `/dashboard/admin` |
| Director | `director@school-a.test` | `/dashboard/director` |
| Teacher | `teacher@school-a.test` | `/dashboard/teacher` |
| Teacher (secondary) | `teacher2@school-a.test` | `/dashboard/teacher` |
| Parent | `parent@school-a.test` | `/dashboard/parent` |
| Parent (secondary) | `parent2@school-a.test` | `/dashboard/parent` |
| Student | `student@school-a.test` | `/dashboard/student` |
| Accountant | `accountant@school-a.test` | `/dashboard/accountant` |

## Suggested timeline

### 0:00–2:00 — Login + orientation

- Show `/login` and `/demo`.
- Explain role switching and tenant-scoped behavior.

### 2:00–7:00 — Admin journey

Login as admin:

- `/dashboard/admin` (high-level overview)
- Student/parent/teacher list pages
- `/admin/finance` (existing fee plans, invoices, payments)
- `/admin/attendance` (existing attendance records)
- `/inbox` (messages + announcements)

### 7:00–12:00 — Teacher journey

Login as teacher:

- `/dashboard/teacher`
- `/teacher/attendance` (mark attendance for assigned class)
- `/teacher/lesson-homework` (show existing content, optionally add item)
- `/teacher/grades` (show assessments/grades, optionally edit)
- `/teacher/report-comments` (generate draft comment, then validate/save)

### 12:00–16:00 — Parent journey

Login as parent:

- `/dashboard/parent`
- `/parent/homeworks`
- `/parent/grades`
- `/parent/finance`
- `/inbox`

### 16:00–18:00 — Student and accountant (optional but recommended)

Login as student:

- `/dashboard/student`
- `/student/homeworks`
- `/student/grades`

Login as accountant:

- `/dashboard/accountant`
- `/admin/finance`

### 18:00–20:00 — Wrap-up and limitations

Explicitly call out:

- director/accountant journeys are currently lighter;
- this pilot demo uses seeded data, not a full onboarding flow;
- AI comment generation is assistive and requires human validation.

## Demo reliability notes

- `/demo` is the canonical in-app guide if presenter loses the flow.
- Keep one browser profile/session to avoid cross-session confusion.
- If data was modified heavily in a previous run, reseed before demo.
