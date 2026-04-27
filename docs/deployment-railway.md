# Public staging deployment on Railway

This guide documents a simple, repeatable **public staging** deployment of EducLink on Railway.

## 1) Preconditions

- GitHub repository connected and up to date.
- EducLink already supports:
  - `npm run start:prod`
  - `npm run db:migrate`
  - `npm run db:seed`
  - `/healthz`
  - `/demo`
- Railway project will host:
  - one Node.js service for EducLink,
  - one PostgreSQL service.

## 2) Create Railway project and services

1. In Railway, create a **new project**.
2. Choose **Deploy from GitHub repo** and select the EducLink repository.
3. Add a **PostgreSQL** service in the same project.
4. Confirm the web service and Postgres service are both present before continuing.

## 3) Configure staging variables (web service)

In the EducLink web service variables, set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `EDUCLINK_PERSISTENCE` | `postgres` |
| `LOG_FORMAT` | `json` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |

Notes:
- Keep all secrets only in Railway variables (do not commit them to Git).
- `EDUCLINK_PERSISTENCE=postgres` ensures DB-first mode.
- `DATABASE_URL` must come from Railway Postgres service binding.

## 4) Configure start command

Recommended Railway start command:

```bash
npm run start:railway
```

`start:railway` is production + postgres + structured logs:

```bash
cross-env NODE_ENV=production EDUCLINK_PERSISTENCE=postgres LOG_FORMAT=json LOG_LEVEL=info node apps/web/src/server.js
```

Alternative (compatible) command:

```bash
npm run start:prod
```

## 5) Run migrations and seed for staging data

From Railway web service shell/CLI, run:

```bash
npm run railway:setup
```

This runs:

```bash
npm run db:migrate
```

If you want demo/staging seed data, run:

```bash
npm run db:seed
```

Or one-shot migrate + seed:

```bash
npm run railway:setup:seed
```

## 6) Manual verification checklist

After deploy is live, verify with your public staging URL:

1. **Health check**
   - `GET /healthz`
   - Expect HTTP `200` and status `ok` (or explicit degraded signal if DB unavailable).
2. **Demo route**
   - Open `/demo`
   - Expect demo experience to load.
3. **Login route**
   - Open `/login`
   - Expect login page to render.

Example:

```bash
curl -i https://<your-staging-domain>/healthz
```

## 6.1) Critical networking checks (Railway "Application failed to respond")

If Railway shows **"Application failed to respond"**, verify these points first:

1. The app must listen on `HOST=0.0.0.0`.
2. The app must listen on the Railway-injected `PORT` (not a fixed port).
3. If a domain target port is configured, it must match the app listening port.

For EducLink, `apps/web/src/server.js` starts with `runtimeEnv.host` and `runtimeEnv.port` where:
- `runtimeEnv.port` is read from `process.env.PORT` (default `3000` only when `PORT` is absent),
- `runtimeEnv.host` defaults to `0.0.0.0` in `production` / `staging`.

If a Railway domain had an old/manual target port value, remove it (or set it to the active app port) and redeploy.

## 7) Recommended first deploy sequence

1. Push branch to GitHub (or merge to staging branch).
2. Railway deploys the web service.
3. Set/confirm variables from section 3.
4. Run `npm run railway:setup` once.
5. Run `npm run db:seed` if staging demo data is needed.
6. Set start command to `npm run start:railway`.
7. Validate `/healthz`, `/demo`, `/login`.

## 8) Current limitations for staging

- Rollback of DB schema/data remains manual and should be done carefully.
- Seed execution is manual/intentional to avoid accidental reseeding.
- This guide is staging-focused; production hardening (secrets rotation, backup policy, stricter rollout strategy) is intentionally out of scope.
