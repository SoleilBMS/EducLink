# Pilot validation checklist

Use this checklist after seeding pilot data and starting staging.

- Environment target: `staging`
- Persistence target: `postgres`
- Tenant under test: `school-a` (primary), `school-b` (isolation sanity)

Mark each item: `[ ]` not done, `[x]` pass, `[!]` fail with notes.

## 0) Pre-flight

- [ ] `/healthz` returns HTTP 200 and `status=ok`.
- [ ] `/login` and `/demo` load.
- [ ] Seeded account login works with known password.

## 1) Login/session basics

- [ ] Login works for admin.
- [ ] Logout works and returns to login screen.
- [ ] Role switch works only via logout + login.
- [ ] Accessing another role dashboard while logged in is blocked or redirected correctly.

## 2) Admin journey

Login: `admin@school-a.test`

- [ ] `/dashboard/admin` loads key metrics.
- [ ] Student/parent/teacher lists load.
- [ ] `/admin/attendance` shows existing records.
- [ ] `/admin/finance` lists seeded fee plans, invoices, and payments.
- [ ] Creating one finance record (fee plan or invoice) succeeds.

## 3) Teacher journey

Login: `teacher@school-a.test`

- [ ] `/dashboard/teacher` loads.
- [ ] `/teacher/attendance` allows marking attendance for assigned class.
- [ ] `/teacher/lesson-homework` loads and allows adding lesson/homework content.
- [ ] `/teacher/grades` allows creating/updating grades.
- [ ] `/teacher/report-comments` can generate a draft and save only after explicit validation.

## 4) Parent journey

Login: `parent@school-a.test`

- [ ] `/dashboard/parent` loads.
- [ ] `/parent/homeworks` loads linked-child homework.
- [ ] `/parent/grades` loads linked-child grades.
- [ ] `/parent/finance` shows linked-child billing status.
- [ ] Inbox and announcements are visible.

## 5) Student journey (if included)

Login: `student@school-a.test`

- [ ] `/dashboard/student` loads.
- [ ] `/student/homeworks` loads.
- [ ] `/student/grades` loads.

## 6) Messaging

- [ ] Inbox loads for admin/teacher/parent.
- [ ] Reply in an existing thread succeeds.
- [ ] Announcement visibility matches role/tenant expectations.

## 7) Attendance

- [ ] Teacher can update attendance for own class.
- [ ] Attendance updates are visible from admin attendance page.
- [ ] Invalid attendance payloads are rejected (basic validation).

## 8) Grades

- [ ] Teacher can create assessment and enter grades.
- [ ] Parent can view child grades after update.
- [ ] Student can view own grades after update.

## 9) Finance

- [ ] Admin can create fee plan.
- [ ] Admin can create invoice.
- [ ] Admin can record payment.
- [ ] Parent finance view reflects statuses from seeded/new data.

## 10) Tenant isolation sanity check

- [ ] Login with a `school-a` user and confirm no `school-b` records appear in lists.
- [ ] If super-admin API checks are performed, confirm explicit `tenantId` is required for tenant-scoped resources.
- [ ] Optional: run one API read with tenant A context and verify tenant B entities are inaccessible.

## 11) Known limitations acknowledged during validation

- [ ] Team explicitly notes director/accountant flows are lighter in current pilot.
- [ ] Team explicitly notes migration rollback is manual.
- [ ] Team explicitly notes AI report comments are assistive drafts, not autonomous final comments.
