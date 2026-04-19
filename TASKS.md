# TASKS — EducLink

## Objectif

Découper le projet EducLink en lots clairs, priorisés et directement exploitables par une équipe produit / tech / IA ou par Codex.

---

## Légende

- P0 = critique MVP
- P1 = important post-MVP proche
- P2 = extension
- FE = frontend
- BE = backend
- DB = data
- IA = intelligence artificielle
- SEC = sécurité
- QA = tests

---

## EPIC 0 — Foundation & Project Setup

### P0-001 Initialiser le monorepo
- créer la structure `apps/`, `packages/`, `docs/`, `infra/`
- config TypeScript
- config lint / format
- config env example
- config CI initiale

### P0-002 Mettre en place le design system de base
- tokens UI
- composants bouton / input / card / modal / table
- layout dashboard
- navigation sidebar/topbar

### P0-003 Définir les conventions de code
- naming
- structure modules
- erreurs
- validations
- tests

### P0-004 Préparer la documentation produit et technique
- README
- PRD
- ARCHITECTURE
- TASKS
- conventions API

---

## EPIC 1 — Auth, Roles, Tenant

### P0-101 Implémenter l’authentification
- login
- logout
- reset password
- gestion session

### P0-102 Implémenter le modèle de rôles
- super_admin
- school_admin
- director
- teacher
- parent
- student
- accountant

### P0-103 Implémenter le multi-tenant
- modèle Tenant
- rattachement School → Tenant
- scoping requêtes
- protections anti-fuite

### P0-104 Créer les guards d’autorisation
- route guards
- API guards
- helper permissions

### P0-105 Ajouter audit logs sécurité
- connexions
- accès sensibles
- changements de rôles

---

## EPIC 2 — Référentiel Établissement

### P0-201 Créer le module School
- établissement
- paramètres
- branding minimal

### P0-202 Créer les années scolaires et périodes
- AcademicYear
- Term / Semester / Trimester

### P0-203 Créer niveaux, classes et matières
- GradeLevel
- ClassRoom
- Subject

### P0-204 Construire les écrans d’administration école
- CRUD niveaux
- CRUD classes
- CRUD matières

---

## EPIC 3 — Utilisateurs métier

### P0-301 Créer le module Teachers
- fiche enseignant
- matière(s)
- classe(s)
- statut

### P0-302 Créer le module Students
- fiche élève
- rattachement classe
- données administratives essentielles

### P0-303 Créer le module Parents
- fiche parent
- coordonnées
- statut accès portail

### P0-304 Implémenter le lien Parent ↔ Élève
- multi-enfant
- multi-responsable

### P0-305 Construire les écrans CRUD people
- liste
- détail
- création
- modification
- archivage logique

---

## EPIC 4 — Inscriptions / Affectations

### P1-401 Créer le module Enrollment
- inscription
- réinscription
- statut
- affectation classe

### P1-402 Écran admin de suivi des inscriptions
- filtres
- statuts
- affectations

---

## EPIC 5 — Attendance

### P0-501 Créer le modèle AttendanceRecord
- présence
- absence
- retard
- motif
- justification

### P0-502 Développer l’écran d’appel enseignant
- sélection classe
- liste élèves
- saisie rapide
- sauvegarde

### P0-503 Créer la vue absences pour l’administration
- liste quotidienne
- filtres
- détails

### P1-504 Notifications absence parent
- in-app
- email ensuite

### P1-505 Dashboard assiduité
- statistiques par élève / classe

---

## EPIC 6 — Cahier de texte / Devoirs

### P0-601 Créer le module LessonLog
- date
- classe
- matière
- contenu du cours

### P0-602 Créer le module Homework
- devoir
- échéance
- consignes
- pièce jointe optionnelle

### P0-603 Écran enseignant cahier de texte
- création
- historique
- filtrage

### P0-604 Vue parent / élève devoirs
- liste
- détail
- échéances

---

## EPIC 7 — Notes / Évaluations

### P0-701 Créer le module Assessment
- type
- date
- matière
- coefficient

### P0-702 Créer le module GradeEntry
- note
- observation
- élève
- évaluation

