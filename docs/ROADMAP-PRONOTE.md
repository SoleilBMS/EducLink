# ROADMAP — Rapprochement PRONOTE

**Objectif :** rapprocher EducLink du périmètre fonctionnel PRONOTE (référence du marché en France, 8 400 lycées/collèges, 18M utilisateurs) **sans perdre l'avantage différenciant** (IA, mobile-first, marché AFR francophone, simplicité multi-tenant).

**Principe :** on garde tout ce qui tourne aujourd'hui (Sprints 1-7), on **étend** par modules ciblés. On **ne copie pas** les modules FR-only (Parcoursup, LSU, Maileva).

**Source d'analyse :** plaquette commerciale officielle PRONOTE (novembre 2025) + site index-education.com + audit du code EducLink courant.

---

## 1. Cartographie PRONOTE de référence

### 1.1 Vie scolaire
- Feuille d'appel **enrichie** : absences, retards, passages infirmerie, punitions, encouragements, sanctions (un seul écran)
- Tableau de bord CPE **temps réel** : liste absents jour, exclus, appels non faits, convocations
- Parent **prévient une absence** + transmet justificatif depuis son espace
- Stats absences/retards avec **seuils d'alerte** + graphes
- Décompte **heures de cours manquées**
- Comptage repas cantine/internat selon présences

