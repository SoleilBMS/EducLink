# Dashboard Specifications

## Purpose
This document defines requirements for EducLink dashboard experiences.

## Placeholder Scope
Use this file to outline layouts, widgets, data requirements, and interaction behavior.

## V3-02 — Modern SaaS Layout (server-rendered shell)

### Objectives
- Keep backend/API behavior unchanged while improving product experience on authenticated dashboard pages.
- Introduce a consistent app shell with left sidebar, top header, and card-based content zones.
- Ensure role-aware navigation suitable for demos (not final IA).

### Shell Structure
- **Sidebar (left):** EducLink brand block, slogan, role-filtered navigation links.
- **Top header:** tenant/school label (derived from `tenantId`), dashboard title, user identity block, role badge, logout.
- **Main content:** lightweight responsive grid/card layout for role dashboards.

### Role-aware Navigation (demo scope)
Links are displayed conditionally by authenticated role and include:
- Dashboard
- Élèves
- Enseignants
- Classes
- Présences
- Notes
- Messagerie
- Finance
- Démo

### Dashboards covered in V3-02
- `school_admin`
- `teacher`
- `parent`
- `student`

Other feature pages remain mostly unchanged and can be migrated incrementally in subsequent V3 tasks.
