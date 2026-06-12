# Klassly-feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le fil d'actualité visuel par classe (posts texte + photos, comments, likes, edit 1h, read receipts, notifications email Resend) en réutilisant les patterns EducLink existants (in-memory store + postgres adapter, multipart upload, CSS design system).

**Architecture:** 5 nouvelles tables postgres (migration 011), 2 nouveaux modules métier (`class-feed.js` pour le store + postgres adapter, `email.js` wrapper Resend avec mode no-op fallback), 13 nouvelles routes HTTP dans `server.js`, nouvelles classes CSS dans `DESIGN_SYSTEM_CSS`, extensions `UX_SCRIPT_JS` pour composer/like/read-tracking. Notifications email envoyées en fire-and-forget après commit DB.

**Tech Stack:** Node.js HTTP natif, `node:test`, Postgres BYTEA pour photos, Resend HTTP API via `fetch`, CSP-compliant inline JS.

**Spec source:** [docs/superpowers/specs/2026-06-12-klassly-feed-design.md](../specs/2026-06-12-klassly-feed-design.md)

---

## Vue d'ensemble des tâches

| # | Tâche | Type | Fichiers principaux |
|---|---|---|---|
| 1 | Migration 011 (5 tables postgres) | DB | `packages/database/migrations/011_class_feed.sql` |
| 2 | EmailService module + runtime env extension | Module | `apps/web/src/modules/email.js`, `packages/core/src/runtime-env.js` |
| 3 | ClassFeedStore — posts CRUD + tests | Module | `apps/web/src/modules/class-feed.js` |
| 4 | ClassFeedStore — attachments + edit + soft-delete + tests | Module | `apps/web/src/modules/class-feed.js` |
| 5 | ClassFeedStore — comments + likes + reads + audience + tests | Module | `apps/web/src/modules/class-feed.js` |
| 6 | PostgresClassFeedRepository + tests | Module | `apps/web/src/modules/persistence/postgres-class-feed-repository.js` |
| 7 | Wire stores dans createServer + email config | Wiring | `apps/web/src/server.js` |
| 8 | CSS additions pour feed components (~15 classes) | CSS | `apps/web/src/server.js` (DESIGN_SYSTEM_CSS) |
| 9 | UX_SCRIPT_JS extensions + meta csrf token | JS | `apps/web/src/server.js` |
| 10 | Sidebar nav entry + GET /class-feed (class selector) | Route | `apps/web/src/server.js` |
| 11 | GET /class-feed/classes/:classId (feed + composer + cards) | Route | `apps/web/src/server.js` |
| 12 | GET /class-feed/broadcast | Route | `apps/web/src/server.js` |
| 13 | POST /class-feed/posts (multipart create) | Route | `apps/web/src/server.js` |
| 14 | POST /class-feed/posts/:id/edit + delete | Route | `apps/web/src/server.js` |
| 15 | POST /class-feed/posts/:id/like + comments + delete comment | Route | `apps/web/src/server.js` |
| 16 | POST /class-feed/posts/:id/read + GET /reads | Route | `apps/web/src/server.js` |
| 17 | GET /class-feed/attachments/:id (serve BYTEA avec auth) | Route | `apps/web/src/server.js` |
| 18 | Email template renderNewPostEmail + tests | Template | `apps/web/src/templates/email-new-post.js` |
| 19 | Wire notifyAudience fire-and-forget | Wiring | `apps/web/src/server.js` |
| 20 | TASKS.md + commit final + push Railway | Doc/Deploy | `TASKS.md`, git |

---

## Task 1: Migration 011 — 5 tables postgres

**Files:**
- Create: `packages/database/migrations/011_class_feed.sql`

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- Sprint Klassly-feed — fil d'actualite visuel par classe
-- 5 tables : posts (avec soft-delete), attachments (BYTEA photos),
-- comments (plat), likes (composite PK), reads (composite PK).
-- Pattern existant : index partiels sur deleted_at, BYTEA pour fichiers (cf 006_absence_notices).

CREATE TABLE IF NOT EXISTS class_feed_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  class_room_id TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cfp_class_recent
  ON class_feed_posts (tenant_id, class_room_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cfp_broadcast_recent
  ON class_feed_posts (tenant_id, created_at DESC)
  WHERE class_room_id IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS class_feed_post_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cfp_attachments_post
  ON class_feed_post_attachments (post_id, position);

CREATE TABLE IF NOT EXISTS class_feed_post_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cfp_comments_post
  ON class_feed_post_comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS class_feed_post_likes (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS class_feed_post_reads (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cfp_reads_post
  ON class_feed_post_reads (post_id);
```

- [ ] **Step 2: Vérifier que le runner de migrations détecte le fichier**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
ls packages/database/migrations/ | grep 011
```

Expected : `011_class_feed.sql` listé.

- [ ] **Step 3: Lancer la suite pour s'assurer que rien ne casse**

```bash
npm test 2>&1 | tail -8
```

Expected : 412 pass / 0 fail (la migration n'affecte pas les tests en mode memory).

- [ ] **Step 4: Commit**

```bash
git add packages/database/migrations/011_class_feed.sql
git commit -m "feat(class-feed): migration 011 - 5 tables (posts, attachments, comments, likes, reads)

Tables avec soft-delete + index partiels (pattern absence-notices).
BYTEA pour photos (1..8 par post, 3 Mo max chacune).
Comments plat, likes/reads composite PK pour idempotence."
```

---

## Task 2: EmailService module + runtime env extension

**Files:**
- Create: `apps/web/src/modules/email.js`
- Create: `apps/web/src/modules/email.test.js`
- Modify: `packages/core/src/runtime-env.js`
- Modify: `packages/core/src/runtime-env.test.js` (si existe)

- [ ] **Step 1: Étendre `validateRuntimeEnv` pour accepter les vars email (optionnelles)**

Localiser le fichier :
```bash
cd /c/Users/ntcon/Documents/dev/EducLink
grep -n "function validateRuntimeEnv" packages/core/src/runtime-env.js
```

Dans le bloc `return { ok, errors, config }`, étendre `config` :

Trouver :
```javascript
  return {
    ok: errors.length === 0,
    errors,
    config: {
      nodeEnv,
      host,
      port,
      persistenceMode,
      databaseUrl,
      logFormat,
      logLevel: env.LOG_LEVEL ?? 'info',
      sessionSecret,
      sessionSecretIsFallback
    }
  };
```

Remplacer par :
```javascript
  const resendApiKey = typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim().length > 0
    ? env.RESEND_API_KEY.trim()
    : null;
  const mailFromAddress = typeof env.MAIL_FROM_ADDRESS === 'string' && env.MAIL_FROM_ADDRESS.trim().length > 0
    ? env.MAIL_FROM_ADDRESS.trim()
    : null;
  const mailFromName = typeof env.MAIL_FROM_NAME === 'string' && env.MAIL_FROM_NAME.trim().length > 0
    ? env.MAIL_FROM_NAME.trim()
    : 'EducLink';

  if (resendApiKey && !mailFromAddress) {
    errors.push('MAIL_FROM_ADDRESS is required when RESEND_API_KEY is set');
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      nodeEnv,
      host,
      port,
      persistenceMode,
      databaseUrl,
      logFormat,
      logLevel: env.LOG_LEVEL ?? 'info',
      sessionSecret,
      sessionSecretIsFallback,
      resendApiKey,
      mailFromAddress,
      mailFromName
    }
  };
```

- [ ] **Step 2: Écrire les tests unitaires EmailService**

Créer `apps/web/src/modules/email.test.js` :

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const { EmailService, EmailServiceError } = require('./email');

function makeLogger() {
  const calls = [];
  return {
    info: (msg, meta) => calls.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => calls.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => calls.push({ level: 'error', msg, meta }),
    calls
  };
}

test('EmailService: no-op mode quand apiKey est null', async () => {
  const logger = makeLogger();
  const fetchCalls = [];
  const service = new EmailService({
    apiKey: null,
    fromAddress: 'noreply@test.com',
    logger,
    fetch: async (...args) => { fetchCalls.push(args); return new Response('{}'); }
  });

  const result = await service.send({ to: 'parent@test.com', subject: 'Hi', html: '<p>x</p>', text: 'x' });
  assert.equal(result.skipped, true);
  assert.equal(fetchCalls.length, 0);
  assert.ok(logger.calls.some(c => c.level === 'info' && c.msg.includes('no-op')));
});

test('EmailService: send() POSTe vers Resend API avec Authorization Bearer', async () => {
  const logger = makeLogger();
  const fetchCalls = [];
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    fromName: 'TestApp',
    logger,
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return new Response(JSON.stringify({ id: 'email_abc' }), { status: 200 });
    }
  });

  const result = await service.send({
    to: 'parent@test.com',
    subject: 'Hi',
    html: '<p>x</p>',
    text: 'x'
  });

  assert.equal(result.id, 'email_abc');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.resend.com/emails');
  assert.equal(fetchCalls[0].opts.headers['Authorization'], 'Bearer re_test_123');
  const body = JSON.parse(fetchCalls[0].opts.body);
  assert.equal(body.from, 'TestApp <noreply@test.com>');
  assert.deepEqual(body.to, ['parent@test.com']);
  assert.equal(body.subject, 'Hi');
});

test('EmailService: send() throw EmailServiceError sur erreur HTTP 4xx', async () => {
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    logger: makeLogger(),
    fetch: async () => new Response(JSON.stringify({ message: 'Invalid email' }), { status: 422 })
  });

  await assert.rejects(
    () => service.send({ to: 'bad', subject: 'x', html: 'x', text: 'x' }),
    (err) => err instanceof EmailServiceError && err.status === 422
  );
});

test('EmailService: sendBatch() loop sur recipients et compte succes/echecs', async () => {
  let callCount = 0;
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    logger: makeLogger(),
    fetch: async () => {
      callCount += 1;
      if (callCount === 2) {
        return new Response(JSON.stringify({ message: 'Bad' }), { status: 422 });
      }
      return new Response(JSON.stringify({ id: `email_${callCount}` }), { status: 200 });
    }
  });

  const result = await service.sendBatch({
    recipients: ['a@x.com', 'b@x.com', 'c@x.com'],
    subject: 'x', html: 'x', text: 'x'
  });

  assert.equal(result.sent, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].recipient, 'b@x.com');
});

test('EmailServiceError contient status et code', () => {
  const err = new EmailServiceError('Boom', { status: 500, code: 'server_error' });
  assert.equal(err.status, 500);
  assert.equal(err.code, 'server_error');
  assert.equal(err.message, 'Boom');
});
```

- [ ] **Step 3: Lancer le test, il doit échouer (module n'existe pas)**

```bash
node --test apps/web/src/modules/email.test.js 2>&1 | tail -10
```

Expected : FAIL ("Cannot find module './email'").

- [ ] **Step 4: Implémenter `apps/web/src/modules/email.js`**

```javascript
class EmailServiceError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message);
    this.name = 'EmailServiceError';
    this.status = status ?? null;
    this.code = code ?? null;
    if (cause) this.cause = cause;
  }
}

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

class EmailService {
  constructor({ apiKey, fromAddress, fromName = 'EducLink', logger, fetch = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.apiKey = apiKey ?? null;
    this.fromAddress = fromAddress ?? null;
    this.fromName = fromName;
    this.logger = logger;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;

    if (this.apiKey && !this.fromAddress) {
      throw new EmailServiceError('EmailService requires fromAddress when apiKey is set', { code: 'invalid_config' });
    }
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  async send({ to, subject, html, text }) {
    if (!this.apiKey) {
      this.logger?.info?.('[email] no-op (RESEND_API_KEY not configured)', { to, subject });
      return { skipped: true };
    }

    const fromLine = `${this.fromName} <${this.fromAddress}>`;
    const body = JSON.stringify({
      from: fromLine,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: controller.signal
      });
    } catch (err) {
      throw new EmailServiceError('Network error calling Resend', { code: 'network_error', cause: err });
    } finally {
      clearTimeout(timeoutId);
    }

    let parsed = {};
    try { parsed = await response.json(); } catch { parsed = {}; }

    if (!response.ok) {
      const message = (parsed && parsed.message) || `Resend returned HTTP ${response.status}`;
      throw new EmailServiceError(message, { status: response.status, code: 'api_error' });
    }

    return { id: parsed.id ?? null };
  }

  async sendBatch({ recipients, subject, html, text }) {
    const errors = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.send({ to: recipient, subject, html, text });
        if (result.skipped) continue;
        sent += 1;
      } catch (err) {
        failed += 1;
        errors.push({ recipient, error: err.message, status: err.status ?? null });
        this.logger?.warn?.('[email] sendBatch recipient failed', { recipient, error: err.message });
      }
    }

    return { sent, failed, errors };
  }
}

module.exports = { EmailService, EmailServiceError };
```

- [ ] **Step 5: Re-lancer les tests, ils doivent passer**

```bash
node --test apps/web/src/modules/email.test.js 2>&1 | tail -10
```

Expected : 5 pass / 0 fail.

- [ ] **Step 6: Lancer la suite globale, vérifier aucune régression**

```bash
npm test 2>&1 | tail -8
```

Expected : 417+ pass (412 existants + 5 nouveaux), 0 fail.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/modules/email.js apps/web/src/modules/email.test.js packages/core/src/runtime-env.js
git commit -m "feat(email): EmailService wrapper Resend + runtime env extension

- Mode no-op si RESEND_API_KEY absent (dev local sans cle)
- send() POST Resend API avec Authorization Bearer + timeout 10s
- sendBatch() loop avec compteur succes/echecs
- EmailServiceError pour erreurs HTTP/network
- runtime-env : ajout RESEND_API_KEY, MAIL_FROM_ADDRESS, MAIL_FROM_NAME (optionnels)
- 5 tests unitaires verts"
```

---

## Task 3: ClassFeedStore — posts CRUD + tests

**Files:**
- Create: `apps/web/src/modules/class-feed.js` (squelette + posts CRUD)
- Create: `apps/web/src/modules/class-feed.test.js`

- [ ] **Step 1: Écrire les tests pour posts CRUD**

Créer `apps/web/src/modules/class-feed.test.js` :

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const { ClassFeedStore, ClassFeedError } = require('./class-feed');

function makeAuthor(overrides = {}) {
  return { userId: 'teacher-a1', role: 'teacher', tenantId: 'school-a', ...overrides };
}

test('ClassFeedStore.createPost: cree un post avec body et classRoomId', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b',
    body: 'Sortie au musee hier !',
    attachments: []
  });
  assert.equal(typeof post.id, 'string');
  assert.equal(post.tenantId, 'school-a');
  assert.equal(post.authorUserId, 'teacher-a1');
  assert.equal(post.classRoomId, 'class-cp-b');
  assert.equal(post.body, 'Sortie au musee hier !');
  assert.equal(post.deletedAt, null);
  assert.equal(post.editedAt, null);
});

test('ClassFeedStore.createPost: classRoomId null = broadcast', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor({ role: 'school_admin' }), {
    classRoomId: null,
    body: 'Annonce ecole',
    attachments: []
  });
  assert.equal(post.classRoomId, null);
});