### 1.2 Pédagogie
- Cahier de textes partagé inter-profs (charge de travail visible)
- Devoirs : dépôt photo mobile par élève, correction annotée par prof
- Manuels numériques intégrés (insertion contenu/exercice)
- **6 000 QCM bibliothèque collaborative** (en plus des QCM créés par l'établissement)
- Accompagnement élèves besoins particuliers (**PAP/PAI/PPS**)
- **Co-enseignement** (plusieurs profs sur un cours)
- Casier numérique : ressources partagées entre profs

### 1.3 Évaluations / Bulletins
- Notes **ou** compétences (au choix par établissement)
- Coefficients, bonus, arrondis paramétrables
- Choix des évaluations prises en compte pour positionnement
- Bulletins très configurables
- Graphes & simulations pour **conseils de classe**
- Évolution multi-trimestres / multi-années
- **🎯 Détection décrocheurs** : croisement résultats + absences + retards + comportement + infirmerie + seuils personnalisés (PDF p.3)
- Remontée applications nationales LSU (FR-only)

### 1.4 Communication
- Messagerie interne sécurisée
- Sondages ciblés
- Agenda partagé + prise de **rendez-vous parents-profs**
- Forums collaboratifs
- **Plages de déconnexion** enseignant (RGPD)
- Annonces établissement
- Publipostage **Maileva** (courriers papier, FR-only)
- **SMS** sortants
- **Application mobile native** + push

### 1.5 Orientation / Stages
- Module stages : offres, conventions, suivi
- Espace tuteur entreprise
- Orientation **Parcoursup** (FR-only)

### 1.6 Administration
- **Élections représentants parents** en ligne (conforme arrêté FR 2 avril 2024)
- **Signature électronique multi-parties** (parents, école, entreprise) — service certifié, facturation au document
- **Module harcèlement** : bouton SOS app mobile + suivi cas (programme Phare FR)
- Conseils de classe

### 1.7 Logistique
- Emploi du temps **temps réel** : annulations, séances exceptionnelles, changements salle
- Réservation salles + matériels depuis l'EDT
- Demandes de **travaux / maintenance** (intendance)

### 1.8 Sécurité / Conformité
- Qualifié **SecNumCloud** (ANSSI)
- Données stockées et exploitées en France
- Code PIN (authentification rapide)
- Notifications de connexion nouvel appareil (CNIL)
- Centre cyberdéfense dédié

---

## 2. État actuel EducLink (Sprints 1-7 livrés)

| Domaine | EducLink (validé code + tests) |
|---|---|
| Auth | 7 rôles, multi-tenant, bcrypt, sessions HMAC, CSRF, throttling, headers sécu |
| Référentiel | tenants, écoles, années, trimestres, niveaux, classes, matières (CRUD UI) |
| Acteurs | fiches élèves/parents/profs + archivage + lien parent-enfant |
| Présences | appel enseignant + visualisation admin (basique) |
| Pédagogie | cahier de textes + devoirs (sans dépôt élève) |
| Évaluations | évaluations + notes + bulletins HTML (moyennes matière + générale) |
| Communication | messagerie + annonces ciblées |
| Finance | plans de frais, factures, paiements |
| IA | génération brouillon appréciations |
| Dashboards | 6 par rôle |
| Obs | audit logs, healthz, Postgres + migrations, Railway-ready |

---

## 3. Matrice gap — Faisabilité

Légende : 🟢 1-3j · 🟡 ~1 sem · 🟠 2-4 sem · 🔴 module entier >1 mois

### 3.1 Vie scolaire (gros gap, prioritaire pilote)

| Manquant | Effort | Module impacté |
|---|---|---|
| Feuille d'appel enrichie (retards, infirmerie, observations, sanctions) | 🟢 | [attendance.js](../apps/web/src/modules/attendance.js) |
| Tableau de bord CPE/vie scolaire temps réel | 🟡 | nouveau dashboard agrégé |
| Parent prévient absence + dépose justificatif | 🟡 | [parent.js](../apps/web/src/modules/parent.js) + workflow validation |
| Justificatifs scannés (upload PDF/photo) | 🟢 | stockage documents existant |
| Sanctions / punitions / observations comportement | 🟡 | nouveau module `discipline` |
| Stats absentéisme + seuils alerte + graphes | 🟡 | analytics enrichi |
| Décompte heures cours manquées | 🟢 | dépend EDT |
| Infirmerie : passages, dispenses, traitements | 🟡 | nouveau rôle `nurse` + module léger |
| Comptage repas cantine/internat | 🟢 | module `meals` simple |

### 3.2 Pédagogie

| Manquant | Effort |
|---|---|
| Dépôt devoirs élève (fichier + photo) | 🟡 |
| Correction annotée + retour copies | 🟠 |
| QCM créés par profs + passés par élèves (auto-corrigés) | 🟠 — gros différenciateur |
| Bibliothèque QCM partagée intra-tenant (puis inter) | 🟠 |
| Compétences (en plus des notes) | 🟡 |
| Bonus / coefficients personnalisés / arrondis | 🟢 |
| Suivi PAP/PAI/PPS (besoins particuliers) | 🟡 |
| Co-enseignement (2 profs / cours) | 🟢 |
| Casier numérique prof↔prof | 🟡 |

### 3.3 Évaluations / Bulletins

| Manquant | Effort |
|---|---|
| **Export PDF bulletin** (BULL-04 reporté) | 🟢 — `pdfkit` ou `puppeteer` |
| Graphes & simulations conseils de classe | 🟡 |
| Évolution multi-trimestres / multi-années | 🟡 |
| **🎯 Détection décrocheurs multi-critères** | 🟡 — **killer feature à porter via votre IA** |

### 3.4 Communication

| Manquant | Effort |
|---|---|
| Sondages ciblés | 🟡 |
| Agenda partagé + prise de RDV parents-profs | 🟡 |
| Forums collaboratifs | 🟡 |
| Plages de déconnexion enseignant | 🟢 |
| **App mobile native (push)** | 🔴 — passer par PWA d'abord |
| **WhatsApp Business** (choix marché AFR) | 🟡 — provider Meta |
| SMS sortants | 🟡 — provider local Algérie |

### 3.5 Orientation / Stages

| Manquant | Effort |
|---|---|
| Module stages (offres, conventions, suivi, espace tuteur) | 🟠 |
| Parcoursup | ❌ **NE PAS COPIER** — adapter à BAC/BEM Algérie plus tard |

### 3.6 Administration

| Manquant | Effort | Pertinence AFR |
|---|---|---|
| Signature électronique multi-parties | 🟠 | Forte (gain temps énorme) |
| Élections représentants parents | 🟡 | Moyenne (selon règlement école) |
| **Module harcèlement / SOS** + suivi cas | 🟡 | **Forte** (différenciateur éthique) |
| Conseils de classe (PV, votes, décisions) | 🟡 | Forte (manque dans EducLink) |

### 3.7 Logistique

| Manquant | Effort |
|---|---|
| EDT complet (classe/prof/élève/salle) | 🔴 — V2 confirmé PRD |
| EDT temps réel + notifs | 🟠 — après EDT base |
| Réservation salles + matériels | 🟡 |
| Demandes travaux / maintenance | 🟡 |

### 3.8 Sécurité

| Manquant | Effort |
|---|---|
| MFA / TOTP | 🟡 |
| Code PIN (rapide mobile) | 🟢 |
| Notifications connexion nouvel appareil (CNIL) | 🟡 |
| Backups Postgres planifiés (OPS-07) | 🟢 — déjà dans TASKS.md |

---

## 4. Roadmap Sprints 8-12

### Sprint 8 — Vie scolaire enrichie (2 semaines) ⭐ **EN COURS**
**Objectif :** que le CPE/admin puisse piloter la vie scolaire au quotidien comme dans PRONOTE.

- ✅ VS-01 — Feuille d'appel enrichie (retards, infirmerie, observations, sanctions, encouragements) — statut `excused` ajouté, table `attendance_events` (4 types), routes POST teacher/admin, vues fiche élève + admin attendance enrichies, 12 tests unitaires + 9 tests HTTP
- ✅ VS-02 — Dashboard vie scolaire `/admin/vie-scolaire` (admin/director) — 5 cards agrégées (absents jour, retards, appels non faits, notices à valider, événements jour) avec filtre date + classe, lien nav dédié, 8 tests HTTP
- ✅ VS-03 — Parent prévient absence + upload justificatif — table `absence_notices` (statut pending/approved/rejected, BYTEA pour le doc 3 Mo max PDF/PNG/JPG), helper `multipart.js` (busboy), 5 routes `/parent/absences*`, section "Absences déclarées" dans fiche élève admin, 13 tests unitaires + 6 tests multipart + 12 tests HTTP
- ✅ VS-04 — Workflow validation justificatifs admin — migration 007 (3 colonnes `reviewed_by_user_id`/`reviewed_at`/`review_comment`), méthode `review()` sur store + repo Postgres, page `/admin/absences` + détail avec actions approve/reject (motif obligatoire), sync `attendance_records` status=`excused` pour chaque jour de la période (réutilise `upsertForClass` avec le 1er teacher de la classe), badge "X en attente" dynamique dans nav admin/director, 8 tests unitaires + 12 tests HTTP (~327/327 OK avec lint)
- ✅ VS-05 — Module discipline — table `discipline_records` (migration 008) avec 4 types (observation, retenue, exclusion, convocation parents), routes admin/teacher/parent (`/admin/discipline`, `/teacher/discipline`, `/parent/discipline`, `/discipline/:id/delete`), section dans fiche élève admin + teacher (avec mini formulaire de saisie), 6e card dans dashboard VS-02, 14 tests unitaires + 12 tests HTTP
- VS-06 — Stats absentéisme + seuils d'alerte (top 10 élèves les plus absents, retards récurrents)
- VS-07 — **Détection décrocheurs IA** : agrège notes + absences + retards + sanctions, classe les élèves par niveau de risque, génère synthèse pour CPE

### Sprint 9 — Bulletins pro + Export PDF (1 semaine)
- BULL-04 — Export PDF bulletin (reporté Sprint 5)
- BULL-05 — Compétences (option par établissement)
- BULL-06 — Bonus / arrondis configurables
- BULL-07 — Graphes évolution trimestre par trimestre

### Sprint 10 — Communication enrichie + Mobile (3 semaines)
**Canal prioritaire choisi : WhatsApp Business API.**

- COM-01 — Sondages ciblés (parents/élèves/profs)
- COM-02 — Agenda partagé + prise de RDV parents-profs
- COM-03 — Plages de déconnexion enseignant
- COM-04 — **Intégration WhatsApp Business API** (notifications absences, messages école → parents)
- COM-05 — Templates messages WhatsApp validés (Meta Business)
- COM-06 — PWA installable (manifest + service worker + push web) — alternative app native

### Sprint 11 — Différenciateurs PRONOTE (2 semaines)
- ADM-01 — Module harcèlement / SOS (bouton + workflow référents + suivi cas)
- ADM-02 — Conseils de classe (PV, décisions, signatures)
- ADM-03 — Signature électronique conventions (provider à choisir : Yousign, DocuSign, ou souverain AFR)
- ADM-04 — Réservation salles + matériels
- ADM-05 — Demandes de travaux / maintenance (rôle intendant)

### Sprint 12 — Module EDT V2 (4-6 semaines)
- EDT-01 — Modèle de données créneaux / salles / disponibilités
- EDT-02 — Saisie EDT par classe / prof / salle (sans génération auto)
- EDT-03 — Visualisation EDT temps réel par rôle
- EDT-04 — Annulations / déplacements + notification automatique
- EDT-05 — Décompte heures de cours manquées rattaché aux absences

---

## 5. À NE PAS copier de PRONOTE

| Module FR-only | Pourquoi pas | Alternative marché AFR |
|---|---|---|
| Parcoursup / LSU / Cyclades | 100% Éducation Nationale FR | Adapter à BAC algérien / BEM (V3+) |
| Maileva (publipostage La Poste) | Service postal FR | WhatsApp + SMS locaux |
| SecNumCloud ANSSI | Norme cybersécurité FR | Positionnement souveraineté algérienne (loi 18-07) |
| Élections conformes arrêté FR 2024 | Cadre réglementaire FR | Élections génériques paramétrables si demande |
| EDT-Index (génération auto) | 30 ans de R&D Index Éducation | Saisie manuelle suffit en V2, génération auto = V4+ |

---

## 6. Métriques de succès du rapprochement

À l'issue des sprints 8-12, EducLink devrait pouvoir cocher :

- ✅ Toutes les fonctions vie scolaire quotidiennes d'un CPE (Sprint 8)
- ✅ Bulletins PDF imprimables + compétences (Sprint 9)
- ✅ Communication multi-canal moderne (WhatsApp + PWA push) — **AU-DESSUS de PRONOTE pour le marché AFR** (Sprint 10)
- ✅ Différenciateurs éthiques (harcèlement) + administratifs (signature) (Sprint 11)
- ✅ Emploi du temps fonctionnel (Sprint 12)

**Positionnement final :** « EducLink = PRONOTE + WhatsApp + IA, conçu pour les écoles privées d'Afrique francophone. »

---

## 7. Décisions actées (2026-06-07)

- **Sprint 8 attaqué en premier** : Vie scolaire enrichie
- **Canal communication prioritaire** : WhatsApp Business (Sprint 10)
- **Document de référence** : ce fichier (`docs/ROADMAP-PRONOTE.md`), TASKS.md reste focus pilot
