# Dashboard Specifications

## Purpose
This document defines requirements for EducLink dashboard experiences.

## V3-03 — Role Dashboard Cards & Metrics (server-rendered)

### Scope and constraints
- Keep backend/API behavior unchanged.
- Reuse existing in-memory/persistence stores only.
- No database schema changes.
- Preserve strict role isolation and tenant scope.
- Keep dashboards business-readable with lightweight cards and quick actions.

### Shared shell (from V3-02)
- **Sidebar:** role-aware navigation.
- **Header:** tenant label, dashboard title, user identity, role badge, logout.
- **Main content:** card-based sections with responsive metric grids.

## Role dashboards

### 1) `school_admin`
**Cards and metrics**
- **Synthèse établissement**
  - Classes actives
  - Élèves actifs
  - Responsables actifs
  - Enseignants actifs
- **Attendance summary**
  - Présences enregistrées
  - Présents / Retards / Absents
- **Finance summary**
  - Factures
  - Montant dû
  - Montant payé
  - Reste à encaisser
  - Empty state when no invoice data exists
- **Activité récente**
  - Latest tenant activity from audit logs
  - Empty state when no activity

**Quick actions**
- Manage students
- Manage teachers
- View attendance
- View finance
- Open demo guide

### 2) `teacher`
**Cards and metrics**
- **Vue enseignant**
  - Assigned classes
  - Students in scope (sum across assigned classes)
  - Attendance to record (same scoped student volume for now)
  - Recent grades count
- **Recent assessments**
  - Recent graded entries (assessment + student + score)
  - Empty state when no grades

**Quick actions**
- Record attendance
- Add grade/comment
- View class students

### 3) `parent`
**Cards and metrics**
- **Mes enfants**
  - Linked children count
  - Latest grades count
  - Attendance records count
  - Messages & announcements count
- **Latest grades**
  - Last grade entries for linked children
  - Empty state when no grades
- **Attendance summary**
  - Present / Late / Absent counts on linked children only
  - Empty state when no attendance
- **Messages / annonces**
  - Latest visible announcements
  - Empty state when no messages

**Quick actions**
- View child profile
- View grades
- View attendance
- Open messages

### 4) `student`
**Cards and metrics**
- **Mon espace**
  - Own class
  - Latest grades count
  - Attendance records count
  - Homework & announcements count
- **Latest grades**
  - Recent personal grades
  - Empty state when no grades
- **Attendance summary**
  - Present / Late / Absent on own records only
  - Empty state when no attendance
- **Homework / announcements**
  - Recent homework list
  - Empty state when no homework/messages

### 5) `accountant` (route already supported)
- Finance summary card with invoice/payment metrics.
- Empty finance state when no data exists.

### 6) `director` (route already supported)
- Pilotage synthétique card with tenant-level class/student/teacher counts.

## Role isolation rules enforced
- Admin/director/accountant use tenant-level aggregates only.
- Teacher aggregates only assigned classes + own grading scope.
- Parent views only linked children (`parent_student_links`).
- Student views only own profile/data by `userId`.
- No cross-tenant aggregation in dashboards.

## Data sources reused (no new persistence)
- `coreSchoolStore` (class/subject catalogs)
- `studentStore`, `teacherStore`, `parentStore`
- `attendanceStore`
- `gradingStore`
- `financeStore`
- `messagingStore`
- `auditLogStore`
- `lessonHomeworkStore`

## Known limitations (V3-03)
- Dashboard aggregates are computed on request (no caching).
- Attendance "to record" for teacher is a simple scoped proxy metric.
- Recent activity relies on available audit logs (may be sparse in fresh tenants).
- Parent "View child profile" points to current student listing route behavior.
- Messaging summary is announcement/thread count only (no unread state).

## Dashboards covered
- `school_admin`
- `teacher`
- `parent`
- `student`
- `accountant` (existing route)
- `director` (existing route)