test('ClassFeedStore.createPost: rejette body vide', () => {
  const store = new ClassFeedStore();
  assert.throws(
    () => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: '', attachments: [] }),
    (err) => err instanceof ClassFeedError && err.code === 'validation_error'
  );
});

test('ClassFeedStore.createPost: rejette body > 5000 chars', () => {
  const store = new ClassFeedStore();
  assert.throws(
    () => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x'.repeat(5001), attachments: [] }),
    (err) => err instanceof ClassFeedError && err.code === 'validation_error'
  );
});

test('ClassFeedStore.getPost: retrieve un post existant, null si inexistant', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'Hi', attachments: [] });

  const found = store.getPost('school-a', post.id);
  assert.equal(found.id, post.id);

  const missing = store.getPost('school-a', 'nope');
  assert.equal(missing, null);
});

test('ClassFeedStore.getPost: cross-tenant retourne null', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'Hi', attachments: [] });
  const result = store.getPost('school-b', post.id);
  assert.equal(result, null);
});

test('ClassFeedStore.listPostsForClass: ordonne par created_at DESC + limit', () => {
  const store = new ClassFeedStore({ clock: (() => { let t = 1000; return () => (t += 100); })() });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'first', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'second', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'third', attachments: [] });

  const posts = store.listPostsForClass('school-a', 'class-cp-b', { limit: 2 });
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body, 'third');
  assert.equal(posts[1].body, 'second');
});

test('ClassFeedStore.listPostsForClass: filtre par classRoomId', () => {
  const store = new ClassFeedStore();
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'in cp-b', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-ce1-a', body: 'in ce1-a', attachments: [] });

  const posts = store.listPostsForClass('school-a', 'class-cp-b', { limit: 10 });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body, 'in cp-b');
});
```

- [ ] **Step 2: Lancer le test, doit échouer (module manquant)**

```bash
node --test apps/web/src/modules/class-feed.test.js 2>&1 | tail -5
```

Expected : FAIL.

- [ ] **Step 3: Implémenter `apps/web/src/modules/class-feed.js` (squelette + posts CRUD)**

```javascript
const crypto = require('node:crypto');

class ClassFeedError extends Error {
  constructor(message, { code = 'class_feed_error', status = 422 } = {}) {
    super(message);
    this.name = 'ClassFeedError';
    this.code = code;
    this.status = status;
  }
}

function validationError(message) {
  return new ClassFeedError(message, { code: 'validation_error', status: 422 });
}

function requireString(value, field, { min = 1, max = 5000 } = {}) {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw validationError(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) throw validationError(`${field} must be at most ${max} characters`);
  return trimmed;
}

class ClassFeedStore {
  constructor({ posts = [], attachments = [], comments = [], likes = [], reads = [], clock = Date.now } = {}) {
    this.posts = posts.map((p) => ({ ...p }));
    this.attachments = attachments.map((a) => ({ ...a }));
    this.comments = comments.map((c) => ({ ...c }));
    this.likes = likes.map((l) => ({ ...l }));
    this.reads = reads.map((r) => ({ ...r }));
    this.clock = clock;
  }

  createPost(tenantId, author, { classRoomId, body, attachments = [] }) {
    const trimmedBody = requireString(body, 'body', { min: 1, max: 5000 });
    if (classRoomId !== null && typeof classRoomId !== 'string') {
      throw validationError('classRoomId must be a string or null');
    }
    if (!Array.isArray(attachments)) throw validationError('attachments must be an array');

    const now = new Date(this.clock()).toISOString();
    const post = {
      id: `post-${crypto.randomUUID()}`,
      tenantId,
      authorUserId: author.userId,
      classRoomId: classRoomId ?? null,
      body: trimmedBody,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      deletedAt: null
    };
    this.posts.push(post);
    return { ...post };
  }

  getPost(tenantId, postId, { includeDeleted = false } = {}) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return null;
    if (!includeDeleted && post.deletedAt) return null;
    return { ...post };
  }

  listPostsForClass(tenantId, classRoomId, { limit = 20, before = null } = {}) {
    return this.posts
      .filter((p) => p.tenantId === tenantId && p.classRoomId === classRoomId && !p.deletedAt)
      .filter((p) => !before || p.createdAt < before)
      .sort((a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0))
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }
}

module.exports = { ClassFeedStore, ClassFeedError };
```

- [ ] **Step 4: Re-lancer les tests**

```bash
node --test apps/web/src/modules/class-feed.test.js 2>&1 | tail -10
```

Expected : 8 pass / 0 fail.

- [ ] **Step 5: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 425+ pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/class-feed.js apps/web/src/modules/class-feed.test.js
git commit -m "feat(class-feed): ClassFeedStore - posts CRUD (in-memory) + 8 tests

- createPost, getPost, listPostsForClass
- Validation body 1..5000 chars
- classRoomId null = broadcast
- Cross-tenant isolation (getPost retourne null)
- Soft-delete respect (includeDeleted option)"
```

---

## Task 4: ClassFeedStore — attachments + edit + soft-delete

**Files:**
- Modify: `apps/web/src/modules/class-feed.js`
- Modify: `apps/web/src/modules/class-feed.test.js`

- [ ] **Step 1: Ajouter les tests**

Append à `class-feed.test.js` :

```javascript
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024;

function makeAttachment(overrides = {}) {
  return {
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    data: Buffer.from('fake'),
    ...overrides
  };
}

test('ClassFeedStore.createPost: accepte jusqu\'a 8 attachments', () => {
  const store = new ClassFeedStore();
  const attachments = Array.from({ length: 8 }, (_, i) => makeAttachment({ fileName: `p${i}.jpg` }));
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'with photos', attachments });
  assert.equal(post.attachments.length, 8);
  post.attachments.forEach((a, i) => assert.equal(a.position, i));
});

test('ClassFeedStore.createPost: rejette > 8 attachments', () => {
  const store = new ClassFeedStore();
  const attachments = Array.from({ length: 9 }, () => makeAttachment());
  assert.throws(() => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'too many', attachments }),
    (err) => err.code === 'validation_error');
});

test('ClassFeedStore.createPost: rejette mimeType non autorise', () => {
  const store = new ClassFeedStore();
  assert.throws(() => store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'bad mime',
    attachments: [makeAttachment({ mimeType: 'application/pdf' })]
  }), (err) => err.code === 'validation_error');
});

test('ClassFeedStore.createPost: rejette attachment > 3 Mo', () => {
  const store = new ClassFeedStore();
  assert.throws(() => store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'too big',
    attachments: [makeAttachment({ sizeBytes: 3 * 1024 * 1024 + 1, data: Buffer.alloc(3 * 1024 * 1024 + 1) })]
  }), (err) => err.code === 'validation_error');
});

test('ClassFeedStore.getAttachment: retourne data par id, null cross-tenant', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'x',
    attachments: [makeAttachment({ fileName: 'photo.jpg' })]
  });
  const att = store.getAttachment('school-a', post.attachments[0].id);
  assert.equal(att.fileName, 'photo.jpg');
  assert.ok(Buffer.isBuffer(att.data));
  assert.equal(store.getAttachment('school-b', post.attachments[0].id), null);
});

test('ClassFeedStore.editPost: succes si auteur ET < 1h', () => {
  let now = 1_700_000_000_000;
  const store = new ClassFeedStore({ clock: () => now });
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'original', attachments: [] });
  now += 30 * 60 * 1000; // 30 min plus tard
  const edited = store.editPost('school-a', post.id, 'teacher-a1', { body: 'updated', attachments: [] }, { now });
  assert.equal(edited.body, 'updated');
  assert.ok(edited.editedAt);
});

test('ClassFeedStore.editPost: refuse si > 1h', () => {
  let now = 1_700_000_000_000;
  const store = new ClassFeedStore({ clock: () => now });
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'original', attachments: [] });
  now += 61 * 60 * 1000;
  assert.throws(() => store.editPost('school-a', post.id, 'teacher-a1', { body: 'updated', attachments: [] }, { now }),
    (err) => err.code === 'edit_window_expired');
});

test('ClassFeedStore.editPost: refuse si pas auteur', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  assert.throws(() => store.editPost('school-a', post.id, 'teacher-other', { body: 'y', attachments: [] }, { now: Date.now() }),
    (err) => err.code === 'forbidden');
});

test('ClassFeedStore.softDeletePost: auteur OK', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.softDeletePost('school-a', post.id, 'teacher-a1', 'teacher');
  assert.equal(store.getPost('school-a', post.id), null);
  assert.ok(store.getPost('school-a', post.id, { includeDeleted: true }).deletedAt);
});

test('ClassFeedStore.softDeletePost: admin OK meme si pas auteur', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.softDeletePost('school-a', post.id, 'admin-a', 'school_admin');
  assert.equal(store.getPost('school-a', post.id), null);
});

test('ClassFeedStore.softDeletePost: parent refuse', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  assert.throws(() => store.softDeletePost('school-a', post.id, 'parent-a1', 'parent'),
    (err) => err.code === 'forbidden');
});
```

- [ ] **Step 2: Étendre `class-feed.js` avec attachments + edit + soft-delete**

Ajouter ces constantes en haut du module :

```javascript
const ALLOWED_ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_POST = 8;
const EDIT_WINDOW_MS = 60 * 60 * 1000; // 1h
const POST_DELETE_ROLES = new Set(['school_admin', 'director']);
```

Helper de validation des attachments (au-dessus de la classe) :

```javascript
function validateAttachments(attachments) {
  if (attachments.length > MAX_ATTACHMENTS_PER_POST) {
    throw validationError(`attachments must be at most ${MAX_ATTACHMENTS_PER_POST} items`);
  }
  attachments.forEach((att, idx) => {
    if (!att || typeof att !== 'object') throw validationError(`attachments[${idx}] must be an object`);
    requireString(att.fileName, `attachments[${idx}].fileName`, { min: 1, max: 180 });
    if (!ALLOWED_ATTACHMENT_MIMES.includes(att.mimeType)) {
      throw validationError(`attachments[${idx}].mimeType must be one of: ${ALLOWED_ATTACHMENT_MIMES.join(', ')}`);
    }
    if (!Buffer.isBuffer(att.data)) throw validationError(`attachments[${idx}].data must be a Buffer`);
    if (att.data.length === 0) throw validationError(`attachments[${idx}].data must not be empty`);
    if (att.data.length > MAX_ATTACHMENT_BYTES) {
      throw validationError(`attachments[${idx}].data must be at most ${MAX_ATTACHMENT_BYTES} bytes`);
    }
  });
}
```

Modifier `createPost` pour gérer attachments + ajouter méthodes :

```javascript
  createPost(tenantId, author, { classRoomId, body, attachments = [] }) {
    const trimmedBody = requireString(body, 'body', { min: 1, max: 5000 });
    if (classRoomId !== null && typeof classRoomId !== 'string') {
      throw validationError('classRoomId must be a string or null');
    }
    if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
    validateAttachments(attachments);

    const now = new Date(this.clock()).toISOString();
    const postId = `post-${crypto.randomUUID()}`;
    const post = {
      id: postId,
      tenantId,
      authorUserId: author.userId,
      classRoomId: classRoomId ?? null,
      body: trimmedBody,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      deletedAt: null
    };
    this.posts.push(post);

    const storedAttachments = attachments.map((att, idx) => {
      const stored = {
        id: `att-${crypto.randomUUID()}`,
        postId,
        position: idx,
        fileName: att.fileName.trim(),
        mimeType: att.mimeType,
        sizeBytes: att.data.length,
        data: att.data
      };
      this.attachments.push(stored);
      return stored;
    });

    return { ...post, attachments: storedAttachments.map((a) => ({ ...a })) };
  }

  getAttachment(tenantId, attachmentId) {
    const att = this.attachments.find((a) => a.id === attachmentId);
    if (!att) return null;
    const post = this.posts.find((p) => p.id === att.postId && p.tenantId === tenantId);
    if (!post) return null;
    return { ...att };
  }

  editPost(tenantId, postId, actorUserId, { body, attachments = [] }, { now }) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    if (post.authorUserId !== actorUserId) {
      throw new ClassFeedError('Only the author can edit this post', { code: 'forbidden', status: 403 });
    }
    const createdAtMs = Date.parse(post.createdAt);
    if (now - createdAtMs > EDIT_WINDOW_MS) {
      throw new ClassFeedError('Edit window expired (1h)', { code: 'edit_window_expired', status: 422 });
    }

    const trimmedBody = requireString(body, 'body', { min: 1, max: 5000 });
    if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
    validateAttachments(attachments);

    const nowIso = new Date(now).toISOString();
    post.body = trimmedBody;
    post.updatedAt = nowIso;
    post.editedAt = nowIso;

    // Remplacer toutes les attachments (simple : on supprime les anciennes, on insère les nouvelles)
    this.attachments = this.attachments.filter((a) => a.postId !== postId);
    attachments.forEach((att, idx) => {
      this.attachments.push({
        id: `att-${crypto.randomUUID()}`,
        postId,
        position: idx,
        fileName: att.fileName.trim(),
        mimeType: att.mimeType,
        sizeBytes: att.data.length,
        data: att.data
      });
    });
    return { ...post };
  }

  softDeletePost(tenantId, postId, actorUserId, actorRole) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    if (post.authorUserId !== actorUserId && !POST_DELETE_ROLES.has(actorRole)) {
      throw new ClassFeedError('Only the author or admin/director can delete this post', { code: 'forbidden', status: 403 });
    }
    post.deletedAt = new Date(this.clock()).toISOString();
    return { ...post };
  }
```

- [ ] **Step 3: Lancer les tests, ils doivent passer**

```bash
node --test apps/web/src/modules/class-feed.test.js 2>&1 | tail -15
```

Expected : 19 pass (8 anciens + 11 nouveaux).

- [ ] **Step 4: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 436+ pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/class-feed.js apps/web/src/modules/class-feed.test.js
git commit -m "feat(class-feed): attachments (1..8 photos 3 Mo max) + edit 1h + soft-delete + 11 tests"
```

---

## Task 5: ClassFeedStore — comments + likes + reads + audience

**Files:**
- Modify: `apps/web/src/modules/class-feed.js`
- Modify: `apps/web/src/modules/class-feed.test.js`

- [ ] **Step 1: Tests à appender**

```javascript
test('ClassFeedStore.addComment: cree un commentaire et listComments retourne ASC', () => {
  const store = new ClassFeedStore({ clock: (() => { let t = 1000; return () => (t += 100); })() });
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const c1 = store.addComment('school-a', post.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'first');
  const c2 = store.addComment('school-a', post.id, { userId: 'parent-a2', role: 'parent', tenantId: 'school-a' }, 'second');
  const list = store.listComments('school-a', post.id);
  assert.equal(list.length, 2);
  assert.equal(list[0].body, 'first');
  assert.equal(list[1].body, 'second');
});

