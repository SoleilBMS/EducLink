# TASKS — EducLink
# Backlog complet : de l'état actuel au déploiement production
# Mis à jour : 2026-06-07

> **Progression** : Sprint 1 sécurité **terminé** (SEC-01 à SEC-08). Sprint 2 gestion utilisateurs UI **terminé pour USR-01..04** (USR-05/06 reportés, dépendent du service email OPS-04). Sprint 3 structure école UI **terminé** (SCH-01..SCH-06). Sprint 4 CRUD métier **terminé** (CRUD-01..06). Sprint 5 bulletins **terminé** pour BULL-01..03 (BULL-04 PDF reporté). Sprint 6 UX **terminé pour UX-02..05** (UX-01 responsive reporté). Sprint 7 prêt côté code : **OPS-01/03/08 terminés**. Reste **OPS-02/04/05/06/07** qui demandent ton intervention (compte Railway, choix provider email, domaine, Sentry, backups).

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

Toutes les structures (classes, matières, années, trimestres, école, tenants) sont désormais gérables depuis l'UI sans toucher au code.

### SCH-01 — Admin : gérer les années scolaires ✅ PILOT
- Page `/admin/school-years` (sidebar « Années scolaires », rôle `school_admin`)
- Formulaire de création : libellé (ex `2025-2026`), `startsAt`, `endsAt`, statut (`draft`/`active`/`closed`)
- Liste avec dates et statut, action suppression (cascade sur les trimestres rattachés)
- Validation : `startsAt < endsAt` (sinon redirect `?error=invalid_input`), permission `school_admin` (sinon 403)
- Audit `academic_year.created` / `academic_year.deleted`
- Tests : SCH-01 (création + listing), dates incohérentes refusées, non-admin → 403, isolation tenant

### SCH-02 — Admin : gérer les trimestres / semestres ✅ PILOT
- Formulaire intégré à chaque ligne d'année dans `/admin/school-years` : nom + dates
- Stockés rattachés à `academicYearId`, suppression individuelle par bouton
- Validation : la référence à l'année doit exister (sinon `?error=reference_invalid`)
- Audit `term.created` / `term.deleted`
- Tests : SCH-02 création + listing dans la page année

### SCH-03 — Admin : gérer les niveaux et classes ✅ PILOT
- Page `/admin/classes` (sidebar « Niveaux & classes ») : 2 sections — CRUD `gradeLevels` puis CRUD `classRooms`
- `gradeLevels` : nom, ordre (0..30) — endpoint `POST /admin/grade-levels` et `/delete`
- `classRooms` : nom, niveau parent (select des grade levels), capacité — endpoint `POST /admin/classes` et `/delete`
- Validation : classe sans niveau existant rejetée → `?error=reference_invalid`
- Audit `grade_level.created/deleted`, `class_room.created/deleted`
- Tests : création niveau puis classe, classe sans niveau refusée

### SCH-04 — Admin : gérer les matières ✅ PILOT
- Page `/admin/subjects` (sidebar « Matières ») : formulaire (nom + code court) + liste avec suppression
- Validation : code requis (1..20 char), nom requis
- Audit `subject.created` / `subject.deleted`
- Tests : création + listing, code vide refusé

### SCH-05 — Admin : page paramètres de l'école ✅ PILOT
- Page `/admin/school-settings` (sidebar « Établissement ») : 1 fiche `schools` par tenant
- Champs : nom, code, ville, pays — POST crée ou met à jour (upsert idempotent)
- Audit `school.updated`
- Tests : enregistrement + relecture (nom + code visibles dans la page)
- Note : logo et adresse étendue reportés post-MVP

### SCH-06 — Super admin : créer un nouveau tenant école ✅ PILOT
- Page `/admin/tenants` réservée à `super_admin` (sidebar « Tenants », redirection post-login)
- Formulaire : nom école, slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3..60 char), email admin, mot de passe temporaire ≥ 8 char
- Crée la ligne `tenants` puis le compte `users` (rôle `school_admin`, id = `admin-<slug>`, password bcrypt)
- L'admin peut immédiatement se connecter et atterrit sur `/dashboard/admin`
- Garde-fous : non-super_admin → 403, slug invalide → `?error=slug_invalid`, slug dupliqué → `?error=slug_duplicate`, email dupliqué → `?error=email_duplicate`
- Slugs réservés : `platform`, `admin`
- Audit `tenant.created` + `user.created`
- Tests : création complète + login admin, refus non-super-admin, slug invalide, slug dupliqué, redirection post-login

