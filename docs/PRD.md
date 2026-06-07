# Product Requirements Document — EducLink

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Draft  
**Owner:** EducLink Product Team

---

## 1. Vue d'ensemble du produit

### 1.1 Résumé exécutif

EducLink est un **SaaS ERP éducatif multi-tenant** destiné aux établissements privés. Il centralise la gestion pédagogique, administrative et financière tout en facilitant la communication école–parents et en intégrant une assistance IA pour les enseignants.

### 1.2 Problème résolu

Les établissements privés gèrent aujourd'hui leurs données dans des outils disparates (tableurs, cahiers papier, emails, SMS) sans cohérence ni traçabilité. Les enseignants perdent du temps sur les tâches administratives répétitives, les parents manquent de visibilité sur le parcours de leurs enfants, et les directions n'ont pas de tableau de bord consolidé.

### 1.3 Proposition de valeur

| Pour | EducLink offre |
|------|---------------|
| **Directeurs / Admins** | Pilotage complet de l'établissement, données en temps réel |
| **Enseignants** | Saisie rapide des présences, notes et cahiers de textes, commentaires IA |
| **Parents** | Visibilité sur les notes, absences, devoirs et finances |
| **Élèves** | Accès aux devoirs et bulletins |
| **Comptables** | Suivi des frais de scolarité, factures et paiements |

---

## 2. Utilisateurs cibles

### 2.1 Segments principaux