test('ClassFeedStore.addComment: rejette body > 2000', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  assert.throws(() => store.addComment('school-a', post.id, { userId: 'p', role: 'parent', tenantId: 'school-a' }, 'x'.repeat(2001)),
    (err) => err.code === 'validation_error');
});

test('ClassFeedStore.softDeleteComment: auteur OK', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const comment = store.addComment('school-a', post.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'hi');
  store.softDeleteComment('school-a', comment.id, 'parent-a1', 'parent');
  assert.equal(store.listComments('school-a', post.id).length, 0);
});

test('ClassFeedStore.softDeleteComment: admin OK + auteur du post OK + autre parent refuse', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const comment = store.addComment('school-a', post.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'hi');
  // Auteur du post OK (teacher-a1)
  const post2 = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const c2 = store.addComment('school-a', post2.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'hi');
  store.softDeleteComment('school-a', c2.id, 'teacher-a1', 'teacher');
  assert.equal(store.listComments('school-a', post2.id).length, 0);

  // Admin OK
  const post3 = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const c3 = store.addComment('school-a', post3.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'hi');
  store.softDeleteComment('school-a', c3.id, 'admin-a', 'school_admin');
  assert.equal(store.listComments('school-a', post3.id).length, 0);

  // Autre parent refuse
  const post4 = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const c4 = store.addComment('school-a', post4.id, { userId: 'parent-a1', role: 'parent', tenantId: 'school-a' }, 'hi');
  assert.throws(() => store.softDeleteComment('school-a', c4.id, 'parent-other', 'parent'),
    (err) => err.code === 'forbidden');
});

test('ClassFeedStore.toggleLike: 1er click ajoute, 2e click retire (idempotent)', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  let result = store.toggleLike('school-a', post.id, 'parent-a1');
  assert.equal(result.liked, true);
  assert.equal(result.count, 1);
  result = store.toggleLike('school-a', post.id, 'parent-a1');
  assert.equal(result.liked, false);
  assert.equal(result.count, 0);
});

test('ClassFeedStore.toggleLike: cross-user count correct', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.toggleLike('school-a', post.id, 'parent-a1');
  store.toggleLike('school-a', post.id, 'parent-a2');
  store.toggleLike('school-a', post.id, 'parent-a3');
  assert.equal(store.countLikes('school-a', post.id), 3);
});

test('ClassFeedStore.markRead: idempotent (re-mark ne double pas)', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.markRead('school-a', post.id, 'parent-a1');
  store.markRead('school-a', post.id, 'parent-a1');
  store.markRead('school-a', post.id, 'parent-a2');
  assert.equal(store.countReads('school-a', post.id), 2);
});

test('ClassFeedStore.listReadersForPost: liste users qui ont lu', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.markRead('school-a', post.id, 'parent-a1');
  store.markRead('school-a', post.id, 'parent-a2');
  const readers = store.listReadersForPost('school-a', post.id);
  assert.equal(readers.length, 2);
  assert.ok(readers.every((r) => typeof r.userId === 'string' && typeof r.readAt === 'string'));
});

test('ClassFeedStore.resolveAudience: post classe → callback parents+students de la classe', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  const audienceProvider = {
    getParentsForClass: (tenantId, classRoomId) => (classRoomId === 'class-cp-b' ? ['parent-a1', 'parent-a2'] : []),
    getAllParents: (tenantId) => ['parent-a1', 'parent-a2', 'parent-other']
  };
  const audience = store.resolveAudience('school-a', post, audienceProvider);
  // Exclut l'auteur
  assert.deepEqual(audience.sort(), ['parent-a1', 'parent-a2']);
});

test('ClassFeedStore.resolveAudience: post broadcast → tous parents tenant', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', { userId: 'admin-a', role: 'school_admin', tenantId: 'school-a' }, {
    classRoomId: null, body: 'x', attachments: []
  });
  const audienceProvider = {
    getParentsForClass: () => [],
    getAllParents: () => ['parent-a1', 'parent-a2', 'parent-a3']
  };
  const audience = store.resolveAudience('school-a', post, audienceProvider);
  assert.deepEqual(audience.sort(), ['parent-a1', 'parent-a2', 'parent-a3']);
});
```

- [ ] **Step 2: Étendre `class-feed.js`**

Constantes additionnelles :

```javascript
const COMMENT_DELETE_ROLES = new Set(['school_admin', 'director']);
```

Méthodes à ajouter dans la classe :

```javascript
  addComment(tenantId, postId, author, body) {
    const trimmedBody = requireString(body, 'body', { min: 1, max: 2000 });
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    const now = new Date(this.clock()).toISOString();
    const comment = {
      id: `comment-${crypto.randomUUID()}`,
      tenantId,
      postId,
      authorUserId: author.userId,
      body: trimmedBody,
      createdAt: now,
      deletedAt: null
    };
    this.comments.push(comment);
    return { ...comment };
  }

  listComments(tenantId, postId) {
    return this.comments
      .filter((c) => c.postId === postId && c.tenantId === tenantId && !c.deletedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((c) => ({ ...c }));
  }

  softDeleteComment(tenantId, commentId, actorUserId, actorRole) {
    const comment = this.comments.find((c) => c.id === commentId && c.tenantId === tenantId && !c.deletedAt);
    if (!comment) return null;
    const post = this.posts.find((p) => p.id === comment.postId);
    const isAuthor = comment.authorUserId === actorUserId;
    const isPostAuthor = post && post.authorUserId === actorUserId;
    const isAdmin = COMMENT_DELETE_ROLES.has(actorRole);
    if (!isAuthor && !isPostAuthor && !isAdmin) {
      throw new ClassFeedError('Only author, post author, or admin can delete this comment', { code: 'forbidden', status: 403 });
    }
    comment.deletedAt = new Date(this.clock()).toISOString();
    return { ...comment };
  }

  toggleLike(tenantId, postId, userId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    const existingIdx = this.likes.findIndex((l) => l.postId === postId && l.userId === userId);
    if (existingIdx >= 0) {
      this.likes.splice(existingIdx, 1);
      return { liked: false, count: this.countLikes(tenantId, postId) };
    }
    this.likes.push({ postId, userId, createdAt: new Date(this.clock()).toISOString() });
    return { liked: true, count: this.countLikes(tenantId, postId) };
  }

  countLikes(tenantId, postId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return 0;
    return this.likes.filter((l) => l.postId === postId).length;
  }

  markRead(tenantId, postId, userId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    const existing = this.reads.find((r) => r.postId === postId && r.userId === userId);
    if (existing) return { ...existing };
    const read = { postId, userId, readAt: new Date(this.clock()).toISOString() };
    this.reads.push(read);
    return { ...read };
  }

  countReads(tenantId, postId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return 0;
    return this.reads.filter((r) => r.postId === postId).length;
  }

  listReadersForPost(tenantId, postId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return [];
    return this.reads.filter((r) => r.postId === postId).map((r) => ({ ...r }));
  }

  resolveAudience(tenantId, post, audienceProvider) {
    let candidates;
    if (post.classRoomId === null) {
      candidates = audienceProvider.getAllParents(tenantId);
    } else {
      candidates = audienceProvider.getParentsForClass(tenantId, post.classRoomId);
    }
    return [...new Set(candidates)].filter((userId) => userId !== post.authorUserId);
  }
```

- [ ] **Step 3: Lancer tests**

```bash
node --test apps/web/src/modules/class-feed.test.js 2>&1 | tail -15
```

Expected : 29 pass / 0 fail.

- [ ] **Step 4: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 446+ pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/class-feed.js apps/web/src/modules/class-feed.test.js
git commit -m "feat(class-feed): comments + likes (toggle) + reads (idempotent) + resolveAudience + 10 tests"
```

---

## Task 6: PostgresClassFeedRepository + tests

**Files:**
- Create: `apps/web/src/modules/persistence/postgres-class-feed-repository.js`

**Pattern à copier:** `apps/web/src/modules/persistence/postgres-absence-notices-repository.js` (lecture + écriture BYTEA, validation similaire). Le repository expose la **même API** que `ClassFeedStore` (createPost, getPost, listPostsForClass, getAttachment, editPost, softDeletePost, addComment, listComments, softDeleteComment, toggleLike, countLikes, markRead, countReads, listReadersForPost, resolveAudience).

- [ ] **Step 1: Lire le pattern de référence**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
wc -l apps/web/src/modules/persistence/postgres-absence-notices-repository.js
head -60 apps/web/src/modules/persistence/postgres-absence-notices-repository.js
```

Noter la structure : `constructor({ pool })`, méthodes async, SQL via `pool.query(text, params)`, mêmes validations que le store in-memory (réutilisées via require du module).

- [ ] **Step 2: Créer le repository**

Créer `apps/web/src/modules/persistence/postgres-class-feed-repository.js` avec la structure suivante (mappers row→object + queries SQL) :

```javascript
const crypto = require('node:crypto');
const { ClassFeedError } = require('../class-feed');

const EDIT_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_POST = 8;
const POST_DELETE_ROLES = new Set(['school_admin', 'director']);
const COMMENT_DELETE_ROLES = new Set(['school_admin', 'director']);

function validationError(message) {
  return new ClassFeedError(message, { code: 'validation_error', status: 422 });
}

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authorUserId: row.author_user_id,
    classRoomId: row.class_room_id,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    editedAt: row.edited_at?.toISOString?.() ?? row.edited_at,
    deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at
  };
}

function rowToAttachment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    data: row.data
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    postId: row.post_id,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at
  };
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
  if (attachments.length > MAX_ATTACHMENTS_PER_POST) {
    throw validationError(`attachments must be at most ${MAX_ATTACHMENTS_PER_POST} items`);
  }
  attachments.forEach((att, idx) => {
    if (!att || typeof att !== 'object') throw validationError(`attachments[${idx}] invalid`);
    if (typeof att.fileName !== 'string' || att.fileName.length === 0 || att.fileName.length > 180) {
      throw validationError(`attachments[${idx}].fileName invalid`);
    }
    if (!ALLOWED_ATTACHMENT_MIMES.includes(att.mimeType)) {
      throw validationError(`attachments[${idx}].mimeType invalid`);
    }
    if (!Buffer.isBuffer(att.data) || att.data.length === 0 || att.data.length > MAX_ATTACHMENT_BYTES) {
      throw validationError(`attachments[${idx}].data invalid size`);
    }
  });
}

class PostgresClassFeedRepository {
  constructor({ pool }) {
    if (!pool) throw new Error('PostgresClassFeedRepository requires a pg pool');
    this.pool = pool;
  }

