# EducLink

EducLink est un ERP scolaire SaaS nouvelle génération pour les écoles privées, pensé pour le marché algérien puis africain.

Le produit combine :
- la communication école ↔ parents inspirée de TouteMonAnnée,
- la gestion pédagogique et administrative inspirée de Pronote,
- une couche IA pour assister les équipes, automatiser certaines tâches et améliorer le suivi scolaire.

## Vision

EducLink vise à devenir le cockpit digital des écoles privées :
- administration,
- direction,
- enseignants,
- parents,
- élèves,
- finance.

Chaque acteur dispose d’un espace dédié dans une plateforme unique, moderne, simple et mobile-first.

## Proposition de valeur

EducLink = **Pronote + TouteMonAnnée + IA**

Avec EducLink, une école privée peut :
- centraliser sa gestion scolaire,
- fluidifier la communication avec les familles,
- améliorer le suivi pédagogique,
- suivre les paiements et documents,
- bénéficier d’outils IA concrets et utiles.

## Cibles

- Écoles privées
- Directions d’établissement
- Administrations scolaires
- Enseignants
- Parents d’élèves
- Élèves
- Services comptables / financiers

## Fonctionnalités principales

### Administration scolaire
- gestion des établissements
- années scolaires
- niveaux / classes / matières
- élèves / parents / enseignants
- inscriptions et réinscriptions
- documents administratifs

### Pédagogie
- appel / absences / retards
- cahier de texte
- devoirs
- saisie des notes
- appréciations
- bulletins

### Communication
- messagerie interne
- annonces établissement
- notifications ciblées
- espace parents

### Finance
- frais de scolarité
- échéanciers
- paiements
- reçus
- impayés
- relances

### IA
- génération d’appréciations
- résumé du suivi élève
- aide à rédaction des messages
- alertes pédagogiques
- synthèses administratives

## MVP

Le MVP inclut :
- authentification multi-rôles
- gestion établissements / classes / matières
- fiches élèves / parents / enseignants
- absences / retards
- cahier de texte
- devoirs
- notes
- messagerie / annonces
- documents simples
- finance basique
- tableau de bord par rôle
- premières fonctionnalités IA


## Implémentation actuelle (socle métier école)

Le prototype backend expose maintenant un référentiel établissement minimal multi-tenant :
- `School`
- `AcademicYear`
- `Term`
- `GradeLevel`
- `ClassRoom`
- `Subject`

Endpoints CRUD JSON :
- `GET/POST /api/v1/schools`
- `GET/PUT/DELETE /api/v1/schools/:id`
- `GET/POST /api/v1/academic-years`
- `GET/PUT/DELETE /api/v1/academic-years/:id`
- `GET/POST /api/v1/terms`
- `GET/PUT/DELETE /api/v1/terms/:id`
- `GET/POST /api/v1/grade-levels`
- `GET/PUT/DELETE /api/v1/grade-levels/:id`
- `GET/POST /api/v1/class-rooms`
- `GET/PUT/DELETE /api/v1/class-rooms/:id`
- `GET/POST /api/v1/subjects`
- `GET/PUT/DELETE /api/v1/subjects/:id`

Écran admin simple :
- `GET /admin/core-structure`

Règles d'accès :
- `school_admin` : lecture + écriture
- `director` : lecture seule
- `super_admin` : accès global avec `tenantId` explicite sur les appels API

## Structure documentaire du repo

- `PRD.md` : Product Requirements Document complet
- `ARCHITECTURE.md` : architecture technique et logique
- `TASKS.md` : backlog global et plan d’exécution
- `docs/` : documentation métier, UX, API, data model
- `apps/` : applications frontend / backend
- `packages/` : packages partagés
- `infra/` : infrastructure et déploiement

## Stack recommandée

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- composants UI réutilisables

### Backend
- Next.js API Routes ou backend dédié
- TypeScript
- architecture modulaire par domaine

### Data
- PostgreSQL
- ORM ou client typé
- stockage de documents

### Auth / sécurité
- authentification sécurisée
- RBAC
- multi-tenant strict
- audit logs

### IA
- couche provider abstraite
- prompts versionnés
- validation humaine des sorties sensibles

## Principes d’architecture

- SaaS multi-tenant
- séparation stricte des données par établissement
- design modulaire
- API claire
- traçabilité
- sécurité par défaut
- mobile-first

## Rôles

- super_admin
- school_admin
- director
- teacher
- parent
- student
- accountant

## Priorités produit

### P0
- auth et rôles
- structure établissement
- élèves / parents / enseignants
- absences
- notes
- devoirs
- messagerie
- dashboards de base

### P1
- finance
- documents
- bulletins
- onboarding école

### P2
- emploi du temps
- admission en ligne
- mobile app
- IA avancée
- paiements en ligne
- OCR

## Objectif engineering

Construire un socle robuste, extensible et exploitable par des agents IA de développement comme Codex, en fournissant :
- une documentation claire,
- une architecture cohérente,
- des tâches bien découpées,
- des user stories actionnables.

## Conventions de travail

- chaque fonctionnalité doit être liée à un domaine métier
- chaque PR doit rester petite et ciblée
- toute logique de permissions doit être testée
- toute donnée exposée doit être filtrée par tenant et par rôle
- les composants UI doivent être réutilisables
- les features IA doivent être optionnelles, auditables et validables humainement

## Roadmap initiale

### Phase 1
Socle plateforme :
- auth
- rôles
- multi-tenant
- référentiel établissement

### Phase 2
Cœur scolaire :
- élèves / parents / enseignants
- absences
- notes
- devoirs
- messages

### Phase 3
Gestion étendue :
- documents
- finance
- dashboards
- bulletins

### Phase 4
Différenciation IA :
- appréciations
- synthèses
- assistance messages
- alertes

## Ambition

Faire d’EducLink la référence du digital scolaire privé en Algérie puis en Afrique francophone.

---

## Persistance PostgreSQL (phase hardening)

Une couche de persistance durable est maintenant disponible en mode transition.

- Mode défaut: `EDUCLINK_PERSISTENCE=memory` (comportement MVP actuel).
- Mode DB: `EDUCLINK_PERSISTENCE=postgres` + `DATABASE_URL`.
- Migrations SQL versionnées: `packages/database/migrations`.
- Commandes:
  - `npm run db:migrate`
  - `npm run db:seed`

Voir `docs/persistence.md` pour le setup local complet, la stratégie tenant, et la coexistence mémoire/DB.


## Configuration d'environnement & déploiement

Le repo inclut maintenant des bases de configuration explicites :

- `.env.example` (base locale/dev)
- `.env.staging.example`
- `.env.production.example`

Scripts de démarrage :

- `npm run start`
- `npm run start:dev`
- `npm run start:staging`
- `npm run start:prod`

La configuration runtime est validée au démarrage (port, mode de persistance, format de logs, présence de `DATABASE_URL` en mode postgres).

Voir `docs/deployment.md` pour le guide local/staging/production.

## Démonstration produit (seed data + onboarding)

Un parcours de démonstration enrichi est disponible avec:

- seed data réalistes sur le tenant principal `school-a`
- comptes de démo multi-rôles (admin, teacher, parent, student, accountant, director)
- walkthrough intégré dans l'application: `/demo`

Documentation courte:

- `docs/demo-walkthrough.md`