- **Établissements privés** (collèges, lycées, écoles primaires) — 50 à 1 000 élèves
- **Pays cibles prioritaires** : Afrique francophone (France, Sénégal, Côte d'Ivoire, Cameroun…)

### 2.2 Rôles utilisateurs

| Rôle | Description | Périmètre d'accès |
|------|-------------|-------------------|
| `super_admin` | Administrateur plateforme | Tous les établissements |
| `school_admin` | Gestionnaire établissement | Toute l'école |
| `director` | Directeur pédagogique | Lecture globale école |
| `teacher` | Enseignant | Ses classes et matières |
| `parent` | Parent/tuteur | Ses enfants uniquement |
| `student` | Élève | Son propre profil |
| `accountant` | Comptable | Module finance uniquement |

---

## 3. Périmètre fonctionnel

### 3.1 Modules principaux

#### 3.1.1 Structure scolaire (Core School)

- Gestion multi-établissements (multi-tenant)
- Années scolaires et trimestres/semestres
- Niveaux, classes et matières
- Attribution matières ↔ enseignants ↔ classes

**Critères d'acceptation :**
- Un admin peut créer une année scolaire, y ajouter des trimestres et configurer les classes
- La configuration se reflète immédiatement sur les dashboards enseignants et parents
- Les données d'un établissement sont strictement isolées des autres tenants

---

#### 3.1.2 Gestion des personnes

**Élèves**
- Création, modification, archivage des fiches élèves
- Rattachement à une classe et un niveau
- Historique scolaire

**Parents / Tuteurs**
- Création des fiches parents
- Liaison parent ↔ enfant(s) (un parent peut avoir plusieurs enfants)
- Accès limité aux données de leurs enfants uniquement

**Enseignants**
- Profil enseignant avec matières et classes assignées
- Vue personnalisée de l'emploi du temps

**Critères d'acceptation :**
- Import en masse via CSV (à planifier en P1)
- Un parent voit uniquement les données de ses enfants, jamais celles des autres élèves

---

#### 3.1.3 Suivi des présences

- Saisie de présence par classe et par séance
- Statuts : présent / absent / retard
- Saisie en masse pour une classe entière (upsert)
- Consultation des relevés d'absences par élève, classe, période

**Critères d'acceptation :**
- Un enseignant peut saisir les présences d'une classe en moins de 2 minutes
- Les parents reçoivent une notification (futur) lors d'une absence
- Un admin peut exporter le relevé d'absences par période

---

#### 3.1.4 Cahier de textes & Devoirs

- Enregistrement des séances de cours (contenu, compétences)
- Création et assignation de devoirs avec date limite
- Consultation des devoirs par élève et par classe
- Suivi de complétion côté enseignant

**Critères d'acceptation :**
- Un enseignant peut enregistrer une leçon et un devoir en une seule saisie
- Les parents et élèves voient les devoirs à venir filtrés par matière

---

#### 3.1.5 Notes & Bulletins

- Création d'évaluations (contrôle, devoir, examen)
- Saisie des notes avec barème configurable
- Calcul automatique des moyennes par matière, classe, trimestre
- Génération des commentaires de bulletin (manuel + IA)
- Export bulletin (P1)

**Critères d'acceptation :**
- Un enseignant peut saisir les notes d'une classe après avoir créé l'évaluation
- Les moyennes sont recalculées à chaque nouvelle note
- Le module IA propose un commentaire de bulletin en moins de 5 secondes

---

#### 3.1.6 Messagerie & Annonces

- Annonces globales (admin → tous)
- Messagerie interne par fils de discussion
- Destinataires : par rôle, par classe, individuel
- Boîte de réception unifiée (inbox)

**Critères d'acceptation :**
- Un admin peut envoyer une annonce à tous les parents d'une classe
- Les messages non lus sont visibles dans la barre de navigation
- Les enseignants peuvent contacter les parents d'un élève spécifique

---

#### 3.1.7 Finance

- Plans de frais de scolarité (fee plans) configurables
- Génération automatique des factures par élève
- Enregistrement des paiements (espèces, virement, mobile money)
- Tableau de bord financier : encaissé / attendu / retard
- Historique par élève

**Critères d'acceptation :**
- Un comptable peut créer un plan tarifaire et l'affecter à une classe
- Une facture est générée automatiquement à l'inscription
- Le solde en temps réel est visible pour l'admin et le parent

---

#### 3.1.8 Assistance IA

- Génération de commentaires de bulletin personnalisés par élève
- Registre de prompts versionnés
- Architecture multi-provider (extensible OpenAI, Anthropic, etc.)
- Feature flag par tenant

**Critères d'acceptation :**
- Le commentaire IA tient compte des notes et du comportement de l'élève
- L'enseignant peut modifier le texte généré avant validation
- L'utilisation IA est tracée dans les logs d'audit

---

#### 3.1.9 Audit & Traçabilité

- Log de toutes les actions sensibles (création, modification, suppression)
- Horodatage, identifiant utilisateur, tenant
- Consultation par les admins

---

### 3.2 Hors périmètre (P2+)

- Application mobile native (iOS / Android)
- Passerelle de paiement en ligne (Stripe, Wave, Orange Money)
- Notifications push / SMS / email
- Emploi du temps graphique (drag & drop)
- Import/export de données en masse (CSV/Excel)
- Génération PDF des bulletins
- API publique pour intégrations tierces
- Single Sign-On (SSO / OAuth)

---

## 4. Architecture technique

### 4.1 Stack

| Couche | Technologie |
|--------|------------|
| Frontend (actuel) | Node.js HTTP — rendu HTML côté serveur |
| Frontend (futur) | Next.js 14 + Tailwind CSS (`apps/web-next/`) |
| Backend | Node.js 20+ — serveur HTTP natif, architecture modulaire |
| Base de données | PostgreSQL (production) / In-memory (développement) |
| Auth | Sessions HTTP-only cookie, RBAC multi-rôles |
| IA | Provider abstrait (DevEchoAiProvider en dev, extensible) |
| Infrastructure | Multi-tenant par `tenant_id` — isolation stricte |

### 4.2 Structure monorepo

```
educlink/
├── apps/
│   ├── web/           # Application principale (Node.js)
│   └── web-next/      # Futur frontend Next.js
├── packages/
│   ├── auth/          # Authentification & RBAC
│   ├── core/          # Utilitaires partagés, validation env
│   ├── database/      # Client PG, migrations, seeds
│   ├── domain/        # Modèles métier
│   └── config/        # Configuration
└── docs/              # Documentation produit & technique
```

### 4.3 Flux de données

```
Requête HTTP
  → Validation de session (cookie)
  → Vérification rôle & tenant (API Guard)
  → Service métier
  → Store / Repository (mémoire ou PostgreSQL)
  → Audit log
  → Réponse JSON / HTML
```

### 4.4 Multi-tenancy

- Chaque école est un **tenant** isolé
- Le `tenant_id` est présent sur toutes les entités
- Aucune fuite de données entre tenants possible par architecture
- Le `super_admin` est le seul rôle cross-tenant

---

## 5. Sécurité

| Mesure | Implémentation |
|--------|---------------|
| Sessions | HttpOnly cookie, TTL 12h, SameSite=Lax |
| CSRF | SameSite=Lax + validation origin |
| RBAC | Permissions par classe de ressource + scope tenant |
| Validation | Validation des entrées à toutes les API boundaries |
| Audit | Log de toutes les opérations sensibles |
| Isolation | tenant_id obligatoire sur toutes les requêtes de données |

---

## 6. Performances & contraintes

| Contrainte | Cible |
|-----------|-------|
| Temps de réponse API (P95) | < 300 ms |
| Saisie présences pour 30 élèves | < 2 min (UX) |
| Disponibilité | 99,5 % (hors maintenance) |
| Environnements | development (mémoire), staging (PG), production (PG) |
| Compatibilité navigateur | Chrome, Firefox, Safari, Edge — 2 dernières versions |
| Mobile | Responsive first (viewport mobile prioritaire) |

---

## 7. Roadmap produit

### Phase 0 — Fondations ✅ (complété)
- Architecture multi-tenant, RBAC 7 rôles
- Modules : structure scolaire, élèves, parents, enseignants
- Présences, devoirs, notes (saisie)
- Finance (plans, factures, paiements)
- Messagerie / Annonces
- Assistance IA commentaires bulletins
- Dashboard par rôle

### Phase 1 — Complétude produit (P1)
- [ ] Export PDF des bulletins
- [ ] Import CSV élèves / parents
- [ ] Notifications email sur absences et annonces
- [ ] Frontend Next.js (`apps/web-next/`) en production
- [ ] Emploi du temps (lecture)
- [ ] Tableau de bord analytique enrichi (taux de présence, évolution notes)

### Phase 2 — Croissance (P2)
- [ ] Application mobile (React Native ou PWA)
- [ ] Passerelle paiement mobile money (Wave, Orange Money)
- [ ] Notifications SMS / WhatsApp
- [ ] API publique documentée (OpenAPI)
- [ ] SSO / OAuth (Google Workspace for Education)
- [ ] Génération automatique de l'emploi du temps

### Phase 3 — IA avancée (P3)
- [ ] Analyse prédictive du risque de décrochage
- [ ] Recommandations pédagogiques personnalisées
- [ ] Chatbot assistant pour parents et élèves
- [ ] Synthèse automatique des conseils de classe

---

## 8. Métriques de succès

| KPI | Cible (fin P1) |
|-----|---------------|
| Établissements onboardés | 10 |
| Utilisateurs actifs / mois | 500 |
| Taux de saisie présences via EducLink | > 80 % des classes actives |
| NPS enseignants | > 40 |
| Délai de génération commentaire IA | < 5 s |
| Taux de rétention (M3) | > 85 % |

---

## 9. Glossaire

| Terme | Définition |
|-------|-----------|
| **Tenant** | Un établissement scolaire dans le système multi-tenant |
| **Trimestre / Term** | Période d'évaluation définie dans l'année scolaire |
| **Niveau (Grade Level)** | Niveau scolaire (ex : 6ème, 5ème, Terminale) |
| **Classe (ClassRoom)** | Groupe d'élèves d'un même niveau |
| **Évaluation (Assessment)** | Contrôle ou examen créé par un enseignant |
| **Fee Plan** | Grille tarifaire des frais de scolarité |
| **Inbox** | Boîte de réception des messages internes |
| **Audit Log** | Journal horodaté des actions sensibles |
| **DevEchoAiProvider** | Provider IA de développement (renvoie un texte simulé) |

---

*Document généré à partir de l'analyse du code source — EducLink v1.0*