  async createPost(tenantId, author, { classRoomId, body, attachments = [] }) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 5000) throw validationError('body must be 1..5000 chars');
    validateAttachments(attachments);

    const postId = `post-${crypto.randomUUID()}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const postResult = await client.query(
        `INSERT INTO class_feed_posts (id, tenant_id, author_user_id, class_room_id, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [postId, tenantId, author.userId, classRoomId ?? null, trimmedBody]
      );
      const storedAttachments = [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const attId = `att-${crypto.randomUUID()}`;
        const res = await client.query(
          `INSERT INTO class_feed_post_attachments (id, post_id, position, file_name, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [attId, postId, i, att.fileName.trim(), att.mimeType, att.data.length, att.data]
        );
        storedAttachments.push(rowToAttachment(res.rows[0]));
      }
      await client.query('COMMIT');
      return { ...rowToPost(postResult.rows[0]), attachments: storedAttachments };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getPost(tenantId, postId, { includeDeleted = false } = {}) {
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      [postId, tenantId]
    );
    return rowToPost(result.rows[0]);
  }

  async listPostsForClass(tenantId, classRoomId, { limit = 20, before = null } = {}) {
    const params = [tenantId, classRoomId, limit];
    let extra = '';
    if (before) { params.push(before); extra = `AND created_at < $${params.length}`; }
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts
       WHERE tenant_id = $1 AND class_room_id = $2 AND deleted_at IS NULL ${extra}
       ORDER BY created_at DESC LIMIT $3`,
      params
    );
    return result.rows.map(rowToPost);
  }

  async getAttachment(tenantId, attachmentId) {
    const result = await this.pool.query(
      `SELECT a.* FROM class_feed_post_attachments a
       JOIN class_feed_posts p ON p.id = a.post_id
       WHERE a.id = $1 AND p.tenant_id = $2`,
      [attachmentId, tenantId]
    );
    return result.rows[0] ? rowToAttachment(result.rows[0]) : null;
  }

  async editPost(tenantId, postId, actorUserId, { body, attachments = [] }, { now }) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 5000) throw validationError('body must be 1..5000 chars');
    validateAttachments(attachments);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const postRes = await client.query(
        `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [postId, tenantId]
      );
      const post = postRes.rows[0];
      if (!post) { await client.query('ROLLBACK'); return null; }
      if (post.author_user_id !== actorUserId) {
        await client.query('ROLLBACK');
        throw new ClassFeedError('Only the author can edit', { code: 'forbidden', status: 403 });
      }
      const createdAtMs = new Date(post.created_at).getTime();
      if (now - createdAtMs > EDIT_WINDOW_MS) {
        await client.query('ROLLBACK');
        throw new ClassFeedError('Edit window expired', { code: 'edit_window_expired', status: 422 });
      }

      const nowIso = new Date(now).toISOString();
      const updated = await client.query(
        `UPDATE class_feed_posts SET body = $1, updated_at = $2, edited_at = $2 WHERE id = $3 RETURNING *`,
        [trimmedBody, nowIso, postId]
      );
      await client.query('DELETE FROM class_feed_post_attachments WHERE post_id = $1', [postId]);
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        await client.query(
          `INSERT INTO class_feed_post_attachments (id, post_id, position, file_name, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [`att-${crypto.randomUUID()}`, postId, i, att.fileName.trim(), att.mimeType, att.data.length, att.data]
        );
      }
      await client.query('COMMIT');
      return rowToPost(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async softDeletePost(tenantId, postId, actorUserId, actorRole) {
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [postId, tenantId]
    );
    const post = result.rows[0];
    if (!post) return null;
    if (post.author_user_id !== actorUserId && !POST_DELETE_ROLES.has(actorRole)) {
      throw new ClassFeedError('Forbidden', { code: 'forbidden', status: 403 });
    }
    const upd = await this.pool.query(
      `UPDATE class_feed_posts SET deleted_at = NOW() WHERE id = $1 RETURNING *`,
      [postId]
    );
    return rowToPost(upd.rows[0]);
  }

  async addComment(tenantId, postId, author, body) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 2000) throw validationError('body must be 1..2000 chars');
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    const commentId = `comment-${crypto.randomUUID()}`;
    const res = await this.pool.query(
      `INSERT INTO class_feed_post_comments (id, tenant_id, post_id, author_user_id, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [commentId, tenantId, postId, author.userId, trimmedBody]
    );
    return rowToComment(res.rows[0]);
  }

  async listComments(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT * FROM class_feed_post_comments
       WHERE post_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [postId, tenantId]
    );
    return res.rows.map(rowToComment);
  }

  async softDeleteComment(tenantId, commentId, actorUserId, actorRole) {
    const res = await this.pool.query(
      `SELECT c.*, p.author_user_id AS post_author FROM class_feed_post_comments c
       JOIN class_feed_posts p ON p.id = c.post_id
       WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
      [commentId, tenantId]
    );
    const row = res.rows[0];
    if (!row) return null;
    const isAuthor = row.author_user_id === actorUserId;
    const isPostAuthor = row.post_author === actorUserId;
    const isAdmin = COMMENT_DELETE_ROLES.has(actorRole);
    if (!isAuthor && !isPostAuthor && !isAdmin) {
      throw new ClassFeedError('Forbidden', { code: 'forbidden', status: 403 });
    }
    const upd = await this.pool.query(
      `UPDATE class_feed_post_comments SET deleted_at = NOW() WHERE id = $1 RETURNING *`,
      [commentId]
    );
    return rowToComment(upd.rows[0]);
  }

  async toggleLike(tenantId, postId, userId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    const existing = await this.pool.query(
      `SELECT 1 FROM class_feed_post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    if (existing.rows.length > 0) {
      await this.pool.query(`DELETE FROM class_feed_post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
      const count = await this.countLikes(tenantId, postId);
      return { liked: false, count };
    }
    await this.pool.query(
      `INSERT INTO class_feed_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
    const count = await this.countLikes(tenantId, postId);
    return { liked: true, count };
  }

  async countLikes(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM class_feed_post_likes l
       JOIN class_feed_posts p ON p.id = l.post_id
       WHERE l.post_id = $1 AND p.tenant_id = $2`,
      [postId, tenantId]
    );
    return res.rows[0].n;
  }

  async markRead(tenantId, postId, userId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    await this.pool.query(
      `INSERT INTO class_feed_post_reads (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
    return { postId, userId, readAt: new Date().toISOString() };
  }

  async countReads(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM class_feed_post_reads r
       JOIN class_feed_posts p ON p.id = r.post_id
       WHERE r.post_id = $1 AND p.tenant_id = $2`,
      [postId, tenantId]
    );
    return res.rows[0].n;
  }

  async listReadersForPost(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT r.user_id, r.read_at FROM class_feed_post_reads r
       JOIN class_feed_posts p ON p.id = r.post_id
       WHERE r.post_id = $1 AND p.tenant_id = $2 ORDER BY r.read_at ASC`,
      [postId, tenantId]
    );
    return res.rows.map((row) => ({
      postId,
      userId: row.user_id,
      readAt: row.read_at?.toISOString?.() ?? row.read_at
    }));
  }

  async resolveAudience(tenantId, post, audienceProvider) {
    let candidates;
    if (post.classRoomId === null) {
      candidates = await audienceProvider.getAllParents(tenantId);
    } else {
      candidates = await audienceProvider.getParentsForClass(tenantId, post.classRoomId);
    }
    return [...new Set(candidates)].filter((userId) => userId !== post.authorUserId);
  }
}

module.exports = { PostgresClassFeedRepository };
```

- [ ] **Step 3: Vérifier que le module charge sans erreur**

```bash
node -e "require('./apps/web/src/modules/persistence/postgres-class-feed-repository.js'); console.log('OK');"
```

Expected : OK.

- [ ] **Step 4: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 446 pass / 0 fail (le repository n'est pas encore branché, donc les tests memory passent).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/persistence/postgres-class-feed-repository.js
git commit -m "feat(class-feed): PostgresClassFeedRepository (meme API que ClassFeedStore)

Pattern repris de postgres-absence-notices-repository.
Transactions BEGIN/COMMIT pour createPost et editPost (post + N attachments atomiques).
ON CONFLICT DO NOTHING pour likes/reads (idempotence native PK composite)."
```

---

## Task 7: Wire stores dans createServer + email config

**Files:**
- Modify: `apps/web/src/server.js` (require + injection dans createServer)

- [ ] **Step 1: Ajouter les requires en haut**

Trouver les autres `require('./modules/...')` (vers ligne 90+) et ajouter :

```javascript
const { ClassFeedStore } = require('./modules/class-feed');
const { PostgresClassFeedRepository } = require('./modules/persistence/postgres-class-feed-repository');
const { EmailService } = require('./modules/email');
```

- [ ] **Step 2: Étendre la signature de `createServer`**

Trouver :
```bash
grep -n "function createServer({" apps/web/src/server.js
```

Dans les paramètres avec defaults, ajouter avant la fermeture `}) {` :

```javascript
  classFeedStore,
  emailService,
```

- [ ] **Step 3: Initialiser les stores après les autres**

Trouver la section où les autres stores sont initialisés selon `runtimeEnv.persistenceMode` (chercher `persistenceMode === 'postgres'`). Ajouter :

```javascript
  if (!classFeedStore) {
    classFeedStore = runtimeEnv.persistenceMode === 'postgres'
      ? new PostgresClassFeedRepository({ pool: getPool() })
      : new ClassFeedStore({ posts: seed.classFeedPosts ?? [], attachments: seed.classFeedAttachments ?? [], comments: seed.classFeedComments ?? [], likes: seed.classFeedLikes ?? [], reads: seed.classFeedReads ?? [] });
  }
  if (!emailService) {
    emailService = new EmailService({
      apiKey: runtimeEnv.resendApiKey,
      fromAddress: runtimeEnv.mailFromAddress,
      fromName: runtimeEnv.mailFromName,
      logger: logger.child({ module: 'email' })
    });
  }
```

- [ ] **Step 4: Smoke test (le serveur démarre toujours)**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4501 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2
curl -s -o /dev/null -w "STATUS=%{http_code}\n" http://localhost:4501/login
kill $SERVER_PID 2>/dev/null
```

Expected : STATUS=200.

- [ ] **Step 5: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 446 pass / 0 fail (pas de nouveaux tests, juste wiring).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server.js
git commit -m "wire(class-feed): injecte ClassFeedStore + EmailService dans createServer

Selection auto memory/postgres via runtimeEnv.persistenceMode.
EmailService en mode no-op si RESEND_API_KEY absent."
```

---

## Task 8: CSS additions pour feed components

**Files:**
- Modify: `apps/web/src/server.js` (DESIGN_SYSTEM_CSS — ajout à la fin avant le backtick fermant)

- [ ] **Step 1: Localiser la fin de DESIGN_SYSTEM_CSS**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
grep -n "^const EDUCLINK_LOGO_SVG\|^const THEME_TOGGLE_SVG" apps/web/src/server.js
```

Identifier le `\`;` qui ferme `DESIGN_SYSTEM_CSS` juste avant la déclaration `EDUCLINK_LOGO_SVG`. Insérer le nouveau CSS avant ce backtick.

- [ ] **Step 2: Insérer le bloc CSS feed components**

```css

/* ============================================================
   Klassly-feed : feed, composer, post cards, comments
   ============================================================ */

.el-feed {
  max-width: 720px;
  margin: 0 auto;
}

.el-feed-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--el-color-text-secondary);
}

.el-feed-load-more {
  text-align: center;
  margin: var(--el-space-6) 0;
}

/* Composer (top sticky) */
.el-feed-composer {
  background: var(--el-color-surface);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-4);
  box-shadow: var(--el-shadow-sm);
  margin-bottom: var(--el-space-5);
}
.el-feed-composer-collapsed {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  background: var(--el-color-bg-soft);
  border-radius: var(--el-radius-full);
  color: var(--el-color-text-secondary);
  cursor: pointer;
  font-weight: 600;
  transition: background-color var(--el-transition);
}
.el-feed-composer-collapsed:hover { background: var(--el-color-surface-alt); }
.el-feed-composer.is-expanded .el-feed-composer-collapsed { display: none; }
.el-feed-composer-expanded { display: none; }
.el-feed-composer.is-expanded .el-feed-composer-expanded { display: block; }
.el-feed-photo-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.el-feed-photo-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--el-radius-sm);
  border: 1px solid var(--el-color-border);
}

/* Post card */
.el-post-card {
  background: var(--el-color-surface);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-5);
  box-shadow: var(--el-shadow-sm);
  margin-bottom: var(--el-space-5);
}
.el-post-header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: var(--el-space-3);
}
.el-post-header-meta { flex: 1; }
.el-post-author-name {
  font-weight: 700;
  color: var(--el-color-text);
  font-size: var(--el-text-sm);
}
.el-post-meta {
  font-size: var(--el-text-xs);
  color: var(--el-color-text-secondary);
}
.el-post-body {
  font-size: var(--el-text-base);
  line-height: 1.6;
  margin-bottom: var(--el-space-4);
  white-space: pre-wrap;
}
.el-edited-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: var(--el-text-xs);
  color: var(--el-color-text-secondary);
  font-style: italic;
}

/* Photo mosaic */
.el-post-photos {
  display: grid;
  gap: 4px;
  border-radius: var(--el-radius-md);
  overflow: hidden;
  margin-bottom: var(--el-space-4);
}
.el-post-photos img { width: 100%; height: 100%; object-fit: cover; display: block; }
.el-post-photos.is-1 { grid-template-columns: 1fr; }
.el-post-photos.is-1 img { max-height: 480px; }
.el-post-photos.is-2 { grid-template-columns: 1fr 1fr; aspect-ratio: 2 / 1; }
.el-post-photos.is-3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; aspect-ratio: 2 / 1.2; }
.el-post-photos.is-3 > :first-child { grid-row: span 2; }
.el-post-photos.is-4plus { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; aspect-ratio: 1; }
.el-post-overlay-count {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: var(--el-text-2xl);
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}
.el-post-overlay-count img { position: absolute; inset: 0; z-index: -1; }

/* Actions (like, comments) */
.el-post-actions {
  display: flex;
  gap: 8px;
  padding-top: var(--el-space-3);
  border-top: 1px solid var(--el-color-border);
}
.el-post-actions-button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--el-radius-md);
  background: transparent;
  color: var(--el-color-text-secondary);
  font-size: var(--el-text-sm);
  font-weight: 600;
  cursor: pointer;
  border: none;
  box-shadow: none;
  transition: background-color var(--el-transition), color var(--el-transition);
}
.el-post-actions-button:hover {
  background: rgba(79, 70, 229, 0.08);
  color: var(--el-color-primary);
  transform: none;
}
.el-post-actions-button.is-liked {
  color: var(--el-color-primary);
}

/* Comments section */
.el-comments-section {
  margin-top: var(--el-space-3);
  padding-top: var(--el-space-3);
  border-top: 1px solid var(--el-color-border);
}
.el-comment {
  display: flex;
  gap: 8px;
  margin-bottom: var(--el-space-3);
}
.el-comment-bubble {
  flex: 1;
  background: var(--el-color-bg-soft);
  border-radius: var(--el-radius-lg);
  padding: 8px 12px;
}
.el-comment-author {
  font-weight: 700;
  font-size: var(--el-text-sm);
  color: var(--el-color-text);
  display: inline;
  margin-right: 6px;
}
.el-comment-body {
  display: inline;
  font-size: var(--el-text-sm);
  color: var(--el-color-text);
}
.el-comment-meta {
  font-size: var(--el-text-xs);
  color: var(--el-color-text-secondary);
  margin-top: 4px;
}
.el-comment-input {
  width: 100%;
  padding: 10px 16px;
  border-radius: var(--el-radius-full);
  border: 1.5px solid var(--el-color-border);
  font-family: var(--el-font-sans);
  font-size: var(--el-text-sm);
}
```

- [ ] **Step 3: Vérifier que le module charge + le CSS est servi**

```bash
node -e "require('./apps/web/src/server.js'); console.log('OK');"
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4502 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2
curl -s http://localhost:4502/assets/design-system.css | grep -o "\.el-post-card\|\.el-feed-composer\|\.el-comment-bubble" | sort -u
kill $SERVER_PID 2>/dev/null
```

Expected : 3 matches.

- [ ] **Step 4: Suite**

```bash
npm test 2>&1 | tail -5
```

Expected : 446 pass / 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(class-feed): CSS additions (feed, composer, post-card, photos mosaic, comments, actions)

~15 nouvelles classes utilisant les tokens design system existants.
Mosaic photos responsive (1, 2, 3, 4+ avec overlay +N).
Composer expand-on-click. Comments bubble style messaging."
```

---

## Task 9: UX_SCRIPT_JS extensions + meta csrf token

**Files:**
- Modify: `apps/web/src/server.js` (UX_SCRIPT_JS + renderPageHead)

- [ ] **Step 1: Ajouter le meta csrf token dans renderPageHead**

Trouver `function renderPageHead(title)` :
```bash
grep -n "function renderPageHead" apps/web/src/server.js
```

Le helper actuel ne connaît pas la session. On va ajouter une variante qui prend le token CSRF en argument. Mais pour minimiser les changements, on étend la fonction existante avec un 2e paramètre optionnel :

Trouver :
```javascript
function renderPageHead(title) {
  return `<meta charset="utf-8">...`;
}
```

Remplacer par :
```javascript
function renderPageHead(title, csrfToken = '') {
  const csrfMeta = csrfToken ? `<meta name="el-csrf-token" content="${csrfToken}">` : '';
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${csrfMeta}<script>${THEME_BOOTSTRAP_JS}</script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"><link rel="stylesheet" href="/assets/design-system.css"><script src="/assets/ux.js" defer></script>`;
}
```

⚠️ Les call sites existants passant `renderPageHead(title)` continuent de fonctionner (csrfToken default à ''). Les nouvelles pages feed passeront `renderPageHead(title, session.csrfToken)`.

- [ ] **Step 2: Étendre UX_SCRIPT_JS**

Trouver `const UX_SCRIPT_JS = ` et remplacer la constante par cette version étendue (garde les handlers existants en haut) :

```javascript
const UX_SCRIPT_JS = `(function () {
  // ---- Confirmation des actions destructives (existant) ----
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    var message = form.getAttribute('data-confirm');
    if (!message) return;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });

  // ---- Toggle theme jour/nuit (existant) ----
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('el-theme', theme); } catch (e) {}
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    while (target && target !== document.body) {
      if (target.classList && target.classList.contains('el-theme-toggle')) {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
        return;
      }
      target = target.parentNode;
    }
  });

  // ---- Avatar palette helper (existant) ----
  window.elAvatarPaletteFor = function (userId) {
    if (typeof userId !== 'string' || userId.length === 0) return 1;
    var hash = 0;
    for (var i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 6 + 1;
  };

  // ---- CSRF token global (lu depuis meta el-csrf-token) ----
  window.elCsrfToken = '';
  document.addEventListener('DOMContentLoaded', function () {
    var meta = document.querySelector('meta[name="el-csrf-token"]');
    if (meta) window.elCsrfToken = meta.getAttribute('content') || '';
  });

  // ---- Debounce helper ----
  window.elDebounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };

  // ---- Composer expand on click ----
  document.addEventListener('click', function (event) {
    var collapsed = event.target.closest && event.target.closest('.el-feed-composer-collapsed');
    if (!collapsed) return;
    var composer = collapsed.closest('.el-feed-composer');
    if (composer) {
      composer.classList.add('is-expanded');
      var textarea = composer.querySelector('textarea');
      if (textarea) textarea.focus();
    }
  });

  // ---- Photo previews avant upload ----
  document.addEventListener('change', function (event) {
    if (!event.target.matches('input[type="file"][data-feed-photos]')) return;
    var preview = document.querySelector('.el-feed-photo-previews');
    if (!preview) return;
    preview.innerHTML = '';
    var files = Array.from(event.target.files).slice(0, 8);
    files.forEach(function (file) {
      var url = URL.createObjectURL(file);
      var img = document.createElement('img');
      img.src = url;
      img.className = 'el-feed-photo-thumb';
      preview.appendChild(img);
    });
  });

  // ---- Like toggle (optimistic UI) ----
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.matches('form[data-feed-like]')) return;
    event.preventDefault();
    var btn = form.querySelector('button');
    if (!btn) return;
    var countSpan = btn.querySelector('.el-like-count');
    var wasLiked = btn.classList.contains('is-liked');
    var currentCount = parseInt(countSpan ? countSpan.textContent : '0', 10) || 0;
    btn.classList.toggle('is-liked');
    if (countSpan) countSpan.textContent = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
    fetch(form.action, {
      method: 'POST',
      headers: { 'X-CSRF-Token': window.elCsrfToken, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '_csrf=' + encodeURIComponent(window.elCsrfToken)
    }).catch(function () {
      btn.classList.toggle('is-liked');
      if (countSpan) countSpan.textContent = currentCount;
    });
  });

  // ---- Auto-mark-as-read au scroll ----
  var markedRead = new Set();
  function checkVisiblePosts() {
    var cards = document.querySelectorAll('.el-post-card[data-post-id]:not([data-read="1"])');
    cards.forEach(function (card) {
      var rect = card.getBoundingClientRect();
      if (rect.top < (window.innerHeight || document.documentElement.clientHeight) * 0.7 && rect.bottom > 0) {
        var id = card.dataset.postId;
        if (markedRead.has(id)) return;
        markedRead.add(id);
        card.dataset.read = '1';
        if (!window.elCsrfToken) return;
        fetch('/class-feed/posts/' + encodeURIComponent(id) + '/read', {
          method: 'POST',
          headers: { 'X-CSRF-Token': window.elCsrfToken, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: '_csrf=' + encodeURIComponent(window.elCsrfToken)
        }).catch(function () { markedRead.delete(id); card.removeAttribute('data-read'); });
      }
    });
  }
  document.addEventListener('scroll', window.elDebounce(checkVisiblePosts, 300), { passive: true });
  document.addEventListener('DOMContentLoaded', checkVisiblePosts);
})();
`;
```

⚠️ Le `THEME_BOOTSTRAP_JS` du Sprint design **reste inchangé**. Si tu modifies `UX_SCRIPT_JS` par contre, ça ne touche pas le hash CSP (le hash ne couvre que `THEME_BOOTSTRAP_JS`, pas `UX_SCRIPT_JS` qui est servi via `/assets/ux.js` couvert par `script-src 'self'`).

- [ ] **Step 3: Smoke test**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4503 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2
curl -s http://localhost:4503/assets/ux.js | grep -c "elCsrfToken\|elDebounce\|el-feed-composer-collapsed\|data-feed-like\|markedRead"
kill $SERVER_PID 2>/dev/null
```

Expected : 5+ matches.

- [ ] **Step 4: Suite tests existants**

```bash
npm test 2>&1 | tail -5
```

Expected : 446 pass / 0 fail (les tests CSP existants doivent toujours passer — le hash THEME_BOOTSTRAP_JS n'a pas changé).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(class-feed): UX_SCRIPT_JS - composer expand + photo preview + like toggle + auto-mark-read + csrf meta

renderPageHead accepte csrfToken (optionnel, retrocompat).
Nouveaux handlers : composer expand, photo previews, like optimistic UI, auto-read au scroll.
Helpers window : elCsrfToken, elDebounce."
```

---

## Task 10: Sidebar nav entry + GET /class-feed (class selector)

**Files:**
- Modify: `apps/web/src/server.js` (buildDashboardNavigation + nouvelle route)

- [ ] **Step 1: Ajouter l'entrée sidebar**

Trouver `function buildDashboardNavigation` :
```bash
grep -n "function buildDashboardNavigation" apps/web/src/server.js
```

Identifier la structure (probablement un array d'objets `{href, label, ...}`). Localiser l'entrée "Présences" et ajouter juste après :

```javascript
    { href: '/class-feed', label: '📰 Mur de la classe', roles: ['school_admin', 'director', 'teacher', 'parent', 'student'] },
```

⚠️ Adapter la syntaxe au format exact utilisé (peut être `{href, label, allowedRoles}` ou autre). Garder la cohérence avec les autres items.

- [ ] **Step 2: Écrire le test integration**

Append à `apps/web/src/server.test.js` :

```javascript
test('Klassly-feed: GET /class-feed accessible aux 5 roles', async () => {
  await withServer(async (baseUrl) => {
    for (const email of ['admin@school-a.test', 'director@school-a.test', 'teacher@school-a.test', 'parent@school-a.test', 'student@school-a.test']) {
      const { cookie } = await login(baseUrl, email);
      const response = await fetch(`${baseUrl}/class-feed`, { headers: { cookie } });
      assert.equal(response.status, 200, `failed for ${email}`);
    }
  });
});

test('Klassly-feed: GET /class-feed sans session redirige /login', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/class-feed`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/login/);
  });
});
```

- [ ] **Step 3: Lancer le test, doit échouer (route absente)**

```bash
node --test --test-name-pattern "Klassly-feed: GET /class-feed" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected : FAIL (404).

- [ ] **Step 4: Implémenter la route**

Localiser un endroit logique pour ajouter la route (juste après une autre route GET, par exemple après `/admin/vie-scolaire` ou similaire) :

```javascript
    if (request.method === 'GET' && url.pathname === '/class-feed') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login' });
        response.end();
        return;
      }
      const classes = listClassesForUser(auth.context, { coreSchoolStore, teacherStore, studentStore, parentStore, studentParentLinks: studentParentLinkStore });
      // Si une seule classe et pas admin/director, redirect direct
      if (classes.length === 1 && !['school_admin', 'director'].includes(auth.context.role)) {
        response.writeHead(302, { location: `/class-feed/classes/${classes[0].id}` });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderClassFeedSelectionPage(session, classes));
      return;
    }
```

Ajouter le helper `listClassesForUser` (au-dessus de createServer, dans la zone des helpers métier) :

```javascript
function listClassesForUser(context, stores) {
  const { coreSchoolStore, teacherStore, studentStore, parentStore, studentParentLinks } = stores;
  const tenantId = context.tenantId;
  if (!tenantId) return [];
  const allClasses = coreSchoolStore.list('classRooms', tenantId);
  if (['school_admin', 'director'].includes(context.role)) return allClasses;
  if (context.role === 'teacher') {
    const teacher = teacherStore.list(tenantId).find((t) => t.id === context.userId || t.userId === context.userId);
    if (!teacher) return [];
    return allClasses.filter((c) => teacher.classRoomIds.includes(c.id));
  }
  if (context.role === 'parent') {
    const links = studentParentLinks.listForParent ? studentParentLinks.listForParent(tenantId, context.userId) : [];
    const studentIds = new Set(links.map((l) => l.studentId));
    const students = studentStore.list(tenantId).filter((s) => studentIds.has(s.id));
    const classIds = new Set(students.map((s) => s.classRoomId).filter(Boolean));
    return allClasses.filter((c) => classIds.has(c.id));
  }
  if (context.role === 'student') {
    const student = studentStore.list(tenantId).find((s) => s.id === context.userId);
    if (!student || !student.classRoomId) return [];
    return allClasses.filter((c) => c.id === student.classRoomId);
  }
  return [];
}
```

⚠️ Vérifier les noms exacts des stores et de leurs méthodes via :
```bash
grep -n "teacherStore.list\|studentParentLink\|listForParent" apps/web/src/server.js | head -10
```

Adapter `listForParent` si la méthode s'appelle différemment dans le store existant.

Ajouter le helper de rendu :

```javascript
function renderClassFeedSelectionPage(session, classes) {
  const cards = classes.length === 0
    ? '<div class="el-empty"><p class="el-empty-title">Aucune classe accessible</p></div>'
    : classes.map((c) => `
        <a class="el-card is-interactive" href="/class-feed/classes/${escapeHtml(c.id)}" style="display:block;text-decoration:none;color:inherit;">
          <h3>${escapeHtml(c.name)}</h3>
          <p class="el-muted">Voir le mur de la classe →</p>
        </a>
      `).join('');
  const broadcastCard = ['school_admin', 'director'].includes(session.role)
    ? `<a class="el-card is-highlight is-interactive" href="/class-feed/broadcast" style="display:block;text-decoration:none;color:inherit;">
         <h3>📣 Annonce à toute l'école</h3>
         <p class="el-muted">Publier un post visible par toutes les classes</p>
       </a>`
    : '';
  return renderDashboardLayout('Mur de la classe — EducLink', session, `
    <h1>Mur de la classe</h1>
    <p>Choisis une classe pour voir son fil d'actualité.</p>
    ${broadcastCard}
    ${cards}
  `);
}
```

- [ ] **Step 5: Re-lancer le test**

```bash
node --test --test-name-pattern "Klassly-feed: GET /class-feed" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected : 2 pass.

- [ ] **Step 6: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 448+ pass / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(class-feed): sidebar nav + GET /class-feed (class selector + 2 tests)

Entree sidebar 'Mur de la classe' (5 roles).
Selection page liste les classes accessibles selon role.
Redirect direct si 1 seule classe (et pas admin/director).
Lien broadcast si admin/director."
```

---

## Task 11: GET /class-feed/classes/:classId (feed + composer + cards)

**Files:**
- Modify: `apps/web/src/server.js` (route + helpers de rendu)

- [ ] **Step 1: Test integration**

Append :

```javascript
test('Klassly-feed: GET /class-feed/classes/:id — teacher voit le feed de SA classe (200)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('el-feed-composer'), 'composer present pour teacher');
  });
});

