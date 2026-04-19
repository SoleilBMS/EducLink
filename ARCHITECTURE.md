# ARCHITECTURE — EducLink

## 1. Objectif

Définir l’architecture technique et logique d’EducLink afin de construire un ERP scolaire SaaS multi-tenant, modulaire, sécurisé et scalable.

## 2. Principes fondateurs

- multi-tenant dès le départ
- séparation stricte des données par établissement
- architecture modulaire par domaine métier
- sécurité by design
- expérience mobile-first
- extensibilité fonctionnelle
- compatibilité avec un développement assisté par IA
- observabilité et traçabilité

## 3. Architecture globale

EducLink est structuré en plusieurs couches :

1. Interface utilisateur
2. API / services applicatifs
3. Domaine métier
4. Persistance des données
5. Services transverses
6. Intégrations externes
7. Couche IA

## 4. Vue logique

### 4.1 Frontend
Responsable de :
- l’interface utilisateur
- la navigation par rôle
- la consommation de l’API
- les formulaires
- les dashboards
- les workflows métier

Technologies recommandées :
- Next.js
- TypeScript
- Tailwind CSS
- librairie de composants interne

### 4.2 Backend applicatif
Responsable de :
- l’authentification
- l’autorisation
- les endpoints métier
- les validations
- les workflows métier
- les intégrations
- les traitements IA
- l’audit log

Approche recommandée :
- architecture modulaire par domaines
- services métier découplés
- séparation controller / service / repository

### 4.3 Base de données
Responsable de :
- la persistance métier
- l’intégrité des données
- la séparation tenant
- l’historisation sélective

Technologie recommandée :
- PostgreSQL

### 4.4 Stockage documentaire
Responsable de :
- stockage des pièces jointes
- bulletins
- documents administratifs
- devoirs / ressources
- exports PDF

### 4.5 Couche IA
Responsable de :
- génération d’appréciations
- synthèses élèves
- aide à rédaction
- détection de signaux faibles
- prompts versionnés
- observabilité des usages IA

## 5. Modèle d’architecture applicative

### 5.1 Organisation par domaines

Le système doit être découpé par bounded contexts simples :

- identity
- tenants
- schools
- academics
- users
- students
- parents
- teachers
- enrollments
- attendance
- homework
- grading
- report_cards
- messaging
- documents
- finance
- notifications
- analytics
- ai_assistant

Chaque domaine contient :
- types / schémas
- règles métier
- services
- repository
- endpoints
- tests

## 6. Multi-tenant

## 6.1 Principe
Chaque établissement est un tenant logique.

Toutes les données doivent être filtrées par :
- tenant_id
- rôle utilisateur
- permissions contextuelles

## 6.2 Exigences
- aucune fuite inter-établissement
- scoping obligatoire sur toutes les requêtes
- tests de sécurité tenant
- audit des accès sensibles

## 7. Authentification et autorisation

## 7.1 Authentification
Fonctionnalités :
- login email / mot de passe
- reset password
- gestion session
- éventuellement MFA plus tard

## 7.2 Autorisation
RBAC minimum avec règles métier contextuelles.

Rôles :
- super_admin
- school_admin
- director
- teacher
- parent
- student
- accountant

Exemples :
- un parent ne voit que ses enfants
- un enseignant ne voit que ses classes / matières
- un admin école voit uniquement son établissement
- un super admin voit toute la plateforme

## 8. Modules fonctionnels

## 8.1 Identity
Responsable de :
- users
- auth
- sessions
- password reset
- roles

## 8.2 Tenant / School
Responsable de :
- tenant
- school
- campus éventuels
- branding
- paramètres établissement

## 8.3 Academics
Responsable de :
- academic years
- terms
- grade levels
- classes
- subjects
- timetables plus tard

## 8.4 People
Sous-domaines :
- students
- parents
- teachers
- administrative staff

## 8.5 Enrollment
Responsable de :
- inscriptions
- affectations
- réinscriptions
- statut dossier

## 8.6 Attendance
Responsable de :
- appels
- absences
- retards
- motifs
- justificatifs
- alertes

## 8.7 Homework / Lesson Log
Responsable de :
- cahier de texte
- devoirs
- supports pédagogiques

## 8.8 Grading
Responsable de :
- évaluations
- notes
- coefficients
- moyennes
- appréciations

## 8.9 Report Cards
Responsable de :
- bulletins
- agrégation des résultats
- génération PDF plus tard

## 8.10 Messaging
Responsable de :
- messages internes
- annonces
- fil de conversation
- messages ciblés

