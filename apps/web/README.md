# apps/web

Prototype web minimal pour valider le socle auth + RBAC/tenant (issues #2 et #3).

## Fonctionnalités disponibles

- `GET /login` : page de connexion
- `POST /login` : création de session (`userId`, `role`, `tenantId`)
- `GET /dashboard` : route protégée
- `POST /logout` : destruction de session
- `GET /forgot-password` : page placeholder
- `GET /reset-password` : endpoint placeholder (`501 not_implemented`)

## API protégée (RBAC + tenant)

- `GET /api/v1/classes`
  - `super_admin` : toutes les classes
  - `school_admin`, `director` : classes du tenant uniquement
  - `teacher` : classes affectées uniquement
  - autres rôles : refus
- `GET /api/v1/students/:id`
  - parent : seulement enfant lié
  - teacher : seulement élève d'une classe affectée
  - `school_admin`, `director` : tenant uniquement
  - `super_admin` : accès global contrôlé

## Lancer localement

```bash
node apps/web/src/server.js
```

Puis ouvrir `http://localhost:3000/login`.

## Comptes de démonstration

- super admin: `superadmin@platform.test`
- school admin: `admin@school-a.test`
- teacher: `teacher@school-a.test`
- parent: `parent@school-a.test`
- mot de passe (tous): `password123`

## Suite smoke E2E

La suite smoke E2E est volontairement HTTP-level (sans navigateur) pour rester rapide, déterministe et alignée avec l'architecture modulaire actuelle.

### Exécution locale

```bash
npm run test:e2e:smoke
```

### Positionnement dans la stratégie de tests

- `npm test` : couverture unitaire/intégration existante (large et exhaustive)
- `npm run test:e2e:smoke` : parcours critiques de bout en bout pour readiness pilote

### Prérequis

- Node.js `>=20`
- Aucun service externe requis par défaut (les tests démarrent leur propre serveur sur port éphémère)

### Exemple CI

```bash
npm ci
npm run lint
npm test
npm run test:e2e:smoke
```
