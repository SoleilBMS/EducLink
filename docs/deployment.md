# Deployment configuration (local, staging, production)

Cette note prépare un déploiement réaliste d'EducLink sans imposer un provider cloud spécifique.

## 1) Variables d'environnement

| Variable | Requis | Valeurs / Exemple | Rôle |
| --- | --- | --- | --- |
| `NODE_ENV` | oui | `development`, `staging`, `production`, `test` | Mode runtime global (format logs par défaut, conventions d'exécution). |
| `PORT` | oui | `3000` | Port HTTP de l'app Node. |
| `EDUCLINK_PERSISTENCE` | oui | `memory`, `postgres` | Choix du backend de persistance. |
| `DATABASE_URL` | conditionnel | `postgres://user:pass@host:5432/educlink` | Requis uniquement si `EDUCLINK_PERSISTENCE=postgres`. |
| `LOG_LEVEL` | optionnel | `info`, `warn`, `error`, `debug` | Niveau de logs. |
| `LOG_FORMAT` | optionnel | `pretty`, `json` | Format de logs (`json` recommandé hors dev). |
| `STAGING_RUN_SEED` | optionnel (staging) | `true`, `false` | Si `true`, `npm run start:staging` lance aussi `npm run db:seed` après migration. |
| `NEXT_PUBLIC_APP_URL` | recommandé | `https://app.educlink.example` | URL publique front/admin pour les environnements déployés. |
| `API_URL` | recommandé | `https://api.educlink.example` | URL publique API pour clients externes/intégrations. |
| `DEFAULT_TENANT_SLUG` | optionnel | `demo-school` | Tenant par défaut pour certains flux de démonstration. |

> Les fichiers `.env.example`, `.env.staging.example` et `.env.production.example` servent de base de configuration.

## 2) Validation au démarrage

La config runtime est validée au lancement :

- `NODE_ENV`, `EDUCLINK_PERSISTENCE` et `LOG_FORMAT` sont contrôlés.
- `PORT` doit être un entier valide (1..65535).
- `DATABASE_URL` est obligatoire en mode `postgres`.

Si une variable critique est invalide/manquante, l'app échoue immédiatement avec un message explicite (`Invalid runtime configuration`).

## 3) Lancement local (développement)

```bash
cp .env.example .env
npm run start:dev
```

### Local avec PostgreSQL

```bash
docker compose -f docker-compose.db.yml up -d
EDUCLINK_PERSISTENCE=postgres DATABASE_URL=postgres://postgres:postgres@localhost:5432/educlink npm run db:migrate
EDUCLINK_PERSISTENCE=postgres DATABASE_URL=postgres://postgres:postgres@localhost:5432/educlink npm run db:seed
EDUCLINK_PERSISTENCE=postgres npm run start:dev
```

## 4) Configuration staging

1. Copier `.env.staging.example` et injecter les vraies valeurs (secrets via secret manager CI/CD).
2. Vérifier `EDUCLINK_PERSISTENCE=postgres` et `LOG_FORMAT=json`.
3. Lancer les migrations avant démarrage applicatif.
4. Démarrer l'app avec `npm run start:staging`.

Séquence recommandée :

```bash
npm ci
# start:staging force les defaults runtime staging, lance db:migrate,
# puis lance db:seed uniquement si STAGING_RUN_SEED=true.
npm run start:staging
```

### Vérification de santé staging

Un endpoint léger `/healthz` est exposé:

- `200` + `{"status":"ok", ...}` si le service est prêt.
- `503` + `{"status":"degraded", ...}` si la DB PostgreSQL n'est pas joignable.

Exemple:

```bash
curl -i http://localhost:3000/healthz
```

## 5) Configuration production

1. Copier `.env.production.example` (sans committer les secrets).
2. Forcer `NODE_ENV=production`, `EDUCLINK_PERSISTENCE=postgres`, `LOG_FORMAT=json`.
3. Exécuter `npm run db:migrate` avant le switch de trafic.
4. Démarrer avec `npm run start:prod`.

## 6) CI et déploiements futurs

- La CI existante continue de fonctionner : `DATABASE_URL` est déjà injecté dans le workflow.
- Les validations de config sont compatibles CI (`NODE_ENV=test` autorisé).
- Cette base reste neutre vis-à-vis de l'hébergeur (VM, container, PaaS) et peut être branchée à un déploiement automatisé plus tard.
