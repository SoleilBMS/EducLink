# Persistence layer (v0.1.0-alpha hardening)

Cette PR introduit une **première couche durable PostgreSQL** sans forcer une migration massive.

## Choix techniques

- Base de données : **PostgreSQL**.
- Query layer : `pg` (léger, explicite, facile à maintenir dans ce codebase JS simple).
- Migrations : SQL versionné + runner Node (`packages/database/src/migrate.js`).

## Stratégie de coexistence (transition)

- Mode par défaut : `EDUCLINK_PERSISTENCE=memory` (MVP inchangé).
- Mode transition : `EDUCLINK_PERSISTENCE=postgres`.
- Dans cette phase, la persistance réelle est branchée en priorité sur les domaines API cœur:
  - `students`, `parents`, `teachers`
  - `attendance`, `grading`, `messaging`, `finance`
  - dépendances structurelles `class_rooms` et `subjects`.
- Le mode mémoire est conservé comme fallback pour limiter le risque de rollout.

## Tenant scoping

Le scoping est assuré à deux niveaux :

1. applicatif : toutes les requêtes repository filtrent par `tenant_id`.
2. schéma : contraintes/indices par tenant (`tenant_id`, unique `(tenant_id, admission_number)`).

## Local setup rapide

```bash
# 1) démarrer postgres local
docker compose -f docker-compose.db.yml up -d

# 2) appliquer les migrations
EDUCLINK_PERSISTENCE=postgres DATABASE_URL=postgres://postgres:postgres@localhost:5432/educlink npm run db:migrate

# 3) optionnel: charger un seed minimal
EDUCLINK_PERSISTENCE=postgres DATABASE_URL=postgres://postgres:postgres@localhost:5432/educlink npm run db:seed

# 4) lancer l'app en mode postgres
EDUCLINK_PERSISTENCE=postgres DATABASE_URL=postgres://postgres:postgres@localhost:5432/educlink node apps/web/src/server.js
```

## CI (migrations)

Le workflow CI démarre un service PostgreSQL puis exécute `npm run db:migrate` pour vérifier la stratégie de migration.

## CI (tests PostgreSQL)

- `npm test` reste le périmètre de référence en mode mémoire (fixtures/journeys historiques).
- `npm run test:postgres` exécute uniquement `apps/web/src/server.postgres.test.js`, qui contient aujourd'hui les scénarios explicitement validés contre PostgreSQL.
- Les autres tests de parcours web/API continueront d'être migrés vers des fixtures PostgreSQL dédiées avant d'être ajoutés à ce périmètre.

## Limites assumées

- Persistance Postgres branchée en priorité sur les endpoints API (mode web historique inchangé tant que non migré explicitement).
- Pas d'ORM pour l'instant (garder le socle léger).
- Pas de rollback automatique des migrations (forward-only pour cette phase).