test('Klassly-feed: GET /class-feed/classes/:id — teacher refuse pour classe pas la sienne (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/class-feed/classes/class-other`, { headers: { cookie }, redirect: 'manual' });
    assert.ok([403, 404].includes(response.status));
  });
});

test('Klassly-feed: GET /class-feed/classes/:id — parent voit (sans composer)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(html.includes('el-feed-composer'), false, 'composer ABSENT pour parent');
  });
});
```

⚠️ Adapter `class-cp-b` et `class-other` aux IDs réels du seed (vérifier `grep -n "class-cp-b\|classRoomId" packages/database/src/seed.js`).

- [ ] **Step 2: Lancer test, doit échouer**

```bash
node --test --test-name-pattern "Klassly-feed: GET /class-feed/classes" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected : FAIL.

- [ ] **Step 3: Implémenter la route**

```javascript
    {
      const m = url.pathname.match(/^\/class-feed\/classes\/([^/]+)$/);
      if (m && request.method === 'GET') {
        const auth = requireAuth(session);
        if (!auth.allowed) {
          response.writeHead(302, { location: '/login' });
          response.end();
          return;
        }
        const classRoomId = m[1];
        const classRoom = coreSchoolStore.get('classRooms', auth.context.tenantId, classRoomId);
        if (!classRoom) {
          sendNotFoundPage(response, session);
          return;
        }
        // Permission : doit avoir accès à cette classe
        const accessibleClasses = listClassesForUser(auth.context, { coreSchoolStore, teacherStore, studentStore, parentStore, studentParentLinks: studentParentLinkStore });
        if (!accessibleClasses.some((c) => c.id === classRoomId)) {
          sendForbiddenPage(response, session);
          return;
        }
        const posts = await Promise.resolve(classFeedStore.listPostsForClass(auth.context.tenantId, classRoomId, { limit: 20 }));
        const enriched = await enrichPostsForRender(posts, classFeedStore, auth.context, { userIdentityCache, parentStore, teacherStore });
        const canCompose = auth.context.role === 'teacher' && (teacherStore.list(auth.context.tenantId).find((t) => t.id === auth.context.userId || t.userId === auth.context.userId)?.classRoomIds || []).includes(classRoomId);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderClassFeedPage(session, { classRoom, posts: enriched, canCompose }));
        return;
      }
    }
```

Helper `enrichPostsForRender` (lit les attachments, likes, comments, reads pour chaque post — un seul appel par batch, en utilisant les méthodes du store) :

```javascript
async function enrichPostsForRender(posts, store, viewerContext, stores) {
  const enriched = [];
  for (const post of posts) {
    const attachments = await Promise.resolve(store.listPostAttachmentsForRender ? store.listPostAttachmentsForRender(post.tenantId, post.id) : []);
    // En l'absence d'une méthode dédiée, on utilise le fait que createPost retourne attachments — mais pour un read on a besoin d'une méthode listAttachmentsForPost. Ajouter au store si manquante.
    const comments = await Promise.resolve(store.listComments(post.tenantId, post.id));
    const likeCount = await Promise.resolve(store.countLikes(post.tenantId, post.id));
    const readCount = await Promise.resolve(store.countReads(post.tenantId, post.id));
    enriched.push({ ...post, attachments, comments, likeCount, readCount });
  }
  return enriched;
}
```

⚠️ Note : il manque dans `ClassFeedStore` une méthode pour lister les attachments d'un post. Ajouter `listAttachmentsForPost(tenantId, postId)` dans la classe et le repo postgres (1 ligne) :

```javascript
  // ClassFeedStore
  listAttachmentsForPost(tenantId, postId) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return [];
    return this.attachments.filter((a) => a.postId === postId).sort((a, b) => a.position - b.position).map((a) => ({ ...a }));
  }
```

```javascript
  // PostgresClassFeedRepository
  async listAttachmentsForPost(tenantId, postId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return [];
    const res = await this.pool.query(
      `SELECT * FROM class_feed_post_attachments WHERE post_id = $1 ORDER BY position ASC`,
      [postId]
    );
    return res.rows.map(rowToAttachment);
  }
```

Et ajuster `enrichPostsForRender` pour appeler cette méthode :

```javascript
    const attachments = await Promise.resolve(store.listAttachmentsForPost(post.tenantId, post.id));
```

Helper de rendu de la page feed :

