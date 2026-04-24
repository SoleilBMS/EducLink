# User roles guide (pilot)

This guide explains what each role can do in the current pilot implementation.

For security architecture details, see `docs/rbac-tenant-strategy.md`.

## Tenant rules

- All non-`super_admin` roles are tenant-scoped.
- Tenant-scoped users can only access data for their own tenant.
- `super_admin` can perform cross-tenant operations only where explicitly allowed and with an explicit tenant scope.

## Roles in pilot demo data

## 1) school_admin

Primary operational owner for a tenant.

Typical pilot actions:

- open admin dashboard (`/dashboard/admin`)
- view students, parents, teachers
- review attendance (`/admin/attendance`)
- manage finance objects (`/admin/finance`): fee plans, invoices, payments
- post announcements / use inbox

## 2) director

Read-oriented oversight role.

Current pilot behavior:

- dashboard access (`/dashboard/director`)
- limited operational actions compared with school admin

Use this role to show leadership visibility, not day-to-day data entry.

## 3) teacher

Academic operations role.

Typical pilot actions:

- dashboard access (`/dashboard/teacher`)
- attendance taking for assigned classes (`/teacher/attendance`)
- lesson/homework management (`/teacher/lesson-homework`)
- assessment and grades entry (`/teacher/grades`)
- AI-assisted report-comment drafts (`/teacher/report-comments`), with human validation required before save

## 4) parent

Family-facing monitoring role.

Typical pilot actions:

- dashboard access (`/dashboard/parent`)
- homework view (`/parent/homeworks`)
- grades view (`/parent/grades`)
- finance status view (`/parent/finance`)
- inbox/announcements

Parents should only see linked children.

## 5) student

Student self-service role (limited scope).

Current pilot actions:

- dashboard access (`/dashboard/student`)
- homework view (`/student/homeworks`)
- grades view (`/student/grades`)

## 6) accountant

Finance-focused role.

Current pilot actions:

- dashboard access (`/dashboard/accountant`)
- finance monitoring via admin finance pages in current implementation

## 7) super_admin

Platform-level role for multi-tenant administration/testing.

Pilot notes:

- not part of the standard school demo flow
- must use explicit tenant scoping when operating on tenant-scoped resources

## Role limitations to state explicitly in pilots

- Director and accountant experiences are lighter than school_admin/teacher flows.
- Parent/student workflows are consumption-oriented; creation/update actions are intentionally limited.
- Some features exist in API and basic server-rendered pages but are not yet represented as polished role-specific product surfaces.
