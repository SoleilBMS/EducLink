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

| Variable | Value | Required |
| --- | --- | --- |
| `NODE_ENV` | `production` | ✅ |
| `EDUCLINK_PERSISTENCE` | `postgres` | ✅ (forcé en prod) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | ✅ |
| `SESSION_SECRET` | sortie de `openssl rand -hex 32` (≥32 chars) | ✅ |
| `LOG_FORMAT` | `json` | recommandé |
| `LOG_LEVEL` | `info` | recommandé |
| `EDUCLINK_AUTO_MIGRATE` | `1` (par défaut) ou `0` pour piloter manuellement | optionnel |
| `PORT` | injecté automatiquement par Railway, ne pas le forcer | — |
| `HOST` | `0.0.0.0` (déjà le défaut en prod) | — |

> 📋 La référence complète des variables (avec exemples pour AI, email, monitoring)
> est dans [.env.production.example](../.env.production.example).

Notes:
- Keep all secrets only in Railway variables (do not commit them to Git).
- `EDUCLINK_PERSISTENCE=postgres` ensures DB-first mode.
- `DATABASE_URL` must come from Railway Postgres service binding.
- `SESSION_SECRET` est **bloquant** : sans lui, le serveur refuse de démarrer en prod.

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

## 5) Migrations automatiques au démarrage

Depuis Sprint 7 (OPS-03), `npm run start:railway` exécute **automatiquement** les
migrations via [scripts/start-with-migrate.js](../scripts/start-with-migrate.js) :

1. `node packages/database/src/migrate.js` (idempotent grâce à la table `schema_migrations`)
2. Puis lance le serveur HTTP via `startServer()`

En cas d'échec de migration, le serveur **ne démarre pas** (exit non-zéro) — Railway
redémarrera selon `restartPolicyType: ON_FAILURE` (max 5 essais, voir `railway.json`).

**Désactiver l'auto-migration** : positionner `EDUCLINK_AUTO_MIGRATE=0` si tu préfères
piloter les schémas manuellement (utile pour des migrations longues / risquées que tu
veux exécuter hors fenêtre de déploiement).

### Seed de données démo (optionnel)

Le seed n'est **pas** automatique. Lance-le manuellement une fois après le premier
déploiement si tu veux les comptes/élèves de démonstration :

```bash
# Depuis le shell Railway (ou via railway run)
npm run db:seed
```

### Configuration via `railway.json`

Le repo embarque [`railway.json`](../railway.json) à la racine, qui configure
automatiquement Railway :

```json
{
  "deploy": {
    "startCommand": "npm run start:railway",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

→ Tu n'as plus besoin de configurer la start command ni le healthcheck dans l'UI Railway.

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

1. Push branch to GitHub (`main`).
2. Railway détecte le `railway.json` à la racine → build Nixpacks, start command et
   healthcheck déjà configurés (pas besoin d'UI).
3. Set/confirm variables from section 3 — **en particulier `SESSION_SECRET` et `DATABASE_URL`**.
4. Le premier déploiement applique les migrations automatiquement (auto-migrate).
5. Lance `npm run db:seed` depuis le shell Railway si tu veux les comptes de démo.
6. Valide :
   - `GET /healthz` → 200
   - `GET /login` → page rendue
   - Login avec un compte de démo → dashboard accessible

## 8) Current limitations for staging

- Rollback of DB schema/data remains manual and should be done carefully.
- Seed execution is manual/intentional to avoid accidental reseeding.
- This guide is staging-focused; production hardening (secrets rotation, backup policy, stricter rollout strategy) is intentionally out of scope.