```javascript
function renderClassFeedPage(session, { classRoom, posts, canCompose }) {
  const composer = canCompose ? renderComposer(session, classRoom.id) : '';
  const postsHtml = posts.length === 0
    ? '<div class="el-feed-empty"><p>Aucun post pour le moment. Soyez le premier à partager un moment !</p></div>'
    : posts.map((p) => renderPostCard(session, p)).join('');
  return renderDashboardLayout(`Mur — ${classRoom.name}`, session, `
    <div class="el-feed">
      <h1>📰 Mur de ${escapeHtml(classRoom.name)}</h1>
      ${composer}
      ${postsHtml}
    </div>
  `, { csrfToken: session.csrfToken });
}

function renderComposer(session, classRoomId) {
  return `
    <div class="el-feed-composer">
      <div class="el-feed-composer-collapsed">Partager un moment avec la classe...</div>
      <form class="el-feed-composer-expanded" method="POST" action="/class-feed/posts" enctype="multipart/form-data">
        ${csrfField(session)}
        <input type="hidden" name="classRoomId" value="${escapeHtml(classRoomId)}">
        <textarea name="body" rows="4" placeholder="Quoi de neuf ?" required minlength="1" maxlength="5000" style="width:100%;"></textarea>
        <div class="el-feed-photo-previews"></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;">
          <label class="el-button-secondary" style="cursor:pointer;">
            📷 Photos (max 8)
            <input type="file" name="photos" data-feed-photos multiple accept="image/png,image/jpeg,image/webp" style="display:none;">
          </label>
          <button type="submit" style="margin-left:auto;">Publier</button>
        </div>
      </form>
    </div>
  `;
}

function renderPostCard(session, post) {
  const author = post.authorIdentity || { name: post.authorUserId, role: 'teacher' };
  const initials = (author.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const paletteIdx = avatarPaletteFor(post.authorUserId);
  const timeAgo = formatTimeAgo(post.createdAt);
  const editedTag = post.editedAt ? '<span class="el-edited-tag">(modifié)</span>' : '';
  const readMeta = post.readCount !== undefined ? `· 👁 ${post.readCount} lus` : '';
  const photosHtml = renderPostPhotos(post.attachments || []);
  const commentsHtml = renderCommentsSection(session, post);
  const likedByMe = (post.likedByMe === true);
  const likeBtnClass = likedByMe ? 'el-post-actions-button is-liked' : 'el-post-actions-button';
  return `
    <article class="el-post-card" data-post-id="${escapeHtml(post.id)}">
      <header class="el-post-header">
        <span class="el-avatar is-palette-${paletteIdx}">${escapeHtml(initials)}</span>
        <div class="el-post-header-meta">
          <div class="el-post-author-name">${escapeHtml(author.name)}</div>
          <div class="el-post-meta">${escapeHtml(author.role || '')} · ${timeAgo} ${readMeta}</div>
        </div>
      </header>
      <div class="el-post-body">${escapeHtml(post.body)}${editedTag}</div>
      ${photosHtml}
      <footer class="el-post-actions">
        <form method="POST" action="/class-feed/posts/${escapeHtml(post.id)}/like" data-feed-like style="flex:1;">
          ${csrfField(session)}
          <button type="submit" class="${likeBtnClass}">♡ <span class="el-like-count">${post.likeCount || 0}</span></button>
        </form>
        <a class="el-post-actions-button" href="#post-${escapeHtml(post.id)}-comments">💬 ${(post.comments || []).length}</a>
      </footer>
      ${commentsHtml}
    </article>
  `;
}

function renderPostPhotos(attachments) {
  if (!attachments || attachments.length === 0) return '';
  const n = attachments.length;
  let layoutClass = 'is-1';
  if (n === 2) layoutClass = 'is-2';
  else if (n === 3) layoutClass = 'is-3';
  else if (n >= 4) layoutClass = 'is-4plus';

  const visible = n > 4 ? attachments.slice(0, 4) : attachments;
  const extra = n - 4;
  const imgs = visible.map((a, idx) => {
    const isLastWithOverlay = idx === 3 && extra > 0;
    const src = `/class-feed/attachments/${escapeHtml(a.id)}`;
    if (isLastWithOverlay) {
      return `<div class="el-post-overlay-count"><img src="${src}" alt=""/>+${extra}</div>`;
    }
    return `<img src="${src}" alt="${escapeHtml(a.fileName || '')}"/>`;
  }).join('');
  return `<div class="el-post-photos ${layoutClass}">${imgs}</div>`;
}

function renderCommentsSection(session, post) {
  const comments = (post.comments || []).map((c) => {
    const author = c.authorIdentity || { name: c.authorUserId };
    const initials = (author.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    const paletteIdx = avatarPaletteFor(c.authorUserId);
    return `
      <div class="el-comment">
        <span class="el-avatar is-small is-palette-${paletteIdx}">${escapeHtml(initials)}</span>
        <div class="el-comment-bubble">
          <span class="el-comment-author">${escapeHtml(author.name)}</span>
          <span class="el-comment-body">${escapeHtml(c.body)}</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="el-comments-section" id="post-${escapeHtml(post.id)}-comments">
      ${comments}
      <form method="POST" action="/class-feed/posts/${escapeHtml(post.id)}/comments">
        ${csrfField(session)}
        <input type="text" name="body" class="el-comment-input" placeholder="Ajouter un commentaire..." required minlength="1" maxlength="2000">
      </form>
    </div>
  `;
}

function avatarPaletteFor(userId) {
  if (typeof userId !== 'string' || userId.length === 0) return 1;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 6 + 1;
}

function formatTimeAgo(iso) {
  const now = Date.now();
  const then = Date.parse(iso);
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `il y a ${diffD} j`;
  return new Date(then).toLocaleDateString('fr-FR');
}
```

⚠️ `renderDashboardLayout` doit accepter un 4ème argument `{ csrfToken }` pour propager au `renderPageHead`. Vérifier la signature actuelle et l'adapter si besoin (ou alternative : injecter le meta directement dans le body via un `<meta>` inline si renderPageHead n'est pas modifiable).

- [ ] **Step 4: Re-lancer tests**

```bash
node --test --test-name-pattern "Klassly-feed: GET /class-feed/classes" apps/web/src/server.test.js 2>&1 | tail -15
```

Expected : 3 pass.

- [ ] **Step 5: Suite globale**

```bash
npm test 2>&1 | tail -5
```

Expected : 451+ pass / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(class-feed): GET /class-feed/classes/:id (feed + composer + post cards + 3 tests)

Helpers : renderClassFeedPage, renderComposer, renderPostCard, renderPostPhotos,
renderCommentsSection, avatarPaletteFor, formatTimeAgo, enrichPostsForRender.
Permission : access via listClassesForUser.
Composer visible uniquement pour teacher (sa classe)."
```

---

## Task 12: GET /class-feed/broadcast (admin/director only)

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Test**

```javascript
test('Klassly-feed: GET /class-feed/broadcast — admin OK', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/class-feed/broadcast`, { headers: { cookie } });
    assert.equal(response.status, 200);
  });
});

test('Klassly-feed: GET /class-feed/broadcast — teacher 403/404', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/class-feed/broadcast`, { headers: { cookie }, redirect: 'manual' });
    assert.ok([403, 404].includes(response.status));
  });
});
```

- [ ] **Step 2: Implémentation route**

```javascript
    if (request.method === 'GET' && url.pathname === '/class-feed/broadcast') {
      const auth = requireAuth(session);
      if (!auth.allowed) { response.writeHead(302, { location: '/login' }); response.end(); return; }
      if (!['school_admin', 'director'].includes(auth.context.role)) {
        sendNotFoundPage(response, session);
        return;
      }
      const posts = await Promise.resolve(classFeedStore.listPostsForClass(auth.context.tenantId, null, { limit: 20 }));
      const enriched = await enrichPostsForRender(posts, classFeedStore, auth.context, { userIdentityCache, parentStore, teacherStore });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderClassFeedPage(session, {
        classRoom: { id: 'broadcast', name: '📣 Annonces école' },
        posts: enriched,
        canCompose: true,
        broadcastMode: true
      }));
      return;
    }
```

⚠️ Adapter `renderComposer` pour accepter `'broadcast'` comme classRoomId (case spéciale qui sera convertie côté handler POST).

- [ ] **Step 3: Tests pass + commit**

```bash
node --test --test-name-pattern "Klassly-feed: GET /class-feed/broadcast" apps/web/src/server.test.js 2>&1 | tail -10
npm test 2>&1 | tail -5
git add apps/web/src/server.js
git commit -m "feat(class-feed): GET /class-feed/broadcast (admin/director only) + 2 tests"
```

---

## Task 13: POST /class-feed/posts (multipart create)

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Tests**

```javascript
const FormData = globalThis.FormData;

test('Klassly-feed: POST /class-feed/posts — teacher cree post texte (302)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie, csrfToken } = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData();
    fd.append('_csrf', csrfToken);
    fd.append('classRoomId', 'class-cp-b');
    fd.append('body', 'Sortie au musée hier !');
    const response = await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/class-feed\/classes\/class-cp-b/);
  });
});

test('Klassly-feed: POST /class-feed/posts — parent 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie, csrfToken } = await loginWithCsrf(baseUrl, 'parent@school-a.test');
    const fd = new FormData();
    fd.append('_csrf', csrfToken);
    fd.append('classRoomId', 'class-cp-b');
    fd.append('body', 'should be forbidden');
    const response = await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
    assert.equal(response.status, 403);
  });
});

test('Klassly-feed: POST /class-feed/posts broadcast — admin OK', async () => {
  await withServer(async (baseUrl) => {
    const { cookie, csrfToken } = await loginWithCsrf(baseUrl, 'admin@school-a.test');
    const fd = new FormData();
    fd.append('_csrf', csrfToken);
    fd.append('classRoomId', 'broadcast');
    fd.append('body', 'Annonce ecole');
    const response = await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/class-feed\/broadcast/);
  });
});
```

⚠️ Helper `loginWithCsrf(baseUrl, email)` à ajouter en haut du fichier de test s'il n'existe pas — il login + récupère le cookie + extrait le csrfToken via `extractCsrfFromCookieString`.

- [ ] **Step 2: Implémentation route POST**

```javascript
    if (request.method === 'POST' && url.pathname === '/class-feed/posts') {
      const auth = requireAuth(session);
      if (!auth.allowed) { sendForbiddenPage(response, session); return; }
      // Permission de poster
      if (!['school_admin', 'director', 'teacher'].includes(auth.context.role)) {
        sendForbiddenPage(response, session);
        return;
      }
      // Parse multipart (route gérée hors enforceCsrf car multipart, on valide CSRF nous-mêmes après)
      let parsed;
      try {
        parsed = await parseMultipart(request, { maxTotalBytes: 32 * 1024 * 1024 });
      } catch (err) {
        response.writeHead(400, { 'content-type': 'text/plain' });
        response.end('Invalid multipart');
        return;
      }
      const csrfFromForm = parsed.fields.get('_csrf') || '';
      if (!compareCsrfTokens(session.csrfToken, csrfFromForm)) {
        sendCsrfFailure(request, response);
        return;
      }
      const classRoomIdRaw = parsed.fields.get('classRoomId') || '';
      const body = parsed.fields.get('body') || '';
      const isBroadcast = classRoomIdRaw === 'broadcast';
      const classRoomId = isBroadcast ? null : classRoomIdRaw;
      // Permission de poster sur cette classe
      if (isBroadcast) {
        if (!['school_admin', 'director'].includes(auth.context.role)) {
          sendForbiddenPage(response, session);
          return;
        }
      } else {
        // Teacher : doit avoir cette classe
        if (auth.context.role === 'teacher') {
          const teacher = teacherStore.list(auth.context.tenantId).find((t) => t.id === auth.context.userId || t.userId === auth.context.userId);
          if (!teacher || !teacher.classRoomIds.includes(classRoomId)) {
            sendForbiddenPage(response, session);
            return;
          }
        } else if (auth.context.role !== 'school_admin' && auth.context.role !== 'director') {
          sendForbiddenPage(response, session);
          return;
        }
      }
      // Photos
      const photoFiles = parsed.files.filter((f) => f.fieldName === 'photos').slice(0, 8);
      const attachments = photoFiles.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        data: f.data
      }));
      try {
        const post = await Promise.resolve(classFeedStore.createPost(auth.context.tenantId, { userId: auth.context.userId, role: auth.context.role, tenantId: auth.context.tenantId }, {
          classRoomId,
          body,
          attachments
        }));
        auditWriter.writeEntityEvent(auth.context, 'feed_post.created', 'feed_post', post.id);
        // Fire-and-forget notification — implémenté Task 19
        if (typeof notifyAudienceForPost === 'function') {
          notifyAudienceForPost(auth.context, post).catch((err) => {
            requestLogger.warn('feed_post notification dispatch failed', { error: serializeError(err) });
          });
        }
        const redirectTo = isBroadcast ? '/class-feed/broadcast' : `/class-feed/classes/${encodeURIComponent(classRoomId)}`;
        response.writeHead(302, { location: redirectTo });
        response.end();
      } catch (err) {
        if (err.code === 'validation_error') {
          response.writeHead(302, { location: `${isBroadcast ? '/class-feed/broadcast' : `/class-feed/classes/${encodeURIComponent(classRoomId)}`}?error=validation` });
          response.end();
          return;
        }
        throw err;
      }
      return;
    }
```

⚠️ La route est gérée AVANT `enforceCsrf` (qui ne sait pas parser multipart). On valide le csrf après parse via `compareCsrfTokens`. Le bloc `enforceCsrf` skip déjà les multipart (cf section 6.3 du code existant pour `parseMultipart`).

- [ ] **Step 3: Tests pass + commit**

```bash
npm test 2>&1 | tail -5
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): POST /class-feed/posts (multipart create + 3 tests)

Permissions : teacher (ses classes), admin/director (broadcast).
CSRF valide apres parse multipart.
Audit feed_post.created.
Stub notifyAudienceForPost (sera branche Task 19)."
```

---

## Task 14: POST /class-feed/posts/:id/edit + delete

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Tests**

```javascript
test('Klassly-feed: POST /posts/:id/edit — auteur < 1h OK (302)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie, csrfToken } = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    // Créer un post
    const create = new FormData();
    create.append('_csrf', csrfToken);
    create.append('classRoomId', 'class-cp-b');
    create.append('body', 'original');
    const createRes = await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie }, body: create, redirect: 'manual' });
    assert.equal(createRes.status, 302);
    // Récupérer l'id en re-lisant le feed
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    // Edit
    const edit = new FormData();
    edit.append('_csrf', csrfToken);
    edit.append('body', 'edited');
    const editRes = await fetch(`${baseUrl}/class-feed/posts/${postId}/edit`, { method: 'POST', headers: { cookie }, body: edit, redirect: 'manual' });
    assert.equal(editRes.status, 302);
  });
});

test('Klassly-feed: POST /posts/:id/delete — auteur OK', async () => {
  await withServer(async (baseUrl) => {
    const { cookie, csrfToken } = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const create = new FormData();
    create.append('_csrf', csrfToken);
    create.append('classRoomId', 'class-cp-b');
    create.append('body', 'to delete');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie }, body: create });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    const del = await fetch(`${baseUrl}/class-feed/posts/${postId}/delete`, {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `_csrf=${encodeURIComponent(csrfToken)}`, redirect: 'manual'
    });
    assert.equal(del.status, 302);
  });
});

