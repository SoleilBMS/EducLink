# Pilot usage guide (Issue #12)

This guide is for non-core contributors who need to run EducLink in a staging-like pilot setup, run a guided demo, and execute a manual validation pass.

## Scope of this guide

This guide covers the current repository state as of V2 Pilot Readiness:

- Runtime configuration
- PostgreSQL migrations + pilot seed
- Staging startup commands
- Demo accounts and role switching
- Pointers to role behavior and manual validation

It does **not** claim production hardening beyond what currently exists in the repo.

## 1) Prerequisites

- Node.js 20+
- npm
- Docker (for local PostgreSQL via `docker-compose.db.yml`)

## 2) Configure environment

Start from the staging example file:

```bash
cp .env.staging.example .env.staging
```

Load it into your shell:

```bash
set -a
source .env.staging
set +a
```

Minimum variables to verify:

- `NODE_ENV=staging`
- `PORT` (for example `3000`)
- `EDUCLINK_PERSISTENCE=postgres`
- `DATABASE_URL` (required when persistence is postgres)
- `LOG_FORMAT=json` recommended for staging

Reference: `docs/deployment.md`.

## 3) Start PostgreSQL

```bash
docker compose -f docker-compose.db.yml up -d
```

## 4) Install dependencies

```bash
npm ci
```

## 5) Run migrations

```bash
npm run db:migrate
```

## 6) Seed pilot data

```bash
npm run db:seed
```

The seed is idempotent and creates:

- `school-a` (main pilot/demo tenant)
- `school-b` (light tenant for isolation sanity checks)

Reference: `docs/persistence.md`.

## 7) Start staging

Recommended:

```bash
npm run deploy -- staging --seed --start
```

Alternative (manual sequence):

```bash
npm run db:migrate
npm run db:seed
npm run start:staging
```

Check health:

```bash
curl -i http://localhost:3000/healthz
```

## 8) Access app and demo accounts

Open:

- `http://localhost:3000/login`
- `http://localhost:3000/demo`

Demo password for all seeded users:

- `password123`

Primary tenant accounts (`school-a`):

- `admin@school-a.test`
- `director@school-a.test`
- `teacher@school-a.test`
- `teacher2@school-a.test`
- `parent@school-a.test`
- `parent2@school-a.test`
- `student@school-a.test`
- `accountant@school-a.test`

Role switch rule during demo:

- logout, then login with the next account.

## 9) Demo and validation workflow

1. Run the 15–20 minute walkthrough in `docs/demo-walkthrough.md`.
2. Use `docs/user-roles-guide.md` to explain role boundaries.
3. Execute `docs/pilot-validation-checklist.md` and record pass/fail notes.

## Known limitations (current state)

- The project still includes in-memory mode (`EDUCLINK_PERSISTENCE=memory`) for tests and local development only; staging/pilot flows must run with PostgreSQL.
- Director dashboard is intentionally limited; some operational actions remain admin/teacher-owned.
- AI report comments are draft-assist only and require explicit teacher validation before saving.
- Migration rollback is manual (forward-only migration flow).
- This guide documents local/staging pilot operations, not full production operations (backup policy, HA, and security compliance runbooks are not yet fully documented in this repo).