### P0-703 Écran de saisie des notes enseignant
- sélection classe
- grille de saisie
- sauvegarde en lot

### P0-704 Vue parent / élève des notes
- liste des notes
- moyenne par matière simple

### P1-705 Calcul de moyennes
- matière
- période
- générale

### P1-706 Préparer le socle bulletin
- agrégations
- appréciations

---

## EPIC 8 — Communication / Messagerie

### P0-801 Créer le module Messaging
- thread
- message
- audience
- statut lecture simple

### P0-802 Créer les annonces établissement
- annonces globales
- annonces ciblées

### P0-803 Interface messagerie enseignant / parent / admin
- boîte de réception
- fil
- envoi

### P1-804 Notifications liées aux messages
- badge
- email

---

## EPIC 9 — Documents

### P1-901 Créer le module Documents
- stockage metadata
- type de document
- lien sécurisé

### P1-902 Interface de dépôt / téléchargement
- admin
- enseignant
- parent selon droits

### P1-903 Catégoriser les documents
- administratif
- pédagogique
- bulletin
- reçu

---

## EPIC 10 — Finance

### P1-1001 Créer le modèle FeePlan
- frais inscription
- scolarité
- autres frais

### P1-1002 Créer le modèle Invoice
- échéance
- statut
- montant

### P1-1003 Créer le modèle Payment
- montant payé
- date
- mode
- référence

### P1-1004 Interface admin finance
- liste paiements
- impayés
- enregistrement paiement

### P1-1005 Vue parent finance
- solde
- historique
- échéances

### P2-1006 Génération reçu PDF
### P2-1007 Paiement en ligne

---

## EPIC 11 — Dashboards & Reporting

### P0-1101 Dashboard enseignant
- classes du jour
- appels à faire
- notes récentes
- devoirs

### P0-1102 Dashboard parent
- enfants
- absences
- notes
- devoirs
- messages

### P0-1103 Dashboard admin / direction basique
- effectif
- absences du jour
- notes à saisir
- paiements en attente

### P1-1104 KPIs avancés direction
- recouvrement
- moyennes par classe
- alertes

---

## EPIC 12 — IA

### P0-1201 Mettre en place l’abstraction provider IA
- service serveur
- config provider
- logging

### P0-1202 Génération d’appréciations
- input notes + observations
- output brouillon validable

### P0-1203 Résumé élève
- absences
- notes
- remarques
- synthèse courte

### P1-1204 Aide à rédaction de message parent
### P1-1205 Synthèse classe pour direction
### P2-1206 Détection élèves à risque
### P2-1207 OCR documents / copies

---

## EPIC 13 — Qualité, Sécurité, Tests

### P0-1301 Tests auth
### P0-1302 Tests rôles / permissions
### P0-1303 Tests multi-tenant
### P0-1304 Tests endpoints critiques
### P0-1305 Tests UI critiques

### P1-1306 Audit logs métier
### P1-1307 Monitoring erreurs
### P1-1308 Performance dashboards

---

## EPIC 14 — DevOps / Delivery

### P0-1401 Config CI
- lint
- tests
- build

### P0-1402 Config staging
### P0-1403 Config production
### P1-1404 Observabilité
### P1-1405 Sauvegarde / restauration

---

## Sprint suggéré MVP

### Sprint 1
- setup projet
- auth
- rôles
- tenant
- référentiel école

### Sprint 2
- students
- parents
- teachers
- CRUD métier

### Sprint 3
- attendance
- dashboard enseignant
- dashboard parent

### Sprint 4
- homework
- lesson log
- messaging

### Sprint 5
- assessments
- grades
- dashboard admin

### Sprint 6
- documents simples
- finance basique
- IA v1

### Sprint 7
- stabilisation
- tests
- sécurité
- polish UX

---

## Définition of Done

Une tâche est terminée si :
- le besoin métier est couvert
- les permissions sont respectées
- le tenant scoping est correct
- les validations sont en place
- les tests minimum existent
- l’UI est cohérente
- la doc est mise à jour si nécessaire