test('Klassly-feed: POST /posts/:id/delete — admin peut supprimer post d\\'un autre', async () => {
  await withServer(async (baseUrl) => {
    // Teacher cree
    const tLogin = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData();
    fd.append('_csrf', tLogin.csrfToken);
    fd.append('classRoomId', 'class-cp-b');
    fd.append('body', 'admin will delete this');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: tLogin.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: tLogin.cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    // Admin delete
    const aLogin = await loginWithCsrf(baseUrl, 'admin@school-a.test');
    const del = await fetch(`${baseUrl}/class-feed/posts/${postId}/delete`, {
      method: 'POST', headers: { cookie: aLogin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `_csrf=${encodeURIComponent(aLogin.csrfToken)}`, redirect: 'manual'
    });
    assert.equal(del.status, 302);
  });
});
```

- [ ] **Step 2: Implémentation routes**

```javascript
    {
      const editMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/edit$/);
      if (editMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        let parsed;
        try {
          const ct = String(request.headers['content-type'] || '').toLowerCase();
          if (ct.startsWith('multipart/form-data')) {
            parsed = await parseMultipart(request, { maxTotalBytes: 32 * 1024 * 1024 });
          } else {
            const form = parseExtendedForm(await readBody(request));
            parsed = { fields: form, files: [] };
          }
        } catch (err) {
          response.writeHead(400); response.end('Invalid form'); return;
        }
        if (!compareCsrfTokens(session.csrfToken, parsed.fields.get('_csrf') || '')) {
          sendCsrfFailure(request, response); return;
        }
        const postId = editMatch[1];
        const body = parsed.fields.get('body') || '';
        const photoFiles = (parsed.files || []).filter((f) => f.fieldName === 'photos').slice(0, 8);
        const attachments = photoFiles.map((f) => ({ fileName: f.fileName, mimeType: f.mimeType, data: f.data }));
        try {
          const post = await Promise.resolve(classFeedStore.editPost(auth.context.tenantId, postId, auth.context.userId, { body, attachments }, { now: Date.now() }));
          if (!post) { sendNotFoundPage(response, session); return; }
          auditWriter.writeEntityEvent(auth.context, 'feed_post.edited', 'feed_post', postId);
          const redirectTo = post.classRoomId === null ? '/class-feed/broadcast' : `/class-feed/classes/${encodeURIComponent(post.classRoomId)}`;
          response.writeHead(302, { location: redirectTo });
          response.end();
        } catch (err) {
          if (err.code === 'forbidden') { sendForbiddenPage(response, session); return; }
          if (err.code === 'edit_window_expired' || err.code === 'validation_error') {
            response.writeHead(302, { location: `/class-feed/posts/${encodeURIComponent(postId)}?error=${err.code}` });
            response.end(); return;
          }
          throw err;
        }
        return;
      }
    }

    {
      const delMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/delete$/);
      if (delMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const postId = delMatch[1];
        try {
          const post = await Promise.resolve(classFeedStore.softDeletePost(auth.context.tenantId, postId, auth.context.userId, auth.context.role));
          if (!post) { sendNotFoundPage(response, session); return; }
          auditWriter.writeEntityEvent(auth.context, 'feed_post.deleted', 'feed_post', postId);
          const redirectTo = post.classRoomId === null ? '/class-feed/broadcast' : `/class-feed/classes/${encodeURIComponent(post.classRoomId)}`;
          response.writeHead(302, { location: redirectTo });
          response.end();
        } catch (err) {
          if (err.code === 'forbidden') { sendForbiddenPage(response, session); return; }
          throw err;
        }
        return;
      }
    }
```

- [ ] **Step 3: Tests pass + commit**

```bash
npm test 2>&1 | tail -5
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): POST /posts/:id/edit + delete (audit + 3 tests)

Edit : 1h window, auteur uniquement (sinon 403 ou edit_window_expired).
Delete : auteur OU admin/director, soft-delete.
Multipart parsing pour edit (peut changer les photos)."
```

---

## Task 15: POST /like + comments + DELETE comment

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Tests**

```javascript
test('Klassly-feed: POST /posts/:id/like — toggle like', async () => {
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData(); fd.append('_csrf', t.csrfToken); fd.append('classRoomId', 'class-cp-b'); fd.append('body', 'p');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: t.cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    const p = await loginWithCsrf(baseUrl, 'parent@school-a.test');
    const like = await fetch(`${baseUrl}/class-feed/posts/${postId}/like`, {
      method: 'POST', headers: { cookie: p.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `_csrf=${encodeURIComponent(p.csrfToken)}`, redirect: 'manual'
    });
    assert.ok([200, 302].includes(like.status));
  });
});

test('Klassly-feed: POST /posts/:id/comments — parent peut commenter', async () => {
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData(); fd.append('_csrf', t.csrfToken); fd.append('classRoomId', 'class-cp-b'); fd.append('body', 'p');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: t.cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    const p = await loginWithCsrf(baseUrl, 'parent@school-a.test');
    const com = await fetch(`${baseUrl}/class-feed/posts/${postId}/comments`, {
      method: 'POST', headers: { cookie: p.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `_csrf=${encodeURIComponent(p.csrfToken)}&body=${encodeURIComponent('Trop bien !')}`, redirect: 'manual'
    });
    assert.equal(com.status, 302);
  });
});
```

- [ ] **Step 2: Implémentation routes**

```javascript
    {
      const likeMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/like$/);
      if (likeMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const postId = likeMatch[1];
        const result = await Promise.resolve(classFeedStore.toggleLike(auth.context.tenantId, postId, auth.context.userId));
        if (!result) { sendNotFoundPage(response, session); return; }
        // Si fetch JS : retourner JSON. Sinon redirect.
        if (isJsonRequest(request) || request.headers['x-requested-with'] === 'fetch') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(result));
          return;
        }
        const referrer = request.headers.referer || '/class-feed';
        response.writeHead(302, { location: referrer });
        response.end();
        return;
      }
    }

    {
      const commentMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/comments$/);
      if (commentMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const postId = commentMatch[1];
        const form = parseExtendedForm(await readBody(request));
        const body = form.get('body') || '';
        try {
          const comment = await Promise.resolve(classFeedStore.addComment(auth.context.tenantId, postId, { userId: auth.context.userId, role: auth.context.role, tenantId: auth.context.tenantId }, body));
          if (!comment) { sendNotFoundPage(response, session); return; }
          auditWriter.writeEntityEvent(auth.context, 'feed_comment.created', 'feed_comment', comment.id);
          const referrer = request.headers.referer || '/class-feed';
          response.writeHead(302, { location: referrer + `#post-${postId}-comments` });
          response.end();
        } catch (err) {
          if (err.code === 'validation_error') {
            response.writeHead(302, { location: (request.headers.referer || '/class-feed') + '?error=comment_invalid' });
            response.end(); return;
          }
          throw err;
        }
        return;
      }
    }

    {
      const delCommentMatch = url.pathname.match(/^\/class-feed\/comments\/([^/]+)\/delete$/);
      if (delCommentMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const commentId = delCommentMatch[1];
        try {
          const comment = await Promise.resolve(classFeedStore.softDeleteComment(auth.context.tenantId, commentId, auth.context.userId, auth.context.role));
          if (!comment) { sendNotFoundPage(response, session); return; }
          auditWriter.writeEntityEvent(auth.context, 'feed_comment.deleted', 'feed_comment', commentId);
          response.writeHead(302, { location: request.headers.referer || '/class-feed' });
          response.end();
        } catch (err) {
          if (err.code === 'forbidden') { sendForbiddenPage(response, session); return; }
          throw err;
        }
        return;
      }
    }
```

- [ ] **Step 3: Tests pass + commit**

```bash
npm test 2>&1 | tail -5
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): POST /posts/:id/like + /comments + /comments/:id/delete (2 tests)

Like : toggle, retourne JSON si fetch JS sinon redirect referrer.
Comments : tous roles peuvent commenter. Audit feed_comment.created/deleted."
```

---

## Task 16: POST /posts/:id/read + GET /reads

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Tests**

```javascript
test('Klassly-feed: POST /posts/:id/read — idempotent', async () => {
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData(); fd.append('_csrf', t.csrfToken); fd.append('classRoomId', 'class-cp-b'); fd.append('body', 'p');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: t.cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];
    const p = await loginWithCsrf(baseUrl, 'parent@school-a.test');
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/class-feed/posts/${postId}/read`, {
        method: 'POST', headers: { cookie: p.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `_csrf=${encodeURIComponent(p.csrfToken)}`
      });
      assert.equal(res.status, 200);
    }
  });
});

test('Klassly-feed: GET /posts/:id/reads — auteur OK, parent 403', async () => {
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData(); fd.append('_csrf', t.csrfToken); fd.append('classRoomId', 'class-cp-b'); fd.append('body', 'p');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: t.cookie } })).text();
    const postId = feedHtml.match(/data-post-id="(post-[^"]+)"/)[1];

    const author = await fetch(`${baseUrl}/class-feed/posts/${postId}/reads`, { headers: { cookie: t.cookie } });
    assert.equal(author.status, 200);

    const p = await loginWithCsrf(baseUrl, 'parent@school-a.test');
    const parent = await fetch(`${baseUrl}/class-feed/posts/${postId}/reads`, { headers: { cookie: p.cookie }, redirect: 'manual' });
    assert.ok([403, 404].includes(parent.status));
  });
});
```

- [ ] **Step 2: Routes**

```javascript
    {
      const readMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/read$/);
      if (readMatch && request.method === 'POST') {
        const auth = requireAuth(session);
        if (!auth.allowed) { response.writeHead(401); response.end(); return; }
        const postId = readMatch[1];
        await Promise.resolve(classFeedStore.markRead(auth.context.tenantId, postId, auth.context.userId));
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
        return;
      }
    }

    {
      const readsMatch = url.pathname.match(/^\/class-feed\/posts\/([^/]+)\/reads$/);
      if (readsMatch && request.method === 'GET') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const postId = readsMatch[1];
        const post = await Promise.resolve(classFeedStore.getPost(auth.context.tenantId, postId));
        if (!post) { sendNotFoundPage(response, session); return; }
        const isAdmin = ['school_admin', 'director'].includes(auth.context.role);
        if (!isAdmin && post.authorUserId !== auth.context.userId) {
          sendForbiddenPage(response, session);
          return;
        }
        const readers = await Promise.resolve(classFeedStore.listReadersForPost(auth.context.tenantId, postId));
        const readerNames = readers.map((r) => {
          const u = userIdentityCache.get(r.userId);
          return { userId: r.userId, name: u ? u.name : r.userId, readAt: r.readAt };
        });
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderDashboardLayout(`Lecteurs du post — EducLink`, session, `
          <h1>Lecteurs du post</h1>
          <p>${readers.length} parent(s) ont vu ce post.</p>
          <ul>${readerNames.map((r) => `<li>${escapeHtml(r.name)} — ${escapeHtml(formatTimeAgo(r.readAt))}</li>`).join('')}</ul>
        `));
        return;
      }
    }
```

- [ ] **Step 3: Tests pass + commit**

```bash
npm test 2>&1 | tail -5
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): POST /posts/:id/read + GET /reads (2 tests)

Read idempotent (PK composite postgres ON CONFLICT DO NOTHING).
GET /reads accessible auteur + admin/director uniquement."
```

---

## Task 17: GET /class-feed/attachments/:id (serve BYTEA + auth)

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Test**

```javascript
test('Klassly-feed: GET /attachments/:id — serve image, 404 cross-tenant', async () => {
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    // Créer un post avec une photo (1px PNG en base64 décodé)
    const fd = new FormData();
    fd.append('_csrf', t.csrfToken);
    fd.append('classRoomId', 'class-cp-b');
    fd.append('body', 'with photo');
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    fd.append('photos', new Blob([pngBytes], { type: 'image/png' }), 'tiny.png');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    const feedHtml = await (await fetch(`${baseUrl}/class-feed/classes/class-cp-b`, { headers: { cookie: t.cookie } })).text();
    const attMatch = feedHtml.match(/\/class-feed\/attachments\/(att-[^"]+)/);
    assert.ok(attMatch, 'attachment URL found in feed HTML');
    const attId = attMatch[1];
    const res = await fetch(`${baseUrl}/class-feed/attachments/${attId}`, { headers: { cookie: t.cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  });
});
```

- [ ] **Step 2: Route**

```javascript
    {
      const attMatch = url.pathname.match(/^\/class-feed\/attachments\/([^/]+)$/);
      if (attMatch && request.method === 'GET') {
        const auth = requireAuth(session);
        if (!auth.allowed) { sendForbiddenPage(response, session); return; }
        const attachmentId = attMatch[1];
        const att = await Promise.resolve(classFeedStore.getAttachment(auth.context.tenantId, attachmentId));
        if (!att) { sendNotFoundPage(response, session); return; }
        // Auth supplémentaire : verifier que l'user a accès au post parent
        const post = await Promise.resolve(classFeedStore.getPost(auth.context.tenantId, att.postId));
        if (!post) { sendNotFoundPage(response, session); return; }
        if (post.classRoomId !== null) {
          const accessible = listClassesForUser(auth.context, { coreSchoolStore, teacherStore, studentStore, parentStore, studentParentLinks: studentParentLinkStore });
          if (!accessible.some((c) => c.id === post.classRoomId)) {
            sendForbiddenPage(response, session); return;
          }
        }
        // Broadcast : tout role autorisé sur le tenant
        response.writeHead(200, {
          'content-type': att.mimeType,
          'content-length': att.sizeBytes,
          'cache-control': 'public, max-age=86400'
        });
        response.end(att.data);
        return;
      }
    }
```

- [ ] **Step 3: Tests pass + commit**

```bash
npm test 2>&1 | tail -5
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): GET /attachments/:id (serve image BYTEA + 1 test)

Verifie l'access via listClassesForUser + cross-tenant via store.
Cache-Control: 1j (les images ne changent pas, l'id contient un UUID)."
```

---

## Task 18: Email template renderNewPostEmail + tests

**Files:**
- Create: `apps/web/src/templates/email-new-post.js`
- Create: `apps/web/src/templates/email-new-post.test.js`

- [ ] **Step 1: Tests**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderNewPostEmail } = require('./email-new-post');