### Architecture Sprint 3
- Migration DB `packages/database/migrations/004_school_structure_sprint3.sql` : tables `tenants`, `schools`, `academic_years`, `terms`, `grade_levels` (les tables `class_rooms`/`subjects` existaient déjà)
- `PostgresCoreSchoolRepository` étendu avec API unifiée `list/get/create/update/delete(entity, tenantId, ...)` pour les 6 entités, validateurs locaux, contraintes de référence (terms → academic year, classRooms → grade level)
- `InMemoryTenantStore` (apps/web/src/modules/tenants.js) + `PostgresTenantRepository` (apps/web/src/modules/persistence/postgres-tenant-repository.js)
- En mode `memory` (par défaut tests/dev), le `coreSchoolStore` existant gère le CRUD ; en mode `postgres`, le repository postgres prend le relais via la même interface — pas de duplication de rendu dans server.js
- 15 nouveaux tests dans `apps/web/src/server.test.js` (suite globale : 195 tests, 0 fail)

---

## SPRINT 4 — Compléter les CRUD métier manquants (PILOT)

### CRUD-01 — UI : formulaire de création élève ✅ PILOT
- **Couvert par USR-03** : formulaire complet (prénom, nom, matricule, classe, date de naissance, accès optionnel) sur `/admin/students` [server.js:2199](apps/web/src/server.js#L2199)

### CRUD-02 — UI : formulaire de modification élève ✅ PILOT
- Formulaire d'édition intégré à la fiche élève (`renderStudentProfile` [server.js:2257](apps/web/src/server.js#L2257)) : prénom, nom, matricule, classe (select), date de naissance
- Handler `POST /admin/students/:id/update` (audit `student.update`), validation via `studentStore.update` → classRoomId invalide redirige vers `?error=invalid_input`
- Garde-fous : `canManageStudents` (school_admin uniquement), cross-tenant → `?error=not_found`
- Tests : édition réussie + banner succès, classRoomId invalide, non-admin → 403, cross-tenant rejeté

### CRUD-03 — UI : page détail élève pour l'admin ✅ PILOT
- `renderStudentProfile` enrichi avec 3 sections additionnelles :
  - **Responsables liés** : nom (lien vers fiche parent), relation (FR), contact principal badge, téléphone, email
  - **Présences récentes** : 10 derniers enregistrements (date, statut avec badge coloré, classe)
  - **Notes récentes** : 10 dernières notes (date, matière, évaluation, score, appréciation)
- Empty states explicites quand aucune donnée
- Tests : sections rendues avec données seed (student-a1), empty states (student-a5)

### CRUD-04 — UI : page détail élève pour l'enseignant ✅ PILOT
- Route `GET /teacher/students/:id` ([server.js](apps/web/src/server.js)) + vue dédiée `renderTeacherStudentView`
- Lien direct depuis la page d'appel `/teacher/attendance` (nom de l'élève cliquable)
- Garde-fou : l'enseignant ne voit que les élèves de **ses classes** (`teacher.classRoomIds`) — sinon 403
- Lecture seule (pas de formulaire, pas d'archivage)
- Sections :
  - **Présences récentes** : toutes les présences de l'élève (10 dernières)
  - **Notes** : restreintes aux **matières de l'enseignant** (`teacher.subjectIds`)
  - **Devoirs** : devoirs de la classe de l'élève, restreints aux matières de l'enseignant
- Tests : accès autorisé, élève hors périmètre → 403, admin (non-prof) → 403, filtrage par matières du prof

### CRUD-05 — UI : formulaire modification profil enseignant ✅ PILOT
- **Déjà en place** : `renderTeacherProfile` [server.js:2413](apps/web/src/server.js#L2413) + handler `POST /admin/teachers/:id/(update|archive)` [server.js:4203](apps/web/src/server.js#L4203)

### CRUD-06 — UI : archivage élève depuis l'interface ✅ PILOT
- Bouton « Archiver l'élève » sur la fiche détail (visible uniquement si non-archivé)
- Handler `POST /admin/students/:id/archive` (audit `student.archive`), redirige vers `?success=archived`
- L'élève archivé disparaît des listes actives mais la fiche reste consultable
- Tests : archivage + disparition du listing, non-admin → 403

---

## SPRINT 5 — Moyennes et bulletins (PILOT)

### BULL-01 — Calcul de la moyenne par matière ✅ PILOT
- Module pur [bulletin.js](apps/web/src/modules/bulletin.js) : `computeSubjectAverage(grades)` = moyenne pondérée par `assessment.coefficient`, arrondie à 2 décimales
- Filtre `isWithinTerm(date, term)` (inclusif sur `starts_at` / `ends_at`)
- Coefficients invalides ignorés, retourne `null` si aucun grade évaluable
- Tests unitaires : [bulletin.test.js](apps/web/src/modules/bulletin.test.js)

### BULL-02 — Calcul de la moyenne générale ✅ PILOT
- `buildReportCard({student, classRoom, term, grades, subjects, reportComments})` : groupe par matière, calcule moyenne par matière + moyenne générale (= **moyenne arithmétique** des moyennes par matière, convention scolaire FR)
- Exclut les notes hors trimestre, trie matières alphabétiquement, trie appréciations du plus récent au plus ancien
- Tests unitaires couvrant les cas vides, hors-période, multi-matières

### BULL-03 — Page bulletin simple (vue HTML) ✅ PILOT
- Seed enrichi : 1 année scolaire `2025-2026` + 3 trimestres (T1/T2/T3) pour `school-a`
- Routes :
  - `GET /bulletins/students/:studentId` → index des trimestres avec lien vers chaque bulletin
  - `GET /bulletins/students/:studentId/terms/:termId` → bulletin complet (synthèse + détail par matière + appréciations IA)
- Permissions (`canAccessBulletinForStudent`) :
  - `school_admin` / `director` : tout élève du tenant
  - `teacher` : élèves de ses classes uniquement, vue **restreinte à ses matières** (libellé "Moyenne sur vos matières")
  - `parent` : élèves liés (via `studentParentLinks`)
  - `student` : son propre bulletin uniquement
  - Cross-tenant → 404, trimestre/élève inexistants → 404
- Navigation : liens "Voir bulletin(s)" depuis fiche élève admin, vue élève enseignant, dashboard parent (un lien par enfant) et `/student/grades`
- Tests HTTP couvrant les 5 rôles + cas cross-tenant + empty state + vue restreinte enseignant

### BULL-04 — Export PDF du bulletin ❌ CONFORT
- Génération PDF depuis la vue HTML
- Accessible à l'admin pour impression / envoi
- **Note** : la vue HTML actuelle est print-friendly (impression navigateur OK)

---

## SPRINT 6 — UX et polish (CONFORT mais important pour le pilot)

### UX-01 — Design responsive mobile 🟡 CONFORT
- L'interface actuelle est partiellement responsive
- **Reporté** : nécessite des tests visuels en navigateur (mobile, tablet) que je ne peux pas faire en environnement sans interface graphique
- À traiter dans une session avec accès navigateur ou via un test e2e Playwright

### UX-02 — Pages d'erreur avec design ✅ CONFORT
- Helpers `sendForbiddenPage` / `sendNotFoundPage` / `sendServerErrorPage` ([server.js](apps/web/src/server.js))
- 403 : « Accès refusé » + lien vers le dashboard du rôle courant
- 404 : « Page introuvable » + catch-all sur toutes les routes inconnues (HTML, pas plain text)
- 500 : « Erreur serveur » via handler error pour les routes HTML (les routes `/api/v1/*` gardent du JSON)
- Sans session : lien vers `/login` au lieu du dashboard
- 69 réponses plain text `'Forbidden'` / `'Not found'` remplacées par des pages stylées
- Tests : 403 stylé, 404 catch-all, 404 entité inexistante, 404 sans session

### UX-03 — Feedback de formulaires ✅ CONFORT (sweep ciblé)
- Flux d'appel `/teacher/attendance` désormais avec banner succès (« Appel enregistré pour la classe sélectionnée. ») ou erreur via paramètre `?status=saved|error`
- Banners cohérents avec le design `el-banner is-success` / `is-error`
- Test : POST appel → redirection avec status=saved → banner visible
- Note : la plupart des flux admin avaient déjà un feedback (Sprints 2-5). Les flux teacher/grades et /teacher/lesson-homework restent silencieux mais leurs validations remontent dans les logs

### UX-04 — Confirmation avant actions destructives ✅ CONFORT
- Asset statique [/assets/ux.js](apps/web/src/server.js) (CSP-safe, servi via `script-src 'self'`)
- Handler délégué `submit` lit l'attribut `data-confirm="message"` et appelle `window.confirm` ; annule la soumission si l'utilisateur refuse
- `<script src="/assets/ux.js" defer>` injecté dans `renderPageHead` → présent sur toutes les pages
- `data-confirm` ajouté aux 7 actions destructives : archive élève/parent/enseignant, suppression année scolaire (cascade trimestres), niveau, classe, matière
- Tests : asset servi, script présent, pas d'inline JS, data-confirm sur archive élève et suppression année

### UX-05 — Navigation active dans la sidebar ✅ CONFORT
- `AsyncLocalStorage` (`requestContextStorage`) capture le `pathname` à l'entrée du handler HTTP
- `renderDashboardLayout` lit le pathname courant depuis le store et le passe à `buildDashboardNavigation`
- Match strict (`===`) OU préfixe (`startsWith(\`${href}/\`)`) pour que `/admin/students/:id` highlight le lien « Élèves »
- Test : highlight correct sur `/admin/students`, sur `/admin/students/:id` (préfixe), pas de faux positif sur `/admin/teachers`

---

## SPRINT 7 — Infrastructure et déploiement production (BLOQUANT)

### OPS-01 — Configuration variables d'environnement production ✅ BLOQUANT
- [.env.production.example](.env.production.example) refondu : référence complète et commentée
  - Runtime : `NODE_ENV`, `PORT`, `HOST` (avec notes Railway vs OVH)
  - Persistence : `EDUCLINK_PERSISTENCE`, `DATABASE_URL`
  - Sécurité : `SESSION_SECRET` (génération `openssl rand -hex 32`)
  - Logging : `LOG_FORMAT`, `LOG_LEVEL`
  - Migration auto : `EDUCLINK_AUTO_MIGRATE`
  - Optionnels commentés : provider AI (Anthropic), email (Resend), monitoring (Sentry)
- Tableau récap des variables Railway dans [docs/deployment-railway.md](docs/deployment-railway.md) §3 avec colonnes Required

### OPS-02 — Déploiement Railway initial ✅ BLOQUANT (action manuelle requise)
- [railway.json](railway.json) prêt à la racine (start command + healthcheck + restart policy)
- Procédure pas-à-pas dans [docs/deployment-railway.md](docs/deployment-railway.md)
- **Reste à faire manuellement** :
  - Créer le projet Railway depuis GitHub
  - Ajouter le service PostgreSQL et binder `${{Postgres.DATABASE_URL}}`
  - Setter `SESSION_SECRET` (REQUIS)
  - Vérifier `/healthz` accessible publiquement

### OPS-03 — Migration automatique au démarrage ✅ BLOQUANT
- Script wrapper [scripts/start-with-migrate.js](scripts/start-with-migrate.js) :
  exécute `packages/database/src/migrate.js` (idempotent via `schema_migrations`) puis lance `startServer()`
- `npm run start:railway` mis à jour pour pointer vers ce wrapper
- Échec migration → exit non-zéro → Railway redémarre (max 5 essais via `railway.json`)
- Désactivable via `EDUCLINK_AUTO_MIGRATE=0` (si on veut piloter manuellement)

### OPS-04 — Service email pour le reset de mot de passe ❌ PILOT (manuel)
- Variables placeholder commentées dans `.env.production.example` (Resend recommandé)
- Reste à faire : créer compte Resend (ou SendGrid/Mailgun), vérifier domaine MAIL_FROM, brancher le code (USR-05/06 dépendent de ce service)

### OPS-05 — Domaine personnalisé ❌ CONFORT (manuel)
- Configurer un domaine `app.educlink.xyz` (ou similaire) sur Railway
- Activer HTTPS automatique (Railway le gère)

### OPS-06 — Suivi des erreurs (Sentry ou équivalent) ❌ CONFORT (manuel)
- Intégrer Sentry pour capturer les erreurs 500 en production
- Variables `SENTRY_DSN` / `SENTRY_ENVIRONMENT` déjà placeholder dans `.env.production.example`
- Gratuit jusqu'à 5 000 erreurs/mois

### OPS-07 — Sauvegarde PostgreSQL ❌ BLOQUANT pour production réelle (manuel)
- Railway ne fait pas de backup automatique sur le plan gratuit
- Pour OVH : runbook complet dans [docs/deployment-ovh.md](docs/deployment-ovh.md) (cron pg_dump + externalisation S3)
- Pour le pilot Railway : Railway Pro propose des snapshots automatiques ($), sinon script externe

### OPS-08 — Nettoyage apps/web-next ✅ CONFORT
- Statut clarifié dans [apps/web-next/README.md](apps/web-next/README.md) : **preview / non déployé**, hors chemin Railway, hors CI
- Le `start:railway` ne touche pas web-next, donc pas d'interférence avec le pilot
- Conservé pour la roadmap future (remplacement progressif de l'UI HTML inline d'`apps/web`)

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
[✅ USR-01..04]              (Sprint 2 gestion utilisateurs UI — terminé)
         ↓
[✅ SCH-01..06]              (Sprint 3 structure école UI — terminé)
         ↓
[✅ CRUD-01..06]             (Sprint 4 CRUD métier — terminé)
         ↓
[✅ BULL-01..03]             (Sprint 5 bulletins — terminé, BULL-04 PDF reporté)
         ↓
[✅ UX-02..05]               (Sprint 6 UX — terminé, UX-01 responsive reporté)
         ↓
[✅ OPS-01, ✅ OPS-03, ✅ OPS-08]  (Sprint 7 prep code — terminé)
         ↓
🟡 OPS-02 (deploy Railway manuel) → /healthz public → pilot live
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

---

## SPRINT 9 — Refonte visuelle Klassly-style ✅ DEPLOY EN PROD

### DESIGN-01 — Refonte design system + mode jour/nuit ✅
- Palette indigo #4F46E5 → violet #7C3AED
- Typo Nunito (Google Fonts)
- Composants restylés (cards/boutons/badges/banners/forms/tables)
- Nouveaux patterns (empty states, avatars 6 palettes, dot bg, skeleton, confetti)
- Mode jour/nuit avec anti-FOUC CSP-compliant
- Page /__design dev-only pour validation visuelle
- Spec : [docs/superpowers/specs/2026-06-11-refonte-klassly-design.md]
- Plan : [docs/superpowers/plans/2026-06-11-refonte-klassly-design.md]

---

## SPRINT 10 — Klassly-feed (fil d'actualité visuel par classe) ✅ DEPLOY EN PROD

### FEED-01 — Module class-feed + EmailService ✅
- 5 nouvelles tables postgres (migration 011)
- `ClassFeedStore` (in-memory + `PostgresClassFeedRepository` postgres adapter)
- `EmailService` wrapper Resend (mode no-op si pas de clé)
- 29 tests unitaires `class-feed.test.js` + 5 tests `email.test.js`

### FEED-02 — Routes + UI feed ✅
- 13 nouvelles routes HTTP (`/class-feed`, `/class-feed/classes/:id`, `/class-feed/broadcast`, `POST /posts`, `/edit`, `/delete`, `/like`, `/comments`, `/comments/:id/delete`, `/read`, `/reads`, `/attachments/:id`)
- CSS post cards, composer expand, mosaic photos (1/2/3/4+), comments bubble
- JS : composer expand, photo preview, like toggle optimistic UI, auto-mark-read au scroll
- Sidebar nav "📰 Mur de la classe" (5 rôles)
- `parseMultipart` étendu avec `maxFiles` option (1..8 photos par post)
- 22 tests integration HTTP

### FEED-03 — Notifications email Resend ✅
- Template `email-new-post` (HTML inline table + texte) avec gradient brand
- Fire-and-forget dispatch après POST post (latence = 0 pour le teacher)
- Résolve audience : parents de la classe OU tous les parents tenant (broadcast)
- Audit log `feed_post.notifications_dispatched` (sent + failed counts)
- 3 tests template + 1 test integration

### Sprint stats
- 22 commits, +6809 lignes
- 471 tests pass / 0 fail (412 → 471, +59 nouveaux tests)
- Spec : [docs/superpowers/specs/2026-06-12-klassly-feed-design.md]
- Plan : [docs/superpowers/plans/2026-06-12-klassly-feed-design.md]

⚠️ **Pré-requis prod pour activer emails** : `RESEND_API_KEY` + `MAIL_FROM_ADDRESS` set sur Railway. Sans ça, l'app fonctionne mais les emails sont en mode no-op (loggés mais non envoyés).
