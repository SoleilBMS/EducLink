# Klassly-feed — fil d'actualité visuel par classe

**Date** : 2026-06-12
**Statut** : spec validé, en attente d'implémentation
**Sprint cible** : Klassly-feed (2e sprint de la série Klassly)
**Auteur** : brainstorming session Claude + SoleilBMS
**Spec précédent** : [2026-06-11-refonte-klassly-design.md](2026-06-11-refonte-klassly-design.md)

---

## 1. Contexte

EducLink ressemble visuellement à [Klassly](https://klassroom.fr) (sprint précédent terminé : palette indigo→violet, typo Nunito, mode jour/nuit, composants Klassly-style en prod sur Railway). **Il manque encore le cœur fonctionnel de Klassly** : le fil d'actualité visuel où l'enseignant publie des posts (texte + photos) et les parents likent et commentent.

Ce sprint construit ce module fondamental. C'est le sprint le plus gros à date (~6-7 jours, ~65 nouveaux tests, 13 nouvelles routes HTTP, 5 nouvelles tables postgres) car il introduit aussi le 1er service email du projet (Resend).

L'utilisateur a confirmé qu'il va créer le compte Resend en parallèle de l'implémentation (action manuelle : signup, vérification domaine, génération API key).

## 2. Objectifs

- **Fil d'actualité par classe** : enseignant publie posts texte + 1..8 photos, parents lisent / likent / commentent dans un flux chronologique
- **Broadcast école** : admin/director publie un post visible par TOUTES les classes (cohabite avec les annonces existantes — pas de migration)
- **Read receipts** : auteur voit qui a lu son post ("12 / 15 parents") + liste détaillée
- **Notifications email immédiates** : chaque parent reçoit un email Resend à la création d'un post le concernant (fire-and-forget, ne bloque pas la réponse HTTP)
- **Edit window 1h** : auteur peut corriger une typo dans l'heure, après c'est figé. Delete reste possible à vie pour l'auteur, et toujours pour l'admin.
- **Zéro régression** : annonces existantes intactes, design system existant réutilisé, tests existants (412) restent verts

## 3. Non-objectifs

- Notifications digest, push web, mentions, réactions emoji riches, recherche, filtres, bookmarks, notifications in-app (cloche) — tout reporté
- Notifications email sur commentaires (uniquement à la création de post pour MVP)
- Notifications aux élèves (uniquement parents — les élèves voient sur la plateforme)
- Édition de commentaires (suppression OK, édition non)
- Migration des annonces existantes vers le feed
- Upload de vidéos / audio / autres formats (uniquement images : png/jpeg/webp)
- HEIC iPhone (nécessite conversion serveur, reporté)
- Stockage S3 (BYTEA postgres comme partout)

## 4. Modèle de données — migration 011

Nouveau fichier : `packages/database/migrations/011_class_feed.sql`

### 4.1. Tables

```sql
-- Posts (publications enseignant ou admin/director)
CREATE TABLE class_feed_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  class_room_id TEXT,                    -- NULL = broadcast à toutes les classes
  body TEXT NOT NULL,                    -- 1..5000 chars
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,                 -- set au 1er edit (badge "modifié")
  deleted_at TIMESTAMPTZ                 -- soft-delete pour audit
);
CREATE INDEX idx_cfp_class_recent
  ON class_feed_posts (tenant_id, class_room_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_cfp_broadcast_recent
  ON class_feed_posts (tenant_id, created_at DESC)
  WHERE class_room_id IS NULL AND deleted_at IS NULL;

-- Pièces jointes photos (1 à 8 par post)
CREATE TABLE class_feed_post_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,             -- 0..7 pour ordre d'affichage
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,               -- image/png, image/jpeg, image/webp
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL                    -- max 3 Mo par photo
);
CREATE INDEX idx_cfp_attachments_post ON class_feed_post_attachments (post_id, position);

-- Commentaires (plat, 1 niveau)
CREATE TABLE class_feed_post_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,                    -- 1..2000 chars
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ                 -- soft-delete
);
CREATE INDEX idx_cfp_comments_post ON class_feed_post_comments (post_id, created_at);

-- Likes (composite key, 1 like = 1 ligne)
CREATE TABLE class_feed_post_likes (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Read receipts (composite key, 1 lecture = 1 ligne)
CREATE TABLE class_feed_post_reads (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_cfp_reads_post ON class_feed_post_reads (post_id);
```

### 4.2. Justifications design

- **`class_room_id NULL` = broadcast** : évite une table de jointure many-to-many puisque le pattern est binaire (1 classe OU toutes les classes du tenant)
- **Soft-delete partout** : audit + récupération possible si suppression accidentelle
- **BYTEA pour photos** : cohérent avec absence-notices, pas d'infra S3/disque à provisionner
- **Index partiels `WHERE deleted_at IS NULL`** : ne scan pas les posts supprimés
- **Pas de table audience** : la résolution se fait à l'exécution via `student_parent_links` (parents) et `students.class_room_id` (élèves)
- **CASCADE delete des attachments** : si on hard-delete un post (ce qui n'arrive jamais sauf admin), les photos suivent

## 5. Modules JS

### 5.1. `apps/web/src/modules/class-feed.js`

Pattern standard EducLink : classe `ClassFeedStore` (in-memory pour dev/tests) avec API uniforme + adapter postgres derrière.

```js
class ClassFeedStore {
  constructor({ posts = [], attachments = [], comments = [], likes = [], reads = [] } = {})

  // POSTS
  createPost(tenantId, author, { classRoomId, body, attachments })
  getPost(tenantId, postId, { includeDeleted = false })
  listPostsForClass(tenantId, classRoomId, { limit = 20, before })
  listPostsForAudience(tenantId, userContext, { limit = 20, before })
  editPost(tenantId, postId, authorUserId, { body, attachments }, { now })
  softDeletePost(tenantId, postId, actorUserId, actorRole)

  // ATTACHMENTS
  getAttachment(tenantId, attachmentId)

  // COMMENTS
  addComment(tenantId, postId, author, body)
  listComments(tenantId, postId)
  softDeleteComment(tenantId, commentId, actorUserId, actorRole)

  // LIKES
  toggleLike(tenantId, postId, userId)  // returns { liked: bool, count: int }
  countLikes(tenantId, postId)

  // READS
  markRead(tenantId, postId, userId)
  countReads(tenantId, postId)
  listReadersForPost(tenantId, postId)

  // AUDIENCE
  resolveAudience(tenantId, post)  // returns Array<userId>
}
```

**Validations dans le store** :
- `body` : 1..5000 (post), 1..2000 (comment)
- `attachments` : 1..8 items, chaque ≤ 3 Mo, mime ∈ `{image/png, image/jpeg, image/webp}`
- `classRoomId` existe et appartient au tenant (sinon `validation_error` 422)
- `editPost` rejette si `now - created_at > 1h` OU si `authorUserId !== post.author_user_id`
- `softDeletePost` autorisé pour `author_user_id` OU actor de rôle `school_admin`/`director` du même tenant
- Cross-tenant : retourne null partout (le handler convertit en 404 par convention EducLink)

### 5.2. `apps/web/src/modules/email.js` (NOUVEAU)

Wrapper minimal autour de l'API HTTP Resend (pas de SDK npm, juste `fetch`).

```js
class EmailService {
  constructor({ apiKey, fromAddress, fromName = 'EducLink', logger, fetch = globalThis.fetch })

  async send({ to, subject, html, text })
  // POST https://api.resend.com/emails avec Authorization: Bearer ${apiKey}
  // Body : { from, to, subject, html, text }
  // Retourne { id } ou throw EmailServiceError
  // Timeout 10s, 1 retry sur erreur réseau (pas sur erreur 4xx)

  async sendBatch({ recipients, subject, html, text })
  // Loop send() pour chaque recipient, retourne { sent: int, failed: int, errors: [] }
}

class EmailServiceError extends Error {
  constructor(message, { status, code } = {}) { ... }
}
```

**Configuration via runtime env** (étendre `validateRuntimeEnv`) :
- `RESEND_API_KEY` (optionnel — sans clé, le service est en mode no-op + log warning)
- `MAIL_FROM_ADDRESS` (requis si `RESEND_API_KEY` set, sinon throw au démarrage prod)
- `MAIL_FROM_NAME` (optionnel, défaut `EducLink`)

**Mode dégradé** : si `RESEND_API_KEY` absent (cas dev local), `send()` devient un no-op qui log info `[email] no-op (RESEND_API_KEY not configured)`. Permet de coder/tester localement sans clé.

### 5.3. `apps/web/src/modules/persistence/postgres-class-feed-repository.js` (NOUVEAU)

Adapter postgres implémentant la même API que `ClassFeedStore`. Pattern existant copié sur `postgres-absence-notices-repository.js`.

Sélection auto via `EDUCLINK_PERSISTENCE=postgres` dans `createServer` (pattern existant).

### 5.4. `apps/web/src/templates/email-new-post.js` (NOUVEAU)

Fonction `renderNewPostEmail({ post, author, className, baseUrl, recipientName })` qui retourne `{ subject, html, text }`. Template HTML inline-table (compat email clients), reprend la palette indigo→violet du design system.

## 6. Routes HTTP

```
─── Navigation & feed ─────────────────────────────────────────
GET  /class-feed                          → page sélection de classe
                                            (redirige si 1 seule classe)
GET  /class-feed/classes/:classId         → feed d'une classe + composer
GET  /class-feed/broadcast                → feed broadcast (admin/director only)

─── Création / édition posts ──────────────────────────────────
POST /class-feed/posts                    → créer (multipart : body + photos[])
                                            param hidden : classRoomId (ou 'broadcast')
POST /class-feed/posts/:postId/edit       → éditer (1h window, auteur uniquement)
POST /class-feed/posts/:postId/delete     → soft-delete (auteur ou admin)

─── Engagement (likes, commentaires, reads) ───────────────────
POST /class-feed/posts/:postId/like       → toggle like (utilisateur courant)
POST /class-feed/posts/:postId/comments   → créer commentaire
POST /class-feed/comments/:commentId/delete → soft-delete (auteur OU admin OU auteur du post)
POST /class-feed/posts/:postId/read       → marquer lu (appel JS au scroll/view)
GET  /class-feed/posts/:postId/reads      → liste des lecteurs (auteur ou admin)

─── Servir les médias ─────────────────────────────────────────
GET  /class-feed/attachments/:attachmentId → renvoie l'image BYTEA
                                              (Cache-Control: public, max-age=86400)
                                              (vérifie le droit d'accès au post)
```

### 6.1. Matrix permissions

| Route | school_admin | director | teacher | parent | student |
|---|---|---|---|---|---|
| `GET /class-feed` | ✅ toutes | ✅ toutes | ✅ ses classes | ✅ enfants | ✅ sa classe |
| `GET /class-feed/classes/:id` | ✅ | ✅ | ✅ si in `classRoomIds` | ✅ si enfant in classe | ✅ si sa classe |
| `GET /class-feed/broadcast` | ✅ | ✅ | ❌ (404) | ❌ | ❌ |
| `POST /class-feed/posts` (classe) | ❌ (utiliser broadcast) | ❌ | ✅ pour ses classes | ❌ | ❌ |
| `POST /class-feed/posts` (broadcast) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `POST /class-feed/posts/:id/edit` | ❌ | ❌ | ✅ si auteur ET < 1h | ❌ | ❌ |
| `POST /class-feed/posts/:id/delete` | ✅ toujours | ✅ toujours | ✅ si auteur | ❌ | ❌ |
| `POST /class-feed/posts/:id/like` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /class-feed/posts/:id/comments` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /class-feed/comments/:id/delete` | ✅ toujours | ✅ toujours | ✅ si auteur OU auteur du post | ✅ si auteur | ✅ si auteur |
| `GET /class-feed/posts/:id/reads` | ✅ | ✅ | ✅ si auteur du post | ❌ | ❌ |
| `GET /class-feed/attachments/:id` | ✅ si lecture autorisée | ✅ | ✅ | ✅ | ✅ |

### 6.2. Audit events

Nouveaux events à logger via `auditWriter` :
- `feed_post.created` (tenant_id, post_id, class_room_id)
- `feed_post.edited` (tenant_id, post_id, author_user_id)
- `feed_post.deleted` (tenant_id, post_id, actor_user_id, actor_role)
- `feed_comment.created` (tenant_id, comment_id, post_id)
- `feed_comment.deleted` (tenant_id, comment_id, actor_user_id, actor_role)
- `feed_post.notifications_dispatched` (tenant_id, post_id, count, failed_count)

### 6.3. Cross-tenant

404 systématique (convention existante).

## 7. UI / CSS / JS

### 7.1. Nouvelles classes CSS (ajoutées à `DESIGN_SYSTEM_CSS`)

```
.el-feed                      container max-width 720px, mx-auto
.el-feed-composer             zone de création top, sticky top à 16px
.el-feed-composer-collapsed   placeholder click-to-expand
.el-feed-composer-expanded    textarea + photo previews + boutons
.el-feed-photo-previews       grille thumbnails sélectionnées (avant upload)
.el-post-card                 extends .el-card avec spacing optimisé
.el-post-header               avatar + nom + meta
.el-post-meta                 "CP-B · il y a 2h · 👁 12/15"
.el-post-body                 texte
.el-post-photos               mosaïque grid responsive
.el-post-photos.is-1          1 photo : full width, max-h 480px
.el-post-photos.is-2          2 colonnes égales
.el-post-photos.is-3          grande à gauche + 2 petites à droite
.el-post-photos.is-4plus      grille 2x2, overlay "+N" sur la dernière si N>4
.el-post-overlay-count        overlay "+3" sur la dernière vignette
.el-post-actions              like + comments buttons (flex row)
.el-post-actions-button       bouton plat hover indigo
.el-post-actions-button.is-liked  état liké (couleur indigo + filled heart)
.el-comments-section          divider + liste + input
.el-comment                   avatar + bubble
.el-comment-bubble            fond gris arrondi avec nom + texte
.el-comment-input             input arrondi en bas du post
.el-edited-tag                "modifié" badge mini-pill
.el-feed-empty                empty state quand 0 post
.el-feed-load-more            bouton "Charger plus de posts" en bas
```

### 7.2. Extensions JS dans `UX_SCRIPT_JS`

Pattern delegation existant. Ajouts :
- Composer expand on click placeholder
- Photo preview avant upload (URL.createObjectURL pour thumbnails)
- Like toggle avec optimistic UI + rollback sur fetch error
- Auto-mark-as-read au scroll (intersection viewport, debounce 300ms)
- Helper `window.elDebounce(fn, ms)` pour réutilisation
- Token CSRF accessible côté JS : on injecte `<meta name="el-csrf-token" content="${session.csrfToken}">` dans `renderPageHead` (le helper Sprint design `csrfField` continue de servir pour les forms HTML). Un init dans `UX_SCRIPT_JS` lit le meta au DOMContentLoaded et l'expose via `window.elCsrfToken`.

**Pas de nouveau JS externe** : tout dans `UX_SCRIPT_JS` servi sur `/assets/ux.js`. CSP `script-src 'self' 'sha256-...'` couvre déjà.

### 7.3. Sidebar — nouvelle entrée

Ajout dans `buildDashboardNavigation` après "Présences" :

```
📰 Mur de la classe → /class-feed
```

## 8. Notifications email

### 8.1. Déclenchement

1. POST `/class-feed/posts` reçu, body et photos parsés, post committé en DB
2. **Avant** d'écrire la réponse 302 au client, le handler lance `notifyAudience(post)` en fire-and-forget (Promise créée mais non-awaitée) — éventuelles erreurs catchées dans un `.catch()` qui log mais n'interrompt rien
3. Le handler envoie immédiatement la 302 → le navigateur du teacher est redirigé sans attendre Resend
4. En background, le Promise déroule : `resolveAudience(tenantId, post)` → liste `userId[]` → fetch emails via `userStore` → `EmailService.sendBatch(...)` → audit event `feed_post.notifications_dispatched` avec `{ count, failed_count }`

### 8.2. Résolution audience

- Post avec `class_room_id` défini :
  - Parents : tous les `users.role = 'parent'` liés à un élève (via `student_parent_links`) de cette classe
- Post broadcast (`class_room_id IS NULL`) :
  - Tous les `users.role = 'parent'` du tenant

L'auteur du post est **exclu** dans tous les cas.

### 8.3. Template email

Fichier : `apps/web/src/templates/email-new-post.js`

Sujet : `📰 Nouveau post de {authorName} dans {className}` (ou `Annonce de l'école` pour broadcast)

Corps HTML : table inline (compat clients email), reprend les couleurs du design system (header gradient indigo→violet, avatar initiales, body post tronqué à 200 chars, CTA bouton "Voir le post" lien vers `https://educlink-production.up.railway.app/class-feed/classes/:classId#post-:postId`).

Version texte plate pour clients sans HTML.

### 8.4. Mode dégradé

- Sans `RESEND_API_KEY` (dev local) : `EmailService.send()` log info et retourne sans envoyer
- Avec `RESEND_API_KEY` mais erreur API : log error, audit event `feed_post.notifications_dispatched` avec `failed_count > 0`

## 9. Tests

### 9.1. Tests automatisés à ajouter

**Unit tests modules** (~35 tests) :
- `class-feed.test.js` (~25 tests)
- `email.test.js` (~10 tests)

**Integration tests HTTP** (~30 tests) dans `server.test.js`

**Total nouveau** : ~65 tests → suite passera de 412 à ~477.

### 9.2. Validation manuelle utilisateur

1. Créer compte Resend (en parallèle, action manuelle)
2. Set env vars Railway : `RESEND_API_KEY`, `MAIL_FROM_ADDRESS`
3. Login teacher → créer post photo dans sa classe
4. Vérifier dans Resend dashboard : email envoyé aux parents
5. Login parent (lié à un élève de cette classe) → recevoir email, click CTA, atterrir sur post
6. Comment + like depuis parent → vérifier en temps réel (refresh teacher)
7. Re-login teacher → voir read receipts "Vu par X / Y"
8. Test broadcast : login admin, créer post broadcast → vérifier dans 2 classes différentes
9. Test edit < 1h puis > 1h
10. Test soft-delete par auteur puis par admin
11. Mobile 375px : sidebar collapse, mosaïque photos lisible

## 10. Livraison

- **~10-12 commits atomiques** (détaillés dans le plan d'implémentation)
- Commit final + push origin/main → auto-deploy Railway
- **Pré-requis prod** : `RESEND_API_KEY` + `MAIL_FROM_ADDRESS` set sur Railway AVANT le déploiement (sinon notifs silencieuses, le reste fonctionne)

## 11. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Compte Resend pas prêt au moment du déploiement | Moyen | EmailService en mode no-op si `RESEND_API_KEY` absent : tout fonctionne sauf l'email. Branchement après-coup zéro risque. |
| Stockage BYTEA 8 photos × 3 Mo × N posts saturent postgres | Moyen | Ordre de grandeur : 1000 posts × 24 Mo = 24 Go. La capacité varie selon le plan Railway (Hobby ~1 Go par défaut, Pro plus). Pour MVP pilot (1 école, ~50 posts/mois), OK plusieurs mois. Sprint suivant si saturation : compression image côté serveur ou migration BYTEA → S3. |
| Latence upload 8 × 3 Mo = 24 Mo sur connexion lente | Moyen | Multipart streaming déjà en place. Spinner UI pendant upload. Timeout côté server raisonnable (60s). |
| Cross-tenant leak via attachment URL devinée | Faible | Route `/attachments/:id` vérifie systématiquement le droit d'accès au post parent. ID UUID donc non-devinable. |
| Notif email à des centaines de parents fait timer la requête de création | Faible | Fire-and-forget : la response 302 part avant que les emails soient envoyés. Aucune latence ajoutée pour le teacher. |
| Auto-mark-as-read scroll trigger trop souvent | Faible | Debounce 300ms + Set en mémoire pour éviter les doublons par session. Insert idempotent côté DB (PK composite). |
| Soft-deleted posts pollutent la DB | Faible | Index partiels excluent `deleted_at IS NOT NULL`. Cleanup cron post-MVP si nécessaire. |
| Tests existants cassent à cause d'extension `validateRuntimeEnv` | Faible | Les nouvelles env vars email sont OPTIONNELLES (RESEND_API_KEY peut être absent). Aucune régression sur tests existants. |

## 12. Hors scope (sprints futurs)

- **Sprint Klassly-engagement** : notifications digest, opt-out par parent, notifs sur commentaires, push web (PWA)
- **Sprint Klassly-medialib** : album photos par classe (mosaïque toutes les photos de tous les posts)
- **Sprint Klassly-search** : recherche + filtres (par auteur, par date, photos uniquement, posts liés)
- **Sprint Klassly-emoji** : réactions emoji riches (au-delà du like)
- **Sprint Klassly-mentions** : @parent, @teacher, @élève dans posts et commentaires
- **Sprint storage-s3** : migration BYTEA → S3 pour scalabilité si saturation postgres
- **Sprint Klasswork** : devoirs enrichis (existait dans le spec parent, sprint séparé)
- **Sprint Klassboard** : multidiffusion + SMS d'urgence + stats engagement (existait dans le spec parent)

## 13. Definition of Done

- [ ] Migration 011 appliquée en prod
- [ ] Modules `class-feed.js`, `email.js`, postgres adapter livrés + ~35 tests unitaires verts
- [ ] 13 routes HTTP fonctionnelles + ~30 tests integration verts
- [ ] CSS étendu (~15 classes), JS étendu (composer, like, read), sidebar nav ajoutée
- [ ] `EmailService` branché à Resend en prod (env vars set par utilisateur)
- [ ] Smoke test prod : créer post → recevoir email → cliquer CTA → atterrir sur post
- [ ] Suite tests : ~477+ verts
- [ ] Doc TASKS.md mise à jour
