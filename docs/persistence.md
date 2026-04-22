# Persistence layer (v0.1.0-alpha hardening)

Cette PR introduit une **première couche durable PostgreSQL** sans forcer une migration massive.

## Choix techniques

- Base de données : **PostgreSQL**.
- Query layer : `pg` (léger, explicite, facile à maintenir dans ce codebase JS simple).
- Migrations : SQL versionné + runner Node (`packages/database/src/migrate.js`).

## Stratégie de coexistence (transition)

- Mode par défaut : `EDUCLINK_PERSISTENCE=memory` (MVP inchangé).
- Mode transition : `EDUCLINK_PERSISTENCE=postgres`.
- Dans cette phase, la persistance réelle est branchée sur le **slice students API**:
  - lecture/écriture élèves (`students`)
  - dépendance structurelle minimale (`class_rooms`) pour conserver le tenant scoping et les références.
- Les autres modules restent sur les stores en mémoire, volontairement, pour limiter le risque.

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

## Limites assumées de cette PR

- Pas de migration complète de tous les domaines.
- Pas d'ORM pour l'instant (garder le socle léger).
- Pas de rollback automatique des migrations (forward-only pour cette phase).
