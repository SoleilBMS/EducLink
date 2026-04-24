# Persistence layer (v0.1.0-alpha hardening)

Cette PR introduit une **première couche durable PostgreSQL** sans forcer une migration massive.

## Choix techniques

- Base de données : **PostgreSQL**.
- Query layer : `pg` (léger, explicite, facile à maintenir dans ce codebase JS simple).
- Migrations : SQL versionné + runner Node (`packages/database/src/migrate.js`).

## Stratégie de coexistence (transition contrôlée)

- Mode local/dev par défaut : `EDUCLINK_PERSISTENCE=memory`.
- Mode pilot/staging/production : `EDUCLINK_PERSISTENCE=postgres`.
- Dans cette phase, la persistance réelle est branchée en priorité sur les domaines API cœur:
  - `students`, `parents`, `teachers`
  - `attendance`, `grading`, `messaging`, `finance`
  - dépendances structurelles `class_rooms` et `subjects`.
- Le mode mémoire est conservé **uniquement** pour les tests unitaires, les tests historiques non migrés, et le dev local explicite.
- Il n'existe plus de fallback silencieux de `postgres` vers `memory`.

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

# 3) optionnel: charger le seed pilot-ready (demo + staging + smoke tests)
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

## Validation runtime (fail fast)

- Si `EDUCLINK_PERSISTENCE=postgres`, `DATABASE_URL` est obligatoire.
- Si `NODE_ENV=staging` ou `NODE_ENV=production`, `EDUCLINK_PERSISTENCE` doit être `postgres`.
- En mode `postgres`, le serveur vérifie la connectivité DB au démarrage (`SELECT 1`) et s'arrête si la connexion échoue.

## Limites assumées

- Persistance Postgres branchée en priorité sur les endpoints API (mode web historique inchangé tant que non migré explicitement).
- Pas d'ORM pour l'instant (garder le socle léger).
- Pas de rollback automatique des migrations (forward-only pour cette phase).


## Seed pilot-ready

Le script `npm run db:seed` insère un jeu de données réaliste et multi-tenant, compatible avec le flux PostgreSQL actuel:

- `school-a` (principal): classes, matières, élèves, parents, liens parent/enfant, enseignants (affectations classes+matières), attendance, évaluations, notes, annonces, threads/messages, plans de frais, factures et paiements.
- `school-b` (léger): structure miroir minimale pour vérifier l'isolation tenant en demo et en smoke tests.

Le seed est idempotent (`ON CONFLICT DO NOTHING`) pour rester sûr en local/CI.