test('renderNewPostEmail: cas classe normale', () => {
  const result = renderNewPostEmail({
    post: { id: 'post-1', body: 'Sortie au musee !', classRoomId: 'class-cp-b' },
    author: { name: 'Sophie Diallo' },
    className: 'CP-B',
    baseUrl: 'https://app.educlink.example',
    recipientName: 'Marie Bouchet'
  });
  assert.match(result.subject, /Nouveau post de Sophie Diallo dans CP-B/);
  assert.match(result.html, /Sortie au musee/);
  assert.match(result.html, /https:\/\/app\.educlink\.example\/class-feed\/classes\/class-cp-b#post-post-1/);
  assert.match(result.text, /Sophie Diallo/);
  assert.match(result.text, /Sortie au musee/);
});

test('renderNewPostEmail: cas broadcast (classRoomId null)', () => {
  const result = renderNewPostEmail({
    post: { id: 'post-2', body: 'Annonce ecole', classRoomId: null },
    author: { name: 'Mme la Directrice' },
    className: null,
    baseUrl: 'https://app.educlink.example',
    recipientName: 'Parent'
  });
  assert.match(result.subject, /Annonce de l'ecole/);
  assert.match(result.html, /Annonce ecole/);
});

test('renderNewPostEmail: tronque le body a 200 chars + ellipsis', () => {
  const longBody = 'x'.repeat(500);
  const result = renderNewPostEmail({
    post: { id: 'p', body: longBody, classRoomId: 'c1' },
    author: { name: 'Auteur' },
    className: 'Classe',
    baseUrl: 'https://x.com',
    recipientName: 'R'
  });
  assert.ok(result.html.includes('x'.repeat(200) + '…'));
  assert.equal(result.html.includes('x'.repeat(201)), false);
});
```

- [ ] **Step 2: Implémentation template**

```javascript
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function renderNewPostEmail({ post, author, className, baseUrl, recipientName }) {
  const isBroadcast = post.classRoomId === null;
  const subject = isBroadcast
    ? `📰 Annonce de l'ecole sur EducLink`
    : `📰 Nouveau post de ${author.name} dans ${className}`;
  const postUrl = isBroadcast
    ? `${baseUrl}/class-feed/broadcast#post-${post.id}`
    : `${baseUrl}/class-feed/classes/${post.classRoomId}#post-${post.id}`;
  const bodyPreview = truncate(post.body, 200);

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAFB;font-family:Arial,sans-serif;color:#0F172A;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAFB;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 12px rgba(79,70,229,0.10);">
        <tr><td style="background:linear-gradient(120deg,#4F46E5,#7C3AED);padding:24px;color:#fff;">
          <h1 style="margin:0;font-size:22px;font-weight:800;">📰 Nouveau post sur EducLink</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;color:#64748B;">Bonjour ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 16px;"><strong>${escapeHtml(author.name)}</strong>${isBroadcast ? ' a publié une annonce pour toute l’école' : ` a publié un nouveau post dans <strong>${escapeHtml(className)}</strong>`}.</p>
          <div style="background:#F4F4F8;border-radius:12px;padding:16px;margin-bottom:24px;border-left:4px solid #4F46E5;">
            <p style="margin:0;white-space:pre-wrap;">${escapeHtml(bodyPreview)}</p>
          </div>
          <p style="text-align:center;margin:0;">
            <a href="${escapeHtml(postUrl)}" style="display:inline-block;background:linear-gradient(120deg,#4F46E5,#7C3AED);color:#fff;padding:12px 32px;border-radius:14px;text-decoration:none;font-weight:700;">Voir le post</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:12px;text-align:center;">
          Vous recevez cet email parce que vous êtes parent ${isBroadcast ? `d'un élève de l'école` : `d'un élève en ${escapeHtml(className)}`} sur EducLink.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Bonjour ${recipientName},

${author.name}${isBroadcast ? ` a publié une annonce pour toute l'école` : ` a publié un nouveau post dans ${className}`}.

${bodyPreview}

Voir le post : ${postUrl}

— EducLink`;

  return { subject, html, text };
}

module.exports = { renderNewPostEmail };
```

- [ ] **Step 3: Tests pass + commit**

```bash
node --test apps/web/src/templates/email-new-post.test.js 2>&1 | tail -5
npm test 2>&1 | tail -5
git add apps/web/src/templates/email-new-post.js apps/web/src/templates/email-new-post.test.js
git commit -m "feat(class-feed): template email-new-post (HTML table inline + texte + 3 tests)

Sujet adapte broadcast vs classe. Body tronque a 200 chars + ellipsis.
HTML inline table compat clients mail, gradient brand indigo/violet."
```

---

## Task 19: Wire notifyAudience fire-and-forget dans POST handler

**Files:**
- Modify: `apps/web/src/server.js`

- [ ] **Step 1: Implémenter le helper `notifyAudienceForPost`**

Ajouter au-dessus de `createServer` (zone helpers) :

```javascript
async function notifyAudienceForPostFactory({ classFeedStore, audienceProvider, emailService, userStore, baseUrl, logger, coreSchoolStore }) {
  return async function notifyAudienceForPost(authContext, post) {
    try {
      const audience = await Promise.resolve(classFeedStore.resolveAudience(authContext.tenantId, post, audienceProvider));
      if (audience.length === 0) {
        logger.info('feed_post no audience to notify', { postId: post.id });
        return { sent: 0, failed: 0 };
      }
      // Récupérer emails + noms
      const users = await Promise.all(audience.map((userId) => Promise.resolve(userStore.getById ? userStore.getById(userId) : userStore.findById?.(userId))));
      const recipients = users.filter((u) => u && u.email);
      const author = await Promise.resolve(userStore.getById ? userStore.getById(post.authorUserId) : null);
      const authorName = author?.name || post.authorUserId;
      const classRoom = post.classRoomId ? coreSchoolStore.get('classRooms', authContext.tenantId, post.classRoomId) : null;
      const className = classRoom?.name || null;

      let sent = 0, failed = 0;
      for (const user of recipients) {
        const { subject, html, text } = require('./templates/email-new-post').renderNewPostEmail({
          post, author: { name: authorName }, className, baseUrl, recipientName: user.name || 'Parent'
        });
        try {
          const result = await emailService.send({ to: user.email, subject, html, text });
          if (!result.skipped) sent += 1;
        } catch (err) {
          failed += 1;
          logger.warn('feed_post notification failed for recipient', { recipient: user.email, error: err.message });
        }
      }
      logger.info('feed_post notifications dispatched', { postId: post.id, sent, failed });
      return { sent, failed };
    } catch (err) {
      logger.error('notifyAudienceForPost crashed', { postId: post.id, error: err.message });
      return { sent: 0, failed: 0 };
    }
  };
}
```

- [ ] **Step 2: Construire un `audienceProvider` minimaliste basé sur les stores existants**

Dans `createServer`, après l'init des stores, ajouter :

```javascript
  const feedAudienceProvider = {
    getParentsForClass: (tenantId, classRoomId) => {
      const students = studentStore.list(tenantId).filter((s) => s.classRoomId === classRoomId);
      const studentIds = new Set(students.map((s) => s.id));
      const links = studentParentLinkStore.list(tenantId).filter((l) => studentIds.has(l.studentId));
      return [...new Set(links.map((l) => l.parentId))];
    },
    getAllParents: (tenantId) => {
      return parentStore.list(tenantId).map((p) => p.id);
    }
  };
  const baseUrl = process.env.PUBLIC_APP_URL || 'https://educlink-production.up.railway.app';
  const notifyAudienceForPost = await notifyAudienceForPostFactory({
    classFeedStore,
    audienceProvider: feedAudienceProvider,
    emailService,
    userStore: activeUserStore,
    baseUrl,
    logger: logger.child({ module: 'feed-notifications' }),
    coreSchoolStore
  });
```

- [ ] **Step 3: Brancher dans le handler POST /class-feed/posts** (Task 13)

Le stub `if (typeof notifyAudienceForPost === 'function')` est déjà en place. Maintenant la fonction existe — le fire-and-forget s'exécute automatiquement.

- [ ] **Step 4: Test integration "post creation déclenche EmailService"**

```javascript
test('Klassly-feed: POST /class-feed/posts declenche EmailService.send pour audience', async () => {
  const sendCalls = [];
  const fakeEmailService = {
    send: async (args) => { sendCalls.push(args); return { id: 'em' }; },
    sendBatch: async () => ({ sent: 0, failed: 0, errors: [] }),
    isEnabled: () => true
  };
  await withServer(async (baseUrl) => {
    const t = await loginWithCsrf(baseUrl, 'teacher@school-a.test');
    const fd = new FormData();
    fd.append('_csrf', t.csrfToken);
    fd.append('classRoomId', 'class-cp-b');
    fd.append('body', 'notif test');
    await fetch(`${baseUrl}/class-feed/posts`, { method: 'POST', headers: { cookie: t.cookie }, body: fd });
    // Attendre que le Promise fire-and-forget s'execute
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(sendCalls.length >= 1, `expected at least 1 email sent, got ${sendCalls.length}`);
  }, { emailService: fakeEmailService });
});
```

⚠️ Cela suppose que `withServer` accepte `options` qui passent à `createServer`. Vérifier sa signature ; si pas le cas, l'étendre temporairement pour ce test.

- [ ] **Step 5: Tests pass + commit**

```bash
npm test 2>&1 | tail -10
git add apps/web/src/server.js apps/web/src/server.test.js
git commit -m "feat(class-feed): notifyAudienceForPost fire-and-forget + EmailService dispatch

Wire dans POST /class-feed/posts (handler Task 13).
Resolve audience parents via studentParentLinks (classe) ou parentStore (broadcast).
Render template email-new-post pour chaque destinataire.
Log audit : sent + failed counts.
Erreurs silenciees (fire-and-forget), latence prod = 0.
1 test integration verifie EmailService.send appele apres POST."
```

---

## Task 20: TASKS.md + commit final + push Railway

**Files:**
- Modify: `TASKS.md`
- Git push

- [ ] **Step 1: Vérifier la suite globale finale**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
npm test 2>&1 | tail -10
```

Expected : ~477+ pass / 0 fail.

- [ ] **Step 2: Audit pré-push**

```bash
git log --oneline origin/main..HEAD
git diff origin/main..HEAD --stat
```

Vérifier : ~18-20 commits, fichiers attendus uniquement (server.js, modules/, templates/, migration, tests).

- [ ] **Step 3: Ajouter section sprint à TASKS.md**

Append à la fin de TASKS.md :

```markdown

## SPRINT 10 — Klassly-feed (fil d'actualite visuel par classe) ✅

### FEED-01 — Module class-feed + EmailService ✅
- 5 nouvelles tables postgres (migration 011)
- ClassFeedStore (in-memory + postgres adapter)
- EmailService wrapper Resend (mode no-op si pas de cle)
- 30+ tests unitaires verts

### FEED-02 — Routes + UI feed ✅
- 13 nouvelles routes HTTP
- CSS post cards, composer, mosaic photos, comments
- JS composer expand, photo preview, like toggle, auto-mark-read
- Sidebar nav "Mur de la classe"
- 25+ tests integration verts

### FEED-03 — Notifications email Resend ✅
- Template email-new-post (HTML + texte)
- Fire-and-forget dispatch apres POST post
- Resolve audience (parents classe ou broadcast tous)
- Audit log

### Spec : [docs/superpowers/specs/2026-06-12-klassly-feed-design.md]
### Plan : [docs/superpowers/plans/2026-06-12-klassly-feed-design.md]

⚠️ Pre-requis prod : RESEND_API_KEY + MAIL_FROM_ADDRESS doivent etre set
   sur Railway pour activer les notifications email (sinon mode no-op).
```

- [ ] **Step 4: Commit final**

```bash
git add TASKS.md
git commit -m "docs(tasks): Sprint 10 Klassly-feed termine"
```

- [ ] **Step 5: Push Railway**

```bash
git push origin main 2>&1 | tail -5
```

Expected : push OK, Railway redeploy s'enclenche.

- [ ] **Step 6: Attendre + smoke test prod**

```bash
sleep 180
echo "--- Healthcheck ---"
curl -s -o /dev/null -w "STATUS=%{http_code}\n" https://educlink-production.up.railway.app/healthz

echo "--- Sidebar a 'Mur de la classe' ---"
curl -s -c /tmp/cprod.txt -o /dev/null -X POST https://educlink-production.up.railway.app/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "email=admin@school-a.test&password=password123"
curl -s -b /tmp/cprod.txt https://educlink-production.up.railway.app/dashboard/admin | grep -o "/class-feed" | head -1

echo "--- /class-feed accessible ---"
curl -s -b /tmp/cprod.txt -o /dev/null -w "STATUS=%{http_code}\n" https://educlink-production.up.railway.app/class-feed

rm -f /tmp/cprod.txt
```

Expected :
- Healthcheck 200
- `/class-feed` apparait dans le HTML dashboard (sidebar)
- GET `/class-feed` retourne 200

- [ ] **Step 7: Validation manuelle utilisateur (checklist)**

À demander au user :
1. ⚠️ **Set sur Railway** : `RESEND_API_KEY=re_...`, `MAIL_FROM_ADDRESS=...`, `MAIL_FROM_NAME=EducLink` (sinon notifs silencieuses, mais l'app fonctionne)
2. Login `admin@school-a.test` → cliquer "Mur de la classe" → voir la page sélection
3. Cliquer une classe → composer visible si admin
4. Créer un post texte → redirect feed avec post visible
5. Créer un post avec 3 photos → vérifier mosaïque
6. Login `parent@school-a.test` → check email reçu (Resend dashboard)
7. Liker + commenter le post
8. Re-login admin → voir read receipts "1/X lus"
9. Test broadcast : créer post broadcast → visible dans /class-feed/broadcast
10. Test edit < 1h (changer body) → badge "modifié" apparaît
11. Test delete (auteur, puis admin) → soft-delete
12. Mobile responsive (375px) → mosaïque + composer lisibles
13. Toggle dark mode → tout reste lisible

---

## Self-Review Checklist

**Spec coverage** :
- ✅ Migration 011 5 tables → Task 1
- ✅ ClassFeedStore complet → Tasks 3, 4, 5
- ✅ PostgresClassFeedRepository → Task 6
- ✅ EmailService + runtime env → Task 2
- ✅ Wiring stores → Task 7
- ✅ CSS feed components → Task 8
- ✅ UX_SCRIPT_JS extensions + csrf meta → Task 9
- ✅ Sidebar nav → Task 10
- ✅ GET /class-feed (selector) → Task 10
- ✅ GET /class-feed/classes/:id → Task 11
- ✅ GET /class-feed/broadcast → Task 12
- ✅ POST /class-feed/posts (multipart) → Task 13
- ✅ POST edit + delete → Task 14
- ✅ POST like + comments + delete comment → Task 15
- ✅ POST read + GET reads → Task 16
- ✅ GET /attachments/:id → Task 17
- ✅ Email template → Task 18
- ✅ Notification dispatch → Task 19
- ✅ Livraison + TASKS.md + push → Task 20

**Placeholder scan** : pas de TBD / TODO / "fill in later". Quelques ⚠️ "adapter X selon" — ce sont des instructions d'inspection contextuelle (vérifier nom exact d'une méthode existante), pas des placeholders.

**Type / signature consistency** :
- `ClassFeedStore` méthodes consistantes entre Tasks 3-5 et Task 6 (PostgresClassFeedRepository)
- `EmailService.send({to, subject, html, text})` cohérent Tasks 2, 18, 19
- `renderNewPostEmail({post, author, className, baseUrl, recipientName})` cohérent Tasks 18, 19
- `notifyAudienceForPost(authContext, post)` cohérent Tasks 13 et 19
- Classes CSS (`.el-feed`, `.el-post-card`, `.el-feed-composer`, etc.) cohérentes entre Tasks 8 et 11
- JS handlers (`.el-feed-composer-collapsed`, `data-feed-like`, `data-feed-photos`, `data-post-id`) cohérents entre Tasks 9 et 11

**Scope** : 1 sprint, ~20 commits, structure cohérente. Pré-requis Resend = action manuelle utilisateur en parallèle.
