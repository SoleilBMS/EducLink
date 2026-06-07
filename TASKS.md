# TASKS — EducLink
# Backlog complet : de l'état actuel au déploiement production
# Mis à jour : 2026-06-07

> **Progression** : Sprint 1 sécurité **terminé** (SEC-01 à SEC-08). Sprint 2 gestion utilisateurs UI **terminé pour USR-01..04** (USR-05/06 reportés au Sprint 7, dépendent du service email OPS-04). Prêt à attaquer Sprint 3 (structure école UI) ou Sprint 7 (déploiement Railway).

---

## Légende

- ✅ Fait
- 🟡 Partiel / en cours
- ❌ À faire

Priorités :
- **BLOQUANT** = ne pas déployer sans ça
- **PILOT** = nécessaire pour tester avec une vraie école
- **CONFORT** = améliore l'expérience mais pas bloquant

Modules : BE = backend · UI = interface utilisateur · DB = base de données · SEC = sécurité · OPS = infrastructure

---

## État actuel (socle fonctionnel confirmé)

Les éléments suivants **existent et fonctionnent** dans `apps/web` :

- ✅ Serveur Node.js avec routage HTTP
- ✅ Connexion / déconnexion avec session cookie
- ✅ 7 rôles : super_admin, school_admin, director, teacher, parent, student, accountant
- ✅ Isolation multi-tenant sur toutes les requêtes
- ✅ Structure école (niveaux, classes, matières, années scolaires)
- ✅ Fiches élèves, parents, enseignants avec archivage
- ✅ Lien parent ↔ élève
- ✅ Appel / présences (enseignant prend l'appel, admin visualise)
- ✅ Cahier de texte + devoirs
- ✅ Évaluations + saisie des notes
- ✅ IA : génération brouillon appréciation (avec validation humaine)
- ✅ Messagerie : threads, messages, réponses, inbox
- ✅ Annonces établissement (globales et ciblées par rôle)
- ✅ Finance : plans de frais, factures, paiements
- ✅ Dashboards par rôle (admin, directeur, enseignant, parent, élève, comptable)
- ✅ Audit logs basiques
- ✅ Couche PostgreSQL avec migrations (3 migrations, dont `003_users_table.sql`)
- ✅ Authentification bcrypt + table `users` lue depuis la DB en mode postgres
- ✅ Cookies de session signés HMAC + `Secure`/`HttpOnly`/`SameSite=Lax`, `SESSION_SECRET` requis en prod
- ✅ Protection CSRF (synchronizer token + double-submit cookie) sur tous les POST hors `/login`
- ✅ En-têtes HTTP de sécurité : CSP stricte, X-Frame-Options, nosniff, Referrer-Policy, HSTS prod
- ✅ Throttling login (5 essais / 15 min → 429)
- ✅ Design system CSS cohérent
- ✅ Données de démo seedées + guide de démo
- ✅ CI GitHub Actions (Node 20 + 22, tests postgres)
- ✅ Endpoint `/healthz`
- ✅ Documentation Railway

---

## SPRINT 1 — Sécurité (BLOQUANT avant tout déploiement)

Ces tâches sont **non négociables**. Aucun déploiement public sans elles.

### SEC-01 — Hacher les mots de passe ✅ BLOQUANT
- Dépendance `bcryptjs` ajoutée (pur JS, portable Windows/Railway sans toolchain native)
- Wrapper `packages/auth/src/password/password-hasher.js` : `hashPassword`, `hashPasswordSync`, `verifyPassword` (avec dummy hash pour comparaison à temps constant)
- Cost factor 10 en prod, 4 en `NODE_ENV=test` pour ne pas ralentir la suite
- Login `/login` utilise désormais `verifyPassword` au lieu de la comparaison en clair

### SEC-02 — Migrer les utilisateurs vers PostgreSQL ✅ BLOQUANT
- Tableau `users` hardcodé supprimé de `server.js` ; remplacé par `SEED_USERS` (métadonnées uniquement) + `InMemoryUserStore` pour le mode mémoire
- `PostgresUserRepository` (`apps/web/src/modules/persistence/postgres-user-repository.js`) sélectionné automatiquement quand `EDUCLINK_PERSISTENCE=postgres`
- Login lit depuis l'`activeUserStore` (`findByEmail` async) et vérifie le hash bcrypt
- Identité d'affichage (sidebar) servie par un cache pré-rempli, sans rendre toute la pile dashboard async

### SEC-03 — Ajouter une migration DB pour la table users ✅ BLOQUANT
- Migration `packages/database/migrations/003_users_table.sql` : table `users` (id, tenant_id, email unique, password_hash, role check, is_active, timestamps) + index `LOWER(email)`
- Contrainte CHECK : `super_admin` impose `tenant_id IS NULL`, autres rôles imposent `tenant_id NOT NULL`
- Script `packages/database/src/seed.js` insère les 10 comptes démo avec mot de passe `password123` haché via `bcryptjs`

### SEC-04 — Sécuriser le cookie de session en production ✅ BLOQUANT
- Flag `Secure` ajouté à `sessionId` et `csrf` cookies quand `NODE_ENV=production` ([apps/web/src/server.js](apps/web/src/server.js) `buildSessionCookie` / `buildCsrfCookie`)
- `HttpOnly` + `SameSite=Lax` + `Max-Age` conservés
- Test : `SEC-04 + SEC-08: le cookie de session est signé et marqué HttpOnly/SameSite/Path`

### SEC-05 — Protection CSRF sur les formulaires POST ✅ BLOQUANT
- Token CSRF (32 octets hex) généré par session via [packages/auth/src/csrf/csrf.js](packages/auth/src/csrf/csrf.js), stocké sur la session et exposé en cookie non-HttpOnly `csrf`
- Middleware central `enforceCsrf` dans [apps/web/src/server.js](apps/web/src/server.js) appliqué à **tous** les POST sauf `/login` — vérifie `X-CSRF-Token` header OU `_csrf` dans le body, comparaison constant-time
- Helper `csrfField(session)` injecté dans **20 formulaires HTML** (login exempt)
- Tests : `SEC-05 POST sans CSRF → 403` (API JSON et form), `SEC-05 POST avec token valide → 302`

### SEC-06 — En-têtes de sécurité HTTP ✅ BLOQUANT
- Helper `applySecurityHeaders` appliqué en haut du request handler ([apps/web/src/server.js](apps/web/src/server.js))
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` (toujours)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production uniquement)
- **CSP stricte** sans `unsafe-inline` (l'app n'a aucun `<script>`/`<style>` inline) : `default-src 'self'; style-src 'self' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; script-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- Tests : `SEC-06 headers présents` / `SEC-06 HSTS absent en dev`

### SEC-07 — Limitation des tentatives de connexion ✅ BLOQUANT
- Classe `LoginThrottle` en mémoire ([packages/auth/src/rate-limit/login-throttle.js](packages/auth/src/rate-limit/login-throttle.js)) : 5 échecs / 15 min → verrou 15 min, clé = IP
- Réponse `429 Too Many Requests` avec `Retry-After` (secondes restantes), page login affiche un message UX
- Reset automatique sur login réussi
- Note : en mémoire = par-process ; à migrer vers Redis si on quitte le single-instance Railway
- Tests : `SEC-07 5 logins échoués bloquent le 6ème`

### SEC-08 — Variable SESSION_SECRET depuis l'environnement ✅ BLOQUANT
- `SESSION_SECRET` validé par [packages/core/src/runtime-env.js](packages/core/src/runtime-env.js) : requis (≥32 chars) en staging/production, fallback dev avec warning sinon
- Cookie de session **signé** HMAC-SHA256 (`sessionId.signature`) via `signSessionId` / `verifySignedSessionId` dans [packages/auth/src/session/session-store.js](packages/auth/src/session/session-store.js)
- Signature falsifiée → cookie rejeté, session non chargée (`crypto.timingSafeEqual`)
- `.env.example` et `.env.production.example` mis à jour
- Tests : `validateRuntimeEnv exige SESSION_SECRET en production`, `signSessionId/verifySignedSessionId` round-trip, refus signature/secret falsifié

---

## SPRINT 2 — Gestion des utilisateurs depuis l'interface (BLOQUANT pour le pilot)

Sans ça, pour ajouter un enseignant ou un parent il faut toucher au code.

### USR-01 — Admin : créer un compte enseignant ✅ PILOT
- Formulaire `/admin/teachers` : prénom/nom, email **requis**, mot de passe temporaire (≥8 char), téléphone, notes
- Validation côté serveur (email format, duplicate, longueur mot de passe) avant toute écriture
- Crée la fiche `teachers` **puis** la ligne `users` (rôle `teacher`, même id, password bcrypt). Rollback de la fiche si la création user échoue
- Audit event `user.created`
- Tests : USR-01 dans [apps/web/src/server.test.js](apps/web/src/server.test.js) + variante Postgres dans [apps/web/src/server.postgres.test.js](apps/web/src/server.postgres.test.js)

### USR-02 — Admin : créer un compte parent ✅ PILOT
- Formulaire `/admin/parents` : prénom/nom, email + mot de passe requis, téléphone, adresse, notes
- Crée fiche `parents` + ligne `users` (rôle `parent`, même id). Rollback en cas d'échec
- Audit event `user.created`
- Tests : USR-02 dans `server.test.js`

### USR-03 — Admin : créer un élève ✅ PILOT
- Formulaire intégré à `/admin/students` (visible uniquement pour `school_admin`)
- Champs : prénom/nom, matricule, date de naissance, classe (select)
- Checkbox **« Créer un accès élève »** : si cochée, demande email + password et crée la ligne `users` (rôle `student`). Sinon, seulement la fiche `students` (cas par défaut pour primaire/collège)
- Tests : 2 cas (avec/sans accès)

### USR-04 — Admin : page liste et gestion des comptes utilisateurs ✅ PILOT
- Page `/admin/users` (sidebar « Comptes ») : tableau email/rôle/statut + actions par ligne
- Actions : **désactiver / réactiver** (inactif → login refusé) et **reset password** (nouveau mdp ≥8 char)
- Garde-fous : un admin ne peut pas se désactiver lui-même, ni agir sur un user d'un autre tenant (403)
- Audit events `user.deactivated` / `user.activated` / `user.password_reset_by_admin`
- Tests : liste filtrée par tenant, non-admin → 403, deactivate/activate aller-retour, reset password aller-retour, refus self-désactivation, refus cross-tenant

### USR-05 — Réinitialisation du mot de passe (par email) ❌ PILOT
- Formulaire "mot de passe oublié"
- Envoi d'un lien par email (token à usage unique, expirant en 1h)
- Page de changement de mot de passe
- **Nécessite :** configuration d'un service email (voir OPS-04) → reporté au Sprint 7

### USR-06 — Invitation par email (optionnel MVP) ❌ CONFORT
- L'admin saisit l'email, l'utilisateur reçoit un lien pour créer son mot de passe
- Meilleure UX que le mot de passe temporaire
- **Nécessite :** OPS-04, reporté au Sprint 7

---

## SPRINT 3 — Structure école depuis l'interface (PILOT)

Aujourd'hui, les structures (classes, matières, années) ne peuvent pas être créées depuis l'UI.

### SCH-01 — Admin : gérer les années scolaires ❌ PILOT
- Liste, création, modification, clôture
- Formulaire : nom (ex: "2025-2026"), date de début et fin

### SCH-02 — Admin : gérer les trimestres / semestres ❌ PILOT
- Rattachés à une année scolaire
- Formulaire : nom, dates

### SCH-03 — Admin : gérer les niveaux et classes ❌ PILOT
- CRUD GradeLevel (6ème, 5ème, 4ème...)
- CRUD ClassRoom (6ème A, 6ème B...) avec capacité et niveau

### SCH-04 — Admin : gérer les matières ❌ PILOT
- CRUD Subject (Maths, Français, Sciences...)
- Code court et nom complet

### SCH-05 — Admin : page paramètres de l'école ❌ PILOT
- Nom de l'établissement, logo (texte pour MVP), adresse
- Premier écran visible après la création d'un nouveau tenant

### SCH-06 — Super admin : créer un nouveau tenant école ❌ PILOT
- Formulaire : nom école, slug tenant, email admin
- Crée le tenant + le premier compte school_admin
- **Pourquoi :** aujourd'hui il faut toucher au code pour ajouter une école

---

## SPRINT 4 — Compléter les CRUD métier manquants (PILOT)

### CRUD-01 — UI : formulaire de création élève ❌ PILOT
- La logique back existe, il manque juste le formulaire HTML côté admin
- Champs : nom, prénom, date de naissance, classe, numéro d'admission

### CRUD-02 — UI : formulaire de modification élève ❌ PILOT
- Modifier les infos d'un élève existant

### CRUD-03 — UI : page détail élève pour l'admin ❌ PILOT
- Vue consolidée : infos de base, responsables liés, absences récentes, notes récentes

### CRUD-04 — UI : page détail élève pour l'enseignant ❌ PILOT
- Vue lecture seule : présences, notes de ses matières, devoirs en cours

### CRUD-05 — UI : formulaire modification profil enseignant ❌ PILOT
- Modifier classes assignées, matières, coordonnées

### CRUD-06 — UI : archivage élève depuis l'interface ❌ PILOT
- Bouton d'archivage avec confirmation
- L'élève reste en base mais disparaît des listes actives

---

## SPRINT 5 — Moyennes et bulletins (PILOT)

### BULL-01 — Calcul de la moyenne par matière ❌ PILOT
- Par élève et par trimestre
- Weighted average (coefficient des évaluations)
- Affichée dans la vue notes parent et élève

### BULL-02 — Calcul de la moyenne générale ❌ PILOT
- Agrégation de toutes les matières par trimestre

### BULL-03 — Page bulletin simple (vue HTML) ❌ PILOT
- Vue par élève et par trimestre
- Affiche : matières, notes, moyennes, appréciations IA si disponibles
- Accessible par l'admin, l'enseignant (ses matières), le parent et l'élève

### BULL-04 — Export PDF du bulletin ❌ CONFORT
- Génération PDF depuis la vue HTML
- Accessible à l'admin pour impression / envoi

---

## SPRINT 6 — UX et polish (CONFORT mais important pour le pilot)

### UX-01 — Design responsive mobile ❌ CONFORT
- L'interface actuelle est partiellement responsive
- Vérifier et corriger les écrans clés sur mobile : login, dashboard, appel, notes

### UX-02 — Pages d'erreur avec design ❌ CONFORT
- Page 404 avec retour au dashboard
- Page 403 avec message clair ("Vous n'avez pas accès à cette section")
- Page 500 avec message utilisateur

### UX-03 — Feedback de formulaires ❌ CONFORT
- Erreurs inline sur les champs mal remplis
- Message de succès après une action (ex: "Appel enregistré")
- Actuellement les erreurs sont silencieuses ou redirigent sans message

### UX-04 — Confirmation avant actions destructives ❌ CONFORT
- Archivage d'un élève / enseignant / parent
- Suppression d'un devoir ou d'une note

### UX-05 — Navigation active dans la sidebar ❌ CONFORT
- Mettre en surbrillance la page actuelle dans le menu (partiel aujourd'hui)

---

## SPRINT 7 — Infrastructure et déploiement production (BLOQUANT)

### OPS-01 — Configuration variables d'environnement production ❌ BLOQUANT
- Documenter toutes les variables requises en production
- Ajouter dans `.env.production.example` :
  - `SESSION_SECRET` (chaîne aléatoire longue)
  - `DATABASE_URL`
  - `NODE_ENV=production`
  - `EDUCLINK_PERSISTENCE=postgres`
  - Variables AI provider (si IA activée)
  - Variables email (si reset password activé)

### OPS-02 — Déploiement Railway initial ❌ BLOQUANT
- Créer le projet Railway
- Ajouter le service PostgreSQL
- Configurer les variables d'environnement
- Brancher le déploiement depuis GitHub (branche main)
- Vérifier `/healthz` accessible

### OPS-03 — Migration automatique au démarrage ❌ BLOQUANT
- `npm run db:migrate` doit s'exécuter automatiquement au démarrage en production
- Railway : ajouter dans le start command ou comme release command
- Vérifier que c'est idempotent (peut tourner plusieurs fois sans erreur)

### OPS-04 — Service email pour le reset de mot de passe ❌ PILOT
- Choisir un provider : Resend, Mailgun ou SendGrid (Resend recommandé, gratuit à l'essai)
- Configurer dans les variables Railway
- Ajouter `SMTP_URL` ou clé API dans `.env.production.example`

### OPS-05 — Domaine personnalisé ❌ CONFORT
- Configurer un domaine `app.educlink.xyz` (ou similaire) sur Railway
- Activer HTTPS automatique (Railway le gère)

### OPS-06 — Suivi des erreurs (Sentry ou équivalent) ❌ CONFORT
- Intégrer Sentry pour capturer les erreurs 500 en production
- Gratuit jusqu'à 5 000 erreurs/mois

### OPS-07 — Sauvegarde PostgreSQL ❌ BLOQUANT pour production réelle
- Railway ne fait pas de backup automatique sur le plan gratuit
- Mettre en place pg_dump via un cron Railway ou un script externe
- Tester la restauration

### OPS-08 — Nettoyage apps/web-next ❌ CONFORT
- Supprimer ou ignorer le dossier `apps/web-next` pour éviter la confusion
- Decision : le mettre en archive ou le supprimer proprement

---

## SPRINT 8 — Tests et validation pilote (PILOT)

### TEST-01 — Checklist de validation manuelle ❌ PILOT
- Scénario Admin : créer classe → créer élève → créer enseignant → assigner
- Scénario Enseignant : prendre l'appel → saisir notes → générer appréciation IA
- Scénario Parent : voir notes → voir absences → voir facture → envoyer message
- Scénario Finance : créer facture → enregistrer paiement → vérifier solde

### TEST-02 — Tests de non-régression permissions ❌ PILOT
- Un parent ne voit que ses enfants
- Un enseignant ne voit que ses classes
- Un utilisateur d'un tenant A ne peut pas accéder au tenant B
- Ces tests doivent tourner en CI (certains existent déjà, compléter les manquants)

### TEST-03 — Test de charge basique ❌ CONFORT
- Simuler 50 utilisateurs simultanés sur le dashboard
- Vérifier que le temps de réponse reste < 2 secondes

### TEST-04 — Onboarding première école réelle ❌ PILOT
- Créer le tenant de l'école pilote via super_admin
- Créer les comptes admin, enseignants, parents
- Importer les élèves (formulaire ou import CSV basique)
- Former l'admin de l'école (1h de présentation)

### TEST-05 — Recueil des retours pilote et corrections ❌ PILOT
- Session de feedback avec l'école pilote après 2 semaines d'usage
- Liste des bugs bloquants et corrections en priorité

---

## Résumé du chemin critique

```
[✅ SEC-01..08]              (Sprint 1 sécurité — terminé)
         ↓
USR-01 → USR-02 → USR-03   (créer utilisateurs depuis l'UI)
         ↓
SCH-01 → SCH-03 → SCH-04   (structure école configurable)
         ↓
OPS-01 → OPS-02 → OPS-03   (déploiement Railway)
         ↓
TEST-01 → TEST-04           (validation pilote)
```

**Estimation grossière :**
- Sprint 1 (sécurité) : 3-5 jours de dev
- Sprint 2 (gestion users) : 3-4 jours
- Sprint 3 (structure école UI) : 2-3 jours
- Sprint 4 (CRUD manquants) : 2-3 jours
- Sprint 5 (bulletins) : 2-3 jours
- Sprint 6 (UX) : 2-3 jours
- Sprint 7 (infra) : 1-2 jours
- Sprint 8 (tests pilote) : continu

**Total estimé jusqu'au pilot : 3 à 5 semaines de développement.**

---

## Définition of Done (inchangée)

Une tâche est terminée si :
- le besoin métier est couvert
- les permissions sont respectées (rôle + tenant)
- les validations sont en place sur les inputs
- les tests minimum existent pour les permissions critiques
- l'UI est cohérente avec le design system existant
- la doc est mise à jour si nécessaire
