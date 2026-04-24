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

## 4) Déploiement staging (répétable)

Le script `scripts/deploy.sh` formalise la séquence de déploiement :

1. validation des variables critiques (`NODE_ENV`, `PORT`, `EDUCLINK_PERSISTENCE`, `DATABASE_URL`),
2. `npm ci`,
3. `npm run db:migrate`,
4. `npm run db:seed` uniquement si `--seed`,
5. affiche la commande de démarrage ou démarre avec `--start`.

Exemple (préparation sans démarrage) :

```bash
cp .env.staging.example .env.staging
set -a
source .env.staging
set +a
npm run deploy -- staging
```

Exemple (avec seed explicite + démarrage) :

```bash
npm run deploy -- staging --seed --start
```

> `start:staging` reste disponible. Il exécute migration + seed conditionnel via `STAGING_RUN_SEED=true` puis démarre l'app.

## 5) Déploiement production-like

Exemple (préparation sans démarrage) :

```bash
cp .env.production.example .env.production
set -a
source .env.production
set +a
npm run deploy -- production
```

Exemple (avec démarrage) :

```bash
npm run deploy -- production --start
```

Exemple (seed exceptionnel et explicite) :

```bash
npm run deploy -- production --seed
```

## 6) Santé, rollback et recovery (simple)

### Vérification de santé

Un endpoint léger `/healthz` est exposé:

- `200` + `{"status":"ok", ...}` si le service est prêt.
- `503` + `{"status":"degraded", ...}` si la DB PostgreSQL n'est pas joignable.

Exemple:

```bash
curl -i http://localhost:3000/healthz
```

### Rollback/recovery minimal

- En cas d'échec de migration pendant `deploy.sh`, le script s'arrête immédiatement (`set -euo pipefail`) avant démarrage de l'app.
- Revenir à la version applicative précédente et relancer `npm run deploy -- <env>` après correction DB/config.
- Les migrations SQL étant versionnées dans `packages/database/migrations`, la stratégie de rollback DB doit rester manuelle et explicitement validée par l'équipe avant exécution.

## 7) CI et déploiements futurs

- La CI existante continue de fonctionner : `DATABASE_URL` est déjà injecté dans le workflow.
- Les validations de config sont compatibles CI (`NODE_ENV=test` autorisé).
- Cette base reste neutre vis-à-vis de l'hébergeur (VM, container, PaaS) et peut être branchée à un déploiement automatisé plus tard.