## 8.11 Documents
Responsable de :
- pièces jointes
- documents administratifs
- exports
- stockage sécurisé

## 8.12 Finance
Responsable de :
- frais
- échéanciers
- factures
- paiements
- relances
- reçus

## 8.13 Notifications
Responsable de :
- notifications in-app
- email
- SMS/WhatsApp plus tard

## 8.14 Analytics
Responsable de :
- dashboards
- indicateurs par rôle
- agrégations métier

## 8.15 AI Assistant
Responsable de :
- prompts
- orchestration IA
- journalisation IA
- génération assistée
- garde-fous métier

## 9. Modèle de données de haut niveau

Entités principales :
- Tenant
- School
- User
- Role
- UserRoleAssignment
- AcademicYear
- Term
- GradeLevel
- ClassRoom
- Subject
- Student
- Parent
- Teacher
- StudentParentLink
- Enrollment
- AttendanceRecord
- LessonLog
- Homework
- Assessment
- GradeEntry
- ReportCard
- MessageThread
- Message
- Document
- FeePlan
- Invoice
- Payment
- Notification
- AuditLog
- AIRequest
- AIResult

## 10. Conventions d’API

### 10.1 Principes
- endpoints par domaine
- payloads strictement validés
- réponses normalisées
- pagination sur les listes
- filtres explicites
- erreurs cohérentes

### 10.2 Exemples de namespaces
- `/api/auth/*`
- `/api/schools/*`
- `/api/classes/*`
- `/api/students/*`
- `/api/parents/*`
- `/api/teachers/*`
- `/api/attendance/*`
- `/api/homework/*`
- `/api/grades/*`
- `/api/messages/*`
- `/api/finance/*`
- `/api/ai/*`

## 11. UI / App structure

### 11.1 Layouts par rôle
- super admin layout
- school admin layout
- director layout
- teacher layout
- parent layout
- student layout
- accountant layout

### 11.2 Pages principales
- login
- dashboard
- school settings
- classes
- students
- teachers
- parents
- attendance
- homework
- grades
- messages
- documents
- finance
- reports
- ai assistant

## 12. Sécurité

### 12.1 Exigences
- isolation stricte par tenant
- contrôle d’accès sur chaque endpoint
- validation de tous les inputs
- audit logs sur actions sensibles
- protection contre exposition de documents
- URLs de fichiers sécurisées
- journalisation des opérations administratives

### 12.2 Actions sensibles
- création / suppression utilisateur
- changement de rôle
- consultation documents sensibles
- enregistrement paiements
- génération IA sur données élève
- export de données

## 13. Observabilité

- logs applicatifs
- logs sécurité
- audit métier
- métriques API
- métriques usage produit
- suivi des erreurs frontend/backend
- suivi des appels IA

## 14. IA — principes techniques

### 14.1 Règles
- aucun appel IA direct depuis l’UI
- passer par une couche serveur
- prompts versionnés
- journalisation input/output selon politique de confidentialité
- capacité de désactiver l’IA par tenant
- validation humaine pour les sorties sensibles

### 14.2 Cas d’usage MVP
- générer une appréciation
- résumer le suivi d’un élève
- aider à rédiger un message parent
- synthèse de classe

## 15. Environnements

- local
- preview / staging
- production

Variables d’environnement :
- database
- auth
- storage
- email
- notification
- ai provider
- monitoring

## 16. Stratégie de développement

### 16.1 Monorepo recommandé
Pour mutualiser :
- composants UI
- types partagés
- logique métier partagée
- configs

### 16.2 Approche incrémentale
1. socle auth + tenant
2. référentiel école
3. modules cœur scolaire
4. finance et docs
5. IA
6. optimisation et scale

## 17. Tests

### 17.1 Types de tests
- unit tests
- integration tests
- access control tests
- tenant isolation tests
- end-to-end tests
- tests de non-régression sur permissions

### 17.2 Priorités test
- auth
- permissions
- tenant scoping
- attendance
- grading
- finance
- AI guardrails

## 18. Décisions d’architecture à figer rapidement

- choix exact backend : fullstack Next.js ou frontend + API séparée
- stratégie auth
- stratégie stockage documents
- ORM / data access
- moteur de notifications
- provider IA
- structure du tenant scoping

## 19. Principe final

EducLink doit être construit comme un produit SaaS robuste, simple à faire évoluer, et suffisamment clair pour être développé efficacement par une équipe humaine assistée d’agents IA.
