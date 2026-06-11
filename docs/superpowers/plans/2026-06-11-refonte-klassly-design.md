# Refonte visuelle Klassly-style + mode jour/nuit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le design system CSS d'EducLink (apps/web prod) avec palette indigo→violet, typo Nunito, composants généreux, touches ludiques, et ajouter un mode jour/nuit fonctionnel — sans changer aucune route ni structure HTML existante.

**Architecture:** Toute la refonte vit dans **2 fichiers** : (1) `apps/web/src/server.js` où on réécrit la constante `DESIGN_SYSTEM_CSS`, on étend `UX_SCRIPT_JS`, on ajoute `THEME_BOOTSTRAP_JS` + son hash CSP, on swap Inter→Nunito dans `renderPageHead`, et on branche une route `/__design` dev-only ; (2) `apps/web/src/showcase.js` nouveau fichier qui rend tous les composants côte à côte en light + dark. Aucune classe CSS renommée — compatibilité backward 100% avec toutes les pages existantes.

**Tech Stack:** Node.js HTTP natif (pas de framework), CSS variables (`:root` + `[data-theme="dark"]`), Google Fonts (Nunito), `crypto.createHash` pour le hash CSP du script anti-FOUC, `node:test` pour les tests.

**Spec source:** [docs/superpowers/specs/2026-06-11-refonte-klassly-design.md](../specs/2026-06-11-refonte-klassly-design.md)

---

## Vue d'ensemble des tâches

| # | Tâche | Fichiers |
|---|---|---|
| 1 | Ajouter les 2 tests TDD (qui doivent échouer au début) | `apps/web/src/server.test.js` |
| 2 | Refondre les tokens `:root` (light mode) + dark mode | `apps/web/src/server.js` (DESIGN_SYSTEM_CSS) |
| 3 | Refondre les composants existants (sidebar, header, cards, buttons, badges, banners, forms, tables) | `apps/web/src/server.js` (DESIGN_SYSTEM_CSS) |
| 4 | Ajouter les nouveaux patterns (empty states, avatars, dot pattern, confetti, animations) | `apps/web/src/server.js` (DESIGN_SYSTEM_CSS) |
| 5 | Swap Inter→Nunito + créer `THEME_BOOTSTRAP_JS` avec hash CSP | `apps/web/src/server.js` |
| 6 | Étendre `UX_SCRIPT_JS` avec le toggle thème + helper avatar gradient | `apps/web/src/server.js` (UX_SCRIPT_JS) |
| 7 | Ajouter le bouton toggle SVG dans le header | `apps/web/src/server.js` (renderDashboardLayout / equiv) |
| 8 | Créer `apps/web/src/showcase.js` (rendu de tous les composants) | `apps/web/src/showcase.js` (nouveau) |
| 9 | Brancher la route `/__design` dev-only dans server.js | `apps/web/src/server.js` |
| 10 | Audit couleurs hardcodées + remplacement par tokens | `apps/web/src/server.js` |
| 11 | Lancer la suite complète + commit + push | git |

---

## Task 1: Ajouter les 2 tests TDD

**Files:**
- Modify: `apps/web/src/server.test.js` (append at end of file)

**Pourquoi en premier:** TDD — ces 2 tests décrivent le résultat attendu. Ils vont échouer aujourd'hui (Inter au lieu de Nunito, pas de route `/__design`). Ils passeront après les Tasks 2-9.

- [ ] **Step 1: Ouvrir le fichier et localiser la fin**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
wc -l apps/web/src/server.test.js
```

Expected: nombre de lignes affiché (~4600+).

- [ ] **Step 2: Ajouter les 2 tests à la fin du fichier**

Append:

```javascript
// ============================================================
// Refonte design — tokens CSS + page showcase dev-only
// ============================================================

test('refonte-design: le CSS servi contient les tokens critiques (Nunito + indigo + dark mode)', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/assets/design-system.css`);
    assert.equal(response.status, 200);
    const css = await response.text();
    assert.ok(css.includes('#4F46E5'), 'la palette indigo (couleur primaire) doit être présente');
    assert.ok(css.includes('"Nunito"'), 'la police Nunito doit être déclarée dans font-family');
    assert.ok(css.includes('[data-theme="dark"]'), 'le sélecteur dark mode doit exister');
    assert.ok(css.includes('--el-gradient-brand'), 'le gradient brand doit être déclaré comme variable');
  });
});

test('refonte-design: la page showcase /__design est accessible en dev', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/__design`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Design Showcase'), 'le titre de la page showcase doit être présent');
    assert.ok(html.includes('data-theme="light"'), 'la section light mode doit être rendue');
    assert.ok(html.includes('data-theme="dark"'), 'la section dark mode doit être rendue');
  });
});

test('refonte-design: la page showcase /__design retourne 404 en production', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.SESSION_SECRET = 'a'.repeat(32); // requis en production
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/__design`);
      assert.equal(response.status, 404);
    });
  } finally {
    process.env.NODE_ENV = originalEnv;
    delete process.env.SESSION_SECRET;
  }
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
node --test --test-name-pattern "refonte-design" apps/web/src/server.test.js 2>&1 | tail -30
```

Expected: les 3 tests **échouent** (CSS ne contient pas `#4F46E5` / `Nunito`, route `/__design` retourne 404 en dev).

- [ ] **Step 4: Commit (tests rouges → on documente l'intention)**

```bash
git add apps/web/src/server.test.js
git commit -m "test(design): ajoute tests TDD pour la refonte Klassly-style + page showcase

3 tests qui doivent passer apres la refonte :
- CSS contient les tokens critiques (#4F46E5, Nunito, [data-theme=dark])
- /__design accessible en dev
- /__design retourne 404 en production"
```

---

## Task 2: Refondre les tokens `:root` (light mode) + dark mode

**Files:**
- Modify: `apps/web/src/server.js:727-774` (bloc `:root { ... }` de la constante `DESIGN_SYSTEM_CSS`)
- Modify: `apps/web/src/server.js` — ajouter un bloc `[data-theme="dark"] { ... }` juste après `:root`

**Pourquoi:** Fondations de toute la refonte — couleurs, radius, ombres, gradients, font-family. Tous les composants des Tasks 3-4 consomment ces tokens.

- [ ] **Step 1: Ouvrir le fichier et localiser le bloc `:root`**

```bash
cd /c/Users/ntcon/Documents/dev/EducLink
grep -n "^:root {" apps/web/src/server.js
```

Expected: une seule ligne (~727).

- [ ] **Step 2: Remplacer intégralement le bloc `:root { ... }` (lignes 727-774) par la nouvelle version**

Trouver dans `DESIGN_SYSTEM_CSS` :

```css
:root {
  --el-color-primary-blue: #2563eb;
  ... (jusqu'à la fin du bloc avec --el-transition)
}
```

Remplacer par :

```css
:root {
  /* Palette principale (light) */
  --el-color-primary: #4F46E5;
  --el-color-primary-deep: #4338CA;
  --el-color-accent: #7C3AED;
  --el-color-soft-indigo: #818CF8;
  --el-color-soft-violet: #A78BFA;

  /* Aliases backward-compat — les pages existantes utilisent ces noms */
  --el-color-primary-blue: var(--el-color-primary);
  --el-color-dark-blue: var(--el-color-primary-deep);
  --el-color-primary-purple: var(--el-color-accent);
  --el-color-soft-purple: var(--el-color-soft-violet);
  --el-color-primary-green: #22C55E;
  --el-color-soft-green: #4ADE80;

  /* Surfaces */
  --el-color-bg: #FAFAFB;
  --el-color-bg-soft: #F4F4F8;
  --el-color-surface: #FFFFFF;
  --el-color-surface-alt: #F8FAFC;

  /* Texte */
  --el-color-text: #0F172A;
  --el-color-text-secondary: #64748B;

  /* Bordures */
  --el-color-border: #E2E8F0;
  --el-color-border-strong: #CBD5E1;

  /* Statuts */
  --el-color-success: #22C55E;
  --el-color-warning: #F59E0B;
  --el-color-danger: #EF4444;
  --el-color-info-bg: #EEF2FF;

  /* Gradients */
  --el-gradient-brand: linear-gradient(120deg, #4F46E5 0%, #7C3AED 100%);
  --el-gradient-soft: radial-gradient(circle at 30% 30%, rgba(79,70,229,.08), transparent 60%), radial-gradient(circle at 70% 70%, rgba(124,58,237,.08), transparent 60%);
  --el-gradient-banner-success: linear-gradient(120deg, rgba(34,197,94,.12), rgba(20,184,166,.12));
  --el-gradient-dot-pattern: radial-gradient(rgba(79,70,229,0.08) 1px, transparent 1px);

  /* Radius */
  --el-radius-sm: 10px;
  --el-radius-md: 14px;
  --el-radius-lg: 20px;
  --el-radius-xl: 28px;
  --el-radius-2xl: 36px;
  --el-radius-full: 9999px;

  /* Ombres (teintées indigo/violet) */
  --el-shadow-xs: 0 1px 2px rgba(79, 70, 229, 0.08);
  --el-shadow-sm: 0 4px 12px rgba(79, 70, 229, 0.10);
  --el-shadow-md: 0 12px 28px -8px rgba(79, 70, 229, 0.18);
  --el-shadow-lg: 0 24px 56px -12px rgba(124, 58, 237, 0.22);
  --el-shadow-brand: 0 14px 30px -10px rgba(124, 58, 237, 0.45);

  /* Spacing (conservé) */
  --el-space-1: 0.25rem;
  --el-space-2: 0.5rem;
  --el-space-3: 0.75rem;
  --el-space-4: 1rem;
  --el-space-5: 1.25rem;
  --el-space-6: 1.5rem;
  --el-space-7: 1.75rem;
  --el-space-8: 2.25rem;
  --el-space-10: 2.75rem;

  /* Tailles de texte (conservées) */
  --el-text-xs: 0.75rem;
  --el-text-sm: 0.875rem;
  --el-text-base: 1rem;
  --el-text-lg: 1.125rem;
  --el-text-xl: 1.25rem;
  --el-text-2xl: 1.5rem;
  --el-text-3xl: 2rem;
  --el-text-4xl: 2.5rem;

  /* Typo */
  --el-font-sans: "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* Transitions */
  --el-transition: 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] {
  --el-color-primary: #818CF8;
  --el-color-primary-deep: #6366F1;
  --el-color-accent: #A78BFA;
  --el-color-soft-indigo: #6366F1;
  --el-color-soft-violet: #8B5CF6;

  --el-color-primary-blue: var(--el-color-primary);
  --el-color-dark-blue: var(--el-color-primary-deep);
  --el-color-primary-purple: var(--el-color-accent);
  --el-color-soft-purple: var(--el-color-soft-violet);

  --el-color-bg: #0B0B14;
  --el-color-bg-soft: #14141F;
  --el-color-surface: #1A1A28;
  --el-color-surface-alt: #20202F;

  --el-color-text: #F1F5F9;
  --el-color-text-secondary: #94A3B8;

  --el-color-border: #2A2A3D;
  --el-color-border-strong: #3A3A52;

  --el-color-info-bg: #1E1B4B;

  --el-gradient-brand: linear-gradient(120deg, #6366F1 0%, #8B5CF6 100%);
  --el-gradient-soft: radial-gradient(circle at 30% 30%, rgba(129,140,248,.10), transparent 60%), radial-gradient(circle at 70% 70%, rgba(167,139,250,.10), transparent 60%);
  --el-gradient-dot-pattern: radial-gradient(rgba(129,140,248,0.12) 1px, transparent 1px);

  --el-shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --el-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.4);
  --el-shadow-md: 0 12px 28px -8px rgba(0, 0, 0, 0.5);
  --el-shadow-lg: 0 24px 56px -12px rgba(0, 0, 0, 0.6);
  --el-shadow-brand: 0 14px 30px -10px rgba(139, 92, 246, 0.5);
}
```

- [ ] **Step 3: Lancer le test "tokens critiques"**

```bash
node --test --test-name-pattern "refonte-design: le CSS servi contient les tokens critiques" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected: **PASS** (le CSS contient maintenant `#4F46E5`, `"Nunito"`, `[data-theme="dark"]`, `--el-gradient-brand`).

- [ ] **Step 4: Vérifier que la suite globale ne casse pas**

```bash
npm test 2>&1 | tail -8
```

Expected: tests existants verts (les autres 2 tests refonte-design encore en échec — c'est attendu).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): refonte tokens CSS (palette indigo/violet, radius, ombres, Nunito var)

- Nouvelle palette primary indigo #4F46E5, accent violet #7C3AED
- Aliases backward-compat pour les noms historiques (primary-blue, primary-purple)
- Radius plus genereux (sm 10, md 14, lg 20, xl 28, 2xl 36, full)
- Ombres teintees indigo/violet
- Gradients brand, soft, dot-pattern
- Police Nunito dans font-family
- Bloc [data-theme=dark] complet avec overrides

Verifie test 'refonte-design: le CSS servi contient les tokens critiques'"
```

---

## Task 3: Refondre les composants existants (sidebar, header, cards, buttons, badges, banners, forms, tables)

**Files:**
- Modify: `apps/web/src/server.js` (DESIGN_SYSTEM_CSS — toute la partie composants après le bloc dark mode)

**Pourquoi:** Une fois les tokens en place, on restyle tous les composants existants pour qu'ils consomment les nouveaux tokens et adoptent le look Klassly (cartes plus généreuses, pills, etc.).

- [ ] **Step 1: Lire le bloc actuel après `:root`**

```bash
sed -n '775,1100p' apps/web/src/server.js | head -100
```

Repérer les sélecteurs existants : `body`, `h1-h4`, `button`, `.el-card`, `.el-badge`, `.el-banner`, `.el-sidebar`, `.el-nav-link`, etc.

- [ ] **Step 2: Remplacer le bloc des composants — body, headings, links**

Remplacer le bloc commençant à `body { ... }` (ligne ~780) jusqu'à `button:focus-visible, a:focus-visible { ... }` (ligne ~844) par :

```css
* { box-sizing: border-box; }

html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

body {
  margin: 0;
  padding: 0;
  font-family: var(--el-font-sans);
  font-feature-settings: "ss01", "cv11";
  font-size: var(--el-text-base);
  line-height: 1.6;
  color: var(--el-color-text);
  background:
    var(--el-gradient-soft),
    var(--el-color-bg);
  min-height: 100vh;
  transition: background-color var(--el-transition), color var(--el-transition);
}

h1, h2, h3, h4 {
  margin: 0 0 var(--el-space-3);
  line-height: 1.2;
  color: var(--el-color-text);
  font-weight: 800;
  letter-spacing: -0.02em;
}
h1 { font-size: var(--el-text-3xl); font-weight: 900; letter-spacing: -0.025em; }
h2 { font-size: var(--el-text-2xl); font-weight: 800; }
h3 { font-size: var(--el-text-lg); font-weight: 700; }
p, ul, ol { margin: 0 0 var(--el-space-4); }
a {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 600;
  transition: color var(--el-transition);
}
a:hover { color: var(--el-color-accent); }
code {
  padding: 2px 8px;
  border-radius: var(--el-radius-sm);
  background: var(--el-color-info-bg);
  color: var(--el-color-primary-deep);
  font-size: 0.875em;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
hr { border: 0; border-top: 1px solid var(--el-color-border); margin: var(--el-space-5) 0; }

form { margin: 0; }
label {
  display: inline-flex;
  flex-direction: column;
  gap: var(--el-space-1);
  margin-bottom: var(--el-space-3);
  font-size: var(--el-text-sm);
  font-weight: 600;
  color: var(--el-color-text);
}
input, textarea, select {
  min-width: 16rem;
  max-width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--el-color-border);
  border-radius: var(--el-radius-md);
  background-color: var(--el-color-surface);
  color: var(--el-color-text);
  font-family: var(--el-font-sans);
  font-size: var(--el-text-base);
  transition: border-color var(--el-transition), box-shadow var(--el-transition), background-color var(--el-transition);
}
input:hover, textarea:hover, select:hover { border-color: var(--el-color-border-strong); }
input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: none;
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.18);
}

button {
  border: 1px solid transparent;
  border-radius: var(--el-radius-md);
  padding: 12px 24px;
  font-family: var(--el-font-sans);
  font-weight: 700;
  font-size: var(--el-text-sm);
  letter-spacing: 0.01em;
  background: var(--el-gradient-brand);
  color: #fff;
  box-shadow: var(--el-shadow-brand);
  cursor: pointer;
  transition: transform var(--el-transition), box-shadow var(--el-transition), filter var(--el-transition);
}
button:hover { transform: translateY(-2px); filter: brightness(1.05); box-shadow: 0 18px 36px -10px rgba(124, 58, 237, 0.5); }
button:active { transform: translateY(0) scale(0.98); }
button:focus-visible, a:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}

button.el-button-secondary {
  background: transparent;
  border: 1.5px solid var(--el-color-primary);
  color: var(--el-color-primary);
  box-shadow: none;
}
button.el-button-secondary:hover {
  background: rgba(79, 70, 229, 0.08);
  filter: none;
}

button.el-button-link, .el-button-link {
  background: transparent;
  border: none;
  color: var(--el-color-primary);
  box-shadow: none;
  padding: 6px 10px;
  font-weight: 600;
}
button.el-button-link:hover, .el-button-link:hover {
  background: rgba(79, 70, 229, 0.08);
  color: var(--el-color-accent);
  filter: none;
  text-decoration: none;
}

button.el-button-destructive {
  background: rgba(239, 68, 68, 0.12);
  color: var(--el-color-danger);
  box-shadow: none;
}
button.el-button-destructive:hover {
  background: rgba(239, 68, 68, 0.20);
  filter: none;
}
```

- [ ] **Step 3: Remplacer les blocs `.el-card`, `.el-badge`, `.el-banner`**

Localiser les sélecteurs existants (`grep -n "\.el-card\|\.el-badge\|\.el-banner" apps/web/src/server.js | head -20`) et remplacer par :

```css
.el-card {
  position: relative;
  background: var(--el-color-surface);
  border: 1px solid var(--el-color-border);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-6);
  box-shadow: var(--el-shadow-sm);
  margin-bottom: var(--el-space-5);
  transition: box-shadow var(--el-transition), transform var(--el-transition);
}
.el-card.is-interactive { cursor: pointer; }
.el-card.is-interactive:hover {
  transform: scale(1.01);
  box-shadow: var(--el-shadow-md);
}
.el-card.is-elevated {
  box-shadow: var(--el-shadow-lg);
}
.el-card.is-highlight::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--el-gradient-brand);
  border-radius: var(--el-radius-lg) var(--el-radius-lg) 0 0;
}
.el-card-title-accent {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: var(--el-gradient-brand);
  margin-right: 10px;
  vertical-align: middle;
}

.el-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--el-radius-full);
  background: rgba(15, 23, 42, 0.06);
  color: var(--el-color-text-secondary);
  font-size: var(--el-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
[data-theme="dark"] .el-badge {
  background: rgba(241, 245, 249, 0.10);
}
.el-badge.is-success { background: rgba(34, 197, 94, 0.14); color: #15803D; }
[data-theme="dark"] .el-badge.is-success { color: #4ADE80; }
.el-badge.is-warning { background: rgba(245, 158, 11, 0.14); color: #B45309; }
[data-theme="dark"] .el-badge.is-warning { color: #FBBF24; }
.el-badge.is-error, .el-badge.is-danger { background: rgba(239, 68, 68, 0.14); color: #B91C1C; }
[data-theme="dark"] .el-badge.is-error, [data-theme="dark"] .el-badge.is-danger { color: #FCA5A5; }
.el-badge.is-info { background: rgba(79, 70, 229, 0.14); color: var(--el-color-primary-deep); }
[data-theme="dark"] .el-badge.is-info { color: var(--el-color-soft-indigo); }

.el-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-radius: var(--el-radius-lg);
  padding: 16px 20px;
  box-shadow: var(--el-shadow-xs);
  border-left: 4px solid var(--el-color-border-strong);
  background: var(--el-color-surface);
  color: var(--el-color-text);
  margin-bottom: var(--el-space-4);
}
.el-banner::before {
  content: 'ⓘ';
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}
.el-banner.is-success { border-left-color: var(--el-color-success); background: rgba(34, 197, 94, 0.08); }
.el-banner.is-success::before { content: '✓'; color: var(--el-color-success); }
.el-banner.is-warning { border-left-color: var(--el-color-warning); background: rgba(245, 158, 11, 0.08); }
.el-banner.is-warning::before { content: '⚠'; color: var(--el-color-warning); }
.el-banner.is-error, .el-banner.is-danger { border-left-color: var(--el-color-danger); background: rgba(239, 68, 68, 0.08); }
.el-banner.is-error::before, .el-banner.is-danger::before { content: '✕'; color: var(--el-color-danger); }
.el-banner.is-info { border-left-color: var(--el-color-primary); background: rgba(79, 70, 229, 0.08); }
.el-banner.is-info::before { content: 'ⓘ'; color: var(--el-color-primary); }

@keyframes el-sparkle-rotate {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(15deg) scale(1.1); }
}
.el-banner.is-success::after {
  content: '✨';
  margin-left: auto;
  font-size: 18px;
  animation: el-sparkle-rotate 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .el-banner.is-success::after { animation: none; }
}
```

- [ ] **Step 4: Remplacer les blocs `.el-sidebar`, `.el-nav-link`, `.el-app-header`, `.el-app-shell`, `.el-app-main`**

Localiser puis remplacer par :

```css
.el-app-shell {
  display: flex;
  min-height: 100vh;
}
.el-app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.el-sidebar {
  width: 260px;
  background: var(--el-color-surface);
  border-right: 1px solid var(--el-color-border);
  padding: var(--el-space-5);
  position: relative;
  overflow: hidden;
  transition: background-color var(--el-transition), border-color var(--el-transition);
}
.el-sidebar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 240px;
  background: linear-gradient(180deg, rgba(79, 70, 229, 0.04), transparent);
  pointer-events: none;
}
.el-sidebar-brand {
  position: relative;
  padding: 12px;
  background: rgba(79, 70, 229, 0.06);
  border-radius: var(--el-radius-lg);
  margin-bottom: var(--el-space-5);
}
[data-theme="dark"] .el-sidebar-brand { background: rgba(129, 140, 248, 0.10); }
.el-brand-row { display: flex; align-items: center; gap: 10px; }
.el-brand-title { margin: 0; font-weight: 900; font-size: var(--el-text-xl); color: var(--el-color-text); }
.el-brand-subtitle { margin: 6px 0 0; font-size: var(--el-text-xs); color: var(--el-color-text-secondary); }
.el-logo-mark { width: 36px; height: 36px; }

.el-sidebar-nav {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.el-nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: 12px;
  color: var(--el-color-text-secondary);
  font-size: var(--el-text-sm);
  font-weight: 600;
  text-decoration: none;
  transition: background-color var(--el-transition), color var(--el-transition), transform var(--el-transition);
}
.el-nav-link:hover {
  background: rgba(79, 70, 229, 0.08);
  color: var(--el-color-primary);
  transform: translateX(2px);
}
.el-nav-link.is-active {
  background: var(--el-gradient-soft);
  color: var(--el-color-primary-deep);
  border-left: 3px solid;
  border-image: var(--el-gradient-brand) 1;
  padding-left: 13px;
}
[data-theme="dark"] .el-nav-link.is-active { color: var(--el-color-soft-indigo); }

.el-app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--el-color-surface);
  border-bottom: 1px solid var(--el-color-border);
  box-shadow: var(--el-shadow-xs);
}
.el-header-school { margin: 0; font-size: var(--el-text-xs); color: var(--el-color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.el-header-title { margin: 4px 0 0; font-size: var(--el-text-3xl); font-weight: 900; letter-spacing: -0.025em; }

.el-user-box {
  display: flex;
  align-items: center;
  gap: 12px;
}
.el-user-meta { display: flex; flex-direction: column; align-items: flex-end; }
.el-user-name { margin: 0; font-weight: 700; font-size: var(--el-text-sm); }
.el-user-email { margin: 0; font-size: var(--el-text-xs); color: var(--el-color-text-secondary); }

.el-theme-toggle {
  width: 40px;
  height: 40px;
  border-radius: var(--el-radius-full);
  background: rgba(79, 70, 229, 0.08);
  border: none;
  box-shadow: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  transition: background-color var(--el-transition), transform var(--el-transition);
  padding: 0;
}
.el-theme-toggle:hover { background: rgba(79, 70, 229, 0.16); transform: rotate(20deg); }
.el-theme-toggle svg { width: 20px; height: 20px; }
.el-theme-toggle .el-icon-moon { display: none; }
[data-theme="dark"] .el-theme-toggle .el-icon-sun { display: none; }
[data-theme="dark"] .el-theme-toggle .el-icon-moon { display: inline-block; }

.el-dashboard-content { padding: var(--el-space-6); flex: 1; }
```

- [ ] **Step 5: Remplacer le bloc `table`, `thead`, `tbody`**

```css
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--el-color-surface);
  border-radius: var(--el-radius-lg);
  overflow: hidden;
  box-shadow: var(--el-shadow-xs);
  margin-bottom: var(--el-space-5);
}
thead th {
  background: var(--el-color-surface-alt);
  color: var(--el-color-text-secondary);
  font-weight: 700;
  font-size: var(--el-text-xs);
  text-align: left;
  padding: 12px 16px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--el-color-border);
}
tbody td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-color-border);
  font-size: var(--el-text-sm);
}
tbody tr:last-child td { border-bottom: none; }
tbody tr { transition: background-color var(--el-transition); }
tbody tr:hover { background: rgba(79, 70, 229, 0.04); }
```

- [ ] **Step 6: Lancer la suite complète et vérifier zéro régression**

```bash
npm test 2>&1 | tail -8
```

Expected: tous les tests existants verts (409+). Le test "tokens critiques" doit toujours passer. Les 2 autres tests refonte-design (showcase) en échec — c'est attendu.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): restyle composants (sidebar, header, cards, buttons, badges, banners, forms, tables)

- Sidebar avec gradient subtil top + nav-links pills + active state border-image
- Header avec H1 Nunito 900 + theme toggle button
- Cards : variants is-interactive (scale hover), is-highlight (top accent), is-elevated
- Buttons : primary gradient + secondary/ghost/destructive variants
- Badges : pills full-rounded + variants success/warning/error/info en light + dark
- Banners : icones contextuelles + animation sparkle sur success (respect prefers-reduced-motion)
- Forms : focus ring indigo
- Tables : header soft + row hover

Aucun changement de classes CSS, aliases backward-compat conserves."
```

---

## Task 4: Ajouter les nouveaux patterns (empty states, avatars, dot pattern, confetti, animations, skeleton)

**Files:**
- Modify: `apps/web/src/server.js` (DESIGN_SYSTEM_CSS — ajout en fin de constante avant la fermeture backtick)

**Pourquoi:** Touches ludiques validées par le user — différenciant Klassly-style.

- [ ] **Step 1: Localiser la fin de `DESIGN_SYSTEM_CSS`**

```bash
grep -n "^const EDUCLINK_LOGO_SVG" apps/web/src/server.js
```

Le bloc se termine juste avant cette ligne (~1253). On insère le nouveau CSS juste avant le backtick `\`;` final.

- [ ] **Step 2: Ajouter le bloc patterns décoratifs à la fin de DESIGN_SYSTEM_CSS**

Insérer avant la ligne `\`;` finale :

```css

/* ============================================================
   Patterns decoratifs et nouveaux composants (Klassly-style)
   ============================================================ */

.el-bg-dot-pattern {
  background-image: var(--el-gradient-dot-pattern);
  background-size: 24px 24px;
}

/* Empty state */
.el-empty {
  text-align: center;
  padding: 48px 24px;
  background: var(--el-color-surface);
  border-radius: var(--el-radius-lg);
  border: 1px dashed var(--el-color-border);
  margin-bottom: var(--el-space-5);
}
.el-empty-illustration {
  width: 96px;
  height: 96px;
  margin: 0 auto var(--el-space-4);
  display: block;
}
.el-empty-title {
  font-size: var(--el-text-lg);
  font-weight: 800;
  margin: 0 0 var(--el-space-2);
  color: var(--el-color-text);
}
.el-empty-message {
  color: var(--el-color-text-secondary);
  margin: 0 0 var(--el-space-5);
  max-width: 360px;
  margin-left: auto;
  margin-right: auto;
}

/* Avatars */
.el-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--el-radius-full);
  color: #fff;
  font-weight: 700;
  font-size: var(--el-text-sm);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  background: linear-gradient(135deg, #4F46E5, #7C3AED);
}
.el-avatar.is-small { width: 32px; height: 32px; font-size: var(--el-text-xs); }
.el-avatar.is-large { width: 56px; height: 56px; font-size: var(--el-text-lg); }
.el-avatar.is-palette-1 { background: linear-gradient(135deg, #4F46E5, #7C3AED); }
.el-avatar.is-palette-2 { background: linear-gradient(135deg, #14B8A6, #06B6D4); }
.el-avatar.is-palette-3 { background: linear-gradient(135deg, #EC4899, #F43F5E); }
.el-avatar.is-palette-4 { background: linear-gradient(135deg, #F59E0B, #EF4444); }
.el-avatar.is-palette-5 { background: linear-gradient(135deg, #7C3AED, #C026D3); }
.el-avatar.is-palette-6 { background: linear-gradient(135deg, #C026D3, #F43F5E); }

/* Loading skeleton */
.el-skeleton {
  display: inline-block;
  background: linear-gradient(90deg, var(--el-color-bg-soft) 0%, var(--el-color-surface-alt) 50%, var(--el-color-bg-soft) 100%);
  background-size: 200% 100%;
  border-radius: var(--el-radius-sm);
  animation: el-skeleton-shimmer 1.5s linear infinite;
  min-height: 1em;
}
@keyframes el-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .el-skeleton { animation: none; }
}

/* Confetti (banners de succes importants) */
@keyframes el-confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(60px) rotate(360deg); opacity: 0; }
}
.el-confetti {
  position: absolute;
  top: 0;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  pointer-events: none;
  animation: el-confetti-fall 1s ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .el-confetti { display: none; }
}

/* Animations globales — respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  button:hover, .el-card.is-interactive:hover {
    transform: none !important;
  }
}
```

- [ ] **Step 3: Vérifier que le CSS est valide (parse OK)**

```bash
curl -s http://localhost:0 || true  # juste pour s'assurer qu'on n'a pas de soucis de back-tick
node -e "const s = require('./apps/web/src/server.js'); console.log('module load OK');" 2>&1 | tail -5
```

Si le module ne charge pas (syntax error string), vérifier les backticks et les `\` dans le CSS.

Expected: pas d'erreur de parse.

- [ ] **Step 4: Lancer la suite complète**

```bash
npm test 2>&1 | tail -8
```

Expected: 409+ tests verts. Test "tokens critiques" passe. Tests showcase encore en échec (normal).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): ajoute patterns decoratifs (empty states, avatars 6 palettes, skeleton, confetti, dot bg)

- .el-empty pattern avec illustration container
- .el-avatar avec 6 palettes gradients (indigo, teal, rose, orange, violet, fuchsia)
- .el-skeleton avec shimmer animation
- .el-confetti pour banners de succes (animation fall 1s)
- .el-bg-dot-pattern utilitaire
- Respect prefers-reduced-motion : desactive animations + transforms"
```

---

## Task 5: Swap Inter→Nunito + créer `THEME_BOOTSTRAP_JS` avec hash CSP

**Files:**
- Modify: `apps/web/src/server.js:1258` (renderPageHead — Google Fonts link)
- Modify: `apps/web/src/server.js` — ajouter constante `THEME_BOOTSTRAP_JS` et `THEME_BOOTSTRAP_HASH` près des autres constantes
- Modify: `apps/web/src/server.js` — modifier `applySecurityHeaders` pour injecter le hash CSP
- Modify: `apps/web/src/server.js:1258` (renderPageHead — injection du script inline)

**Pourquoi:** Sans le swap Inter→Nunito, la police ne s'applique pas. Sans le bootstrap script CSP-compliant, on a un FOUC visible (flash en light puis switch en dark).

- [ ] **Step 1: Localiser et modifier `renderPageHead`**

```bash
grep -n "function renderPageHead" apps/web/src/server.js
```

Repérer la ligne (~1257).

Remplacer la fonction :

```javascript
function renderPageHead(title) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><link rel="stylesheet" href="/assets/design-system.css"><script src="/assets/ux.js" defer></script>`;
}
```

Par :

```javascript
function renderPageHead(title) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><script>${THEME_BOOTSTRAP_JS}</script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"><link rel="stylesheet" href="/assets/design-system.css"><script src="/assets/ux.js" defer></script>`;
}
```

⚠️ Le script bootstrap est injecté **AVANT** le lien CSS — sinon FOUC garanti.

- [ ] **Step 2: Ajouter la constante `THEME_BOOTSTRAP_JS` + son hash**

Repérer la constante `UX_SCRIPT_JS` (`grep -n "^const UX_SCRIPT_JS" apps/web/src/server.js`, ligne ~713).

Insérer juste avant `const UX_SCRIPT_JS = ...` :

```javascript
const THEME_BOOTSTRAP_JS = `(function(){try{var s=localStorage.getItem('el-theme');var p=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(p?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

const THEME_BOOTSTRAP_HASH = crypto.createHash('sha256').update(THEME_BOOTSTRAP_JS).digest('base64');
```

⚠️ Vérifier que `crypto` est déjà importé en haut du fichier (`const crypto = require('node:crypto');`). Si non :

```bash
grep -n "require('node:crypto')\|require(\"node:crypto\")" apps/web/src/server.js | head -3
```

S'il n'y est pas, l'ajouter en haut du fichier après les autres `require`.

- [ ] **Step 3: Modifier `applySecurityHeaders` pour injecter le hash dans le CSP**

Localiser :

```bash
grep -n "function applySecurityHeaders" apps/web/src/server.js
```

Modifier la ligne du `script-src 'self'` (ligne ~606) :

```javascript
      "script-src 'self'",
```

Par :

```javascript
      `script-src 'self' 'sha256-${THEME_BOOTSTRAP_HASH}'`,
```

- [ ] **Step 4: Smoke test local — démarrer le serveur en dev et vérifier**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4321 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2
curl -s -i http://localhost:4321/login 2>&1 | head -30
kill $SERVER_PID 2>/dev/null
```

Expected dans la sortie :
- `content-security-policy: ... script-src 'self' 'sha256-...';` (hash présent)
- Dans le body HTML : `<script>(function(){try{var s=...` (bootstrap script inline)
- `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:...` (Nunito, plus Inter)

- [ ] **Step 5: Lancer la suite de tests**

```bash
npm test 2>&1 | tail -8
```

Expected: tests existants verts. Test "tokens critiques" passe.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): swap Inter -> Nunito + script anti-FOUC CSP-compliant pour mode jour/nuit

- renderPageHead injecte le bootstrap theme script AVANT le CSS (anti-FOUC)
- Constante THEME_BOOTSTRAP_JS minifiee + THEME_BOOTSTRAP_HASH sha256 base64
- CSP script-src 'self' 'sha256-...' autorise le script inline calcule
- Swap Google Fonts Inter -> Nunito (weights 400, 600, 700, 800, 900)"
```

---

## Task 6: Étendre `UX_SCRIPT_JS` avec le toggle thème + helper avatar gradient

**Files:**
- Modify: `apps/web/src/server.js:713-724` (constante `UX_SCRIPT_JS`)

**Pourquoi:** Le bouton toggle du Task 7 a besoin d'un handler JS qui swap `data-theme` et persiste le choix.

- [ ] **Step 1: Localiser UX_SCRIPT_JS**

```bash
grep -n "^const UX_SCRIPT_JS" apps/web/src/server.js
```

- [ ] **Step 2: Remplacer la constante par sa version étendue**

```javascript
const UX_SCRIPT_JS = `(function () {
  // Confirmation des actions destructives (existant)
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    var message = form.getAttribute('data-confirm');
    if (!message) return;
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });

  // Toggle theme jour/nuit (nouveau)
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

  // Helper avatar gradient deterministique (Klassly-style)
  // Disponible globalement pour debug / scripts inline
  window.elAvatarPaletteFor = function (userId) {
    if (typeof userId !== 'string' || userId.length === 0) return 1;
    var hash = 0;
    for (var i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 6 + 1;
  };
})();
`;
```

- [ ] **Step 3: Smoke test — ouvrir le serveur et vérifier le JS servi**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4322 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2
curl -s http://localhost:4322/assets/ux.js | head -40
kill $SERVER_PID 2>/dev/null
```

Expected: voir `el-theme-toggle` et `elAvatarPaletteFor` dans le JS.

- [ ] **Step 4: Lancer la suite de tests**

```bash
npm test 2>&1 | tail -8
```

Expected: 409+ verts.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): UX_SCRIPT_JS etendu avec toggle theme + helper avatar palette

- Click handler delegue sur .el-theme-toggle : toggle light/dark + persiste localStorage
- window.elAvatarPaletteFor(userId) : hash deterministique 1-6 pour palette avatar"
```

---

## Task 7: Ajouter le bouton toggle SVG dans le header

**Files:**
- Modify: `apps/web/src/server.js` — fonction qui rend le header (probablement `renderDashboardLayout` ou helper voisin)

**Pourquoi:** Le user a besoin d'un bouton visible pour switcher light/dark.

- [ ] **Step 1: Localiser le rendu du header `.el-app-header`**

```bash
grep -n "el-app-header\|class=\"el-user-box\"" apps/web/src/server.js | head -10
```

Repérer l'endroit où `<div class="el-user-box">...</div>` est rendu (probablement dans `renderDashboardLayout`).

- [ ] **Step 2: Définir le SVG du bouton toggle comme constante**

Ajouter juste après `EDUCLINK_LOGO_SVG` (ligne ~1255) :

```javascript
const THEME_TOGGLE_SVG = `<button type="button" class="el-theme-toggle" aria-label="Basculer mode jour/nuit" title="Basculer mode jour/nuit"><svg class="el-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="el-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>`;
```

- [ ] **Step 3: Injecter le bouton dans le header**

Localiser le rendu du `<div class="el-user-box">` et ajouter le toggle button **avant** la user box. Exemple (à adapter à la structure exacte trouvée) :

Chercher :

```javascript
<div class="el-user-box">
```

Remplacer par :

```javascript
${THEME_TOGGLE_SVG}<div class="el-user-box">
```

Si la user box est dans une template literal, faire l'insertion à l'intérieur du backtick.

⚠️ Important : le bouton doit être dans la `.el-app-header` flex container, juste à gauche de `.el-user-box`. Vérifier visuellement après modif.

- [ ] **Step 4: Smoke test local**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4323 node apps/web/src/server.js &
SERVER_PID=$!
sleep 2

# Login admin (recup cookie)
COOKIE=$(curl -s -c - -X POST http://localhost:4323/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "email=admin@school-a.test&password=password123" \
  | grep -E "^localhost\s" | awk '{print $6"="$7}' | tr '\n' ';')

# Fetch dashboard et chercher le toggle
curl -s -b "$COOKIE" http://localhost:4323/dashboard/admin | grep -o "el-theme-toggle" | head -3

kill $SERVER_PID 2>/dev/null
```

Expected: `el-theme-toggle` apparaît au moins 1 fois (le bouton est bien dans le HTML).

- [ ] **Step 5: Lancer la suite de tests**

```bash
npm test 2>&1 | tail -8
```

Expected: 409+ verts.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): bouton toggle theme jour/nuit dans le header

- Constante THEME_TOGGLE_SVG avec 2 SVG inline (sun + moon)
- Bouton place dans .el-app-header avant .el-user-box
- Handler dans UX_SCRIPT_JS (deja deploye Task 6) : swap data-theme + persiste"
```

---

## Task 8: Créer `apps/web/src/showcase.js` (rendu de tous les composants)

**Files:**
- Create: `apps/web/src/showcase.js`

**Pourquoi:** Page dev-only qui rend TOUS les composants côte à côte en light + dark pour vérification visuelle. Évite d'avoir à naviguer dans 20 pages pour valider.

- [ ] **Step 1: Créer le fichier avec son contenu complet**

Contenu de `apps/web/src/showcase.js` :

```javascript
// Page showcase dev-only — rend tous les composants du design system
// en light + dark cote a cote. Accessible via /__design, gardee par NODE_ENV.

function renderShowcaseHtml() {
  const renderSection = (theme) => `
    <section data-theme="${theme}" style="padding: 32px; background: var(--el-color-bg);">
      <h1>${theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode'}</h1>

      <h2><span class="el-card-title-accent"></span>Boutons</h2>
      <div class="el-card">
        <button type="button">Primary</button>
        <button type="button" class="el-button-secondary">Secondary</button>
        <button type="button" class="el-button-link">Ghost</button>
        <button type="button" class="el-button-destructive">Destructive</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Badges</h2>
      <div class="el-card">
        <span class="el-badge">Default</span>
        <span class="el-badge is-success">Success</span>
        <span class="el-badge is-warning">Warning</span>
        <span class="el-badge is-error">Error</span>
        <span class="el-badge is-info">Info</span>
      </div>

      <h2><span class="el-card-title-accent"></span>Banners</h2>
      <div class="el-banner is-success">Action realisee avec succes</div>
      <div class="el-banner is-warning">Attention, verification recommandee</div>
      <div class="el-banner is-error">Une erreur est survenue</div>
      <div class="el-banner is-info">Information generale</div>

      <h2><span class="el-card-title-accent"></span>Cards</h2>
      <div class="el-card">
        <h3>Card par defaut</h3>
        <p>Contenu standard avec ombre soft.</p>
      </div>
      <div class="el-card is-interactive">
        <h3>Card interactive</h3>
        <p>Hover → scale + ombre plus prononcee.</p>
      </div>
      <div class="el-card is-highlight">
        <h3>Card highlight</h3>
        <p>Bordure top gradient brand.</p>
      </div>
      <div class="el-card is-elevated">
        <h3>Card elevated</h3>
        <p>Ombre prononcee pour mise en avant.</p>
      </div>

      <h2><span class="el-card-title-accent"></span>Avatars (6 palettes)</h2>
      <div class="el-card" style="display:flex; gap:12px; align-items:center;">
        <span class="el-avatar is-palette-1">JD</span>
        <span class="el-avatar is-palette-2">AB</span>
        <span class="el-avatar is-palette-3">CE</span>
        <span class="el-avatar is-palette-4">FG</span>
        <span class="el-avatar is-palette-5">HI</span>
        <span class="el-avatar is-palette-6">KL</span>
        <span class="el-avatar is-small is-palette-1">SM</span>
        <span class="el-avatar is-large is-palette-2">LG</span>
      </div>

      <h2><span class="el-card-title-accent"></span>Formulaires</h2>
      <div class="el-card">
        <label>Email
          <input type="email" placeholder="vous@exemple.fr" />
        </label>
        <label>Mot de passe
          <input type="password" placeholder="********" />
        </label>
        <label>Message
          <textarea rows="3" placeholder="Tapez votre message..."></textarea>
        </label>
        <label>Choix
          <select>
            <option>Option A</option>
            <option>Option B</option>
          </select>
        </label>
        <button type="button">Valider</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Table</h2>
      <table>
        <thead><tr><th>Nom</th><th>Role</th><th>Statut</th></tr></thead>
        <tbody>
          <tr><td>Alice Dupont</td><td>Enseignante</td><td><span class="el-badge is-success">Actif</span></td></tr>
          <tr><td>Bob Martin</td><td>Parent</td><td><span class="el-badge is-warning">En attente</span></td></tr>
          <tr><td>Charlie Diallo</td><td>Admin</td><td><span class="el-badge is-info">Connecte</span></td></tr>
        </tbody>
      </table>

      <h2><span class="el-card-title-accent"></span>Empty state</h2>
      <div class="el-empty">
        <svg class="el-empty-illustration" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="el-empty-grad-${theme}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4F46E5"/>
              <stop offset="100%" stop-color="#7C3AED"/>
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="40" fill="url(#el-empty-grad-${theme})" opacity="0.15"/>
          <rect x="28" y="30" width="40" height="36" rx="4" stroke="url(#el-empty-grad-${theme})" stroke-width="2.5" fill="none"/>
          <path d="M28 38h40M34 48h28M34 56h20" stroke="url(#el-empty-grad-${theme})" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <p class="el-empty-title">Aucun element a afficher</p>
        <p class="el-empty-message">Lorsque vous aurez ajoute du contenu, il apparaitra ici.</p>
        <button type="button">Ajouter le premier element</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Skeleton loader</h2>
      <div class="el-card">
        <span class="el-skeleton" style="width: 60%; height: 1.5em; display:block; margin-bottom: 12px;"></span>
        <span class="el-skeleton" style="width: 90%; height: 1em; display:block; margin-bottom: 8px;"></span>
        <span class="el-skeleton" style="width: 80%; height: 1em; display:block;"></span>
      </div>

      <h2><span class="el-card-title-accent"></span>Typo</h2>
      <div class="el-card">
        <h1>Heading 1 — Nunito 900</h1>
        <h2>Heading 2 — Nunito 800</h2>
        <h3>Heading 3 — Nunito 700</h3>
        <p>Paragraphe — Nunito 400, line-height 1.6. <a href="#">Lien indigo</a> et <code>code inline</code>.</p>
      </div>
    </section>
  `;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Showcase — EducLink</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"><link rel="stylesheet" href="/assets/design-system.css"></head><body style="margin: 0;">
    <header style="padding: 24px 32px; background: var(--el-color-surface); border-bottom: 1px solid var(--el-color-border);">
      <h1 style="margin: 0;">Design Showcase — EducLink (Klassly-style)</h1>
      <p style="margin: 4px 0 0; color: var(--el-color-text-secondary);">Page dev-only — composants en light + dark cote a cote.</p>
    </header>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0;">
      ${renderSection('light')}
      ${renderSection('dark')}
    </div>
  </body></html>`;
}

module.exports = { renderShowcaseHtml };
```

- [ ] **Step 2: Vérifier que le module charge sans erreur**

```bash
node -e "const s = require('./apps/web/src/showcase.js'); console.log(typeof s.renderShowcaseHtml === 'function' ? 'OK' : 'KO');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/showcase.js
git commit -m "feat(design): page showcase /__design dev-only avec tous les composants

Rend cote a cote :
- light mode (data-theme=light)
- dark mode (data-theme=dark)

Couvre boutons, badges, banners, cards (4 variants), avatars (6 palettes + 3 tailles),
formulaires, tables, empty state avec SVG inline, skeleton loader, typo.

Module isole (apps/web/src/showcase.js), branche dans la prochaine task."
```

---

## Task 9: Brancher la route `/__design` dev-only dans server.js

**Files:**
- Modify: `apps/web/src/server.js` — ajouter `require('./showcase')` en haut + branchement route

**Pourquoi:** Sans branchement, le module showcase n'est pas accessible. Garde `NODE_ENV !== 'production'` pour éviter de leak en prod.

- [ ] **Step 1: Ajouter le require en haut du fichier**

```bash
grep -n "^const.*require" apps/web/src/server.js | head -5
```

Ajouter à la suite des autres require principaux (vers les premières lignes) :

```javascript
const { renderShowcaseHtml } = require('./showcase');
```

- [ ] **Step 2: Brancher la route après les autres routes assets statiques**

Localiser :

```bash
grep -n "/assets/ux.js" apps/web/src/server.js
```

Ligne ~4607. Juste après le bloc `/assets/ux.js`, ajouter :

```javascript
    if (request.method === 'GET' && url.pathname === '/__design') {
      if (isProductionEnv) {
        sendNotFoundPage(response, session);
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderShowcaseHtml());
      return;
    }
```

⚠️ Vérifier que `isProductionEnv` est disponible dans le scope (devrait l'être — utilisé par `applySecurityHeaders`). Si non, le calculer juste avant : `const isProductionEnv = process.env.NODE_ENV === 'production';`.

⚠️ Si `sendNotFoundPage` exige une session, passer `null` ou utiliser la fonction interne 404 brute. Vérifier la signature :

```bash
grep -n "function sendNotFoundPage" apps/web/src/server.js
```

Si elle attend une session, passer `null` est OK (vérifier qu'elle gère ce cas) ; sinon utiliser :

```javascript
response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
response.end('<!doctype html><html><body><h1>404 Not Found</h1></body></html>');
```

- [ ] **Step 3: Lancer le test "/__design accessible en dev"**

```bash
node --test --test-name-pattern "refonte-design: la page showcase /__design est accessible en dev" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected: **PASS**.

- [ ] **Step 4: Lancer le test "/__design retourne 404 en production"**

```bash
node --test --test-name-pattern "refonte-design: la page showcase /__design retourne 404 en production" apps/web/src/server.test.js 2>&1 | tail -10
```

Expected: **PASS**.

- [ ] **Step 5: Lancer la suite complète pour confirmer aucune régression**

```bash
npm test 2>&1 | tail -8
```

Expected: 412+ tests verts (409 existants + 3 nouveaux refonte-design).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server.js
git commit -m "feat(design): branche la route GET /__design (dev-only)

- Page accessible uniquement quand NODE_ENV != 'production'
- En prod : 404 explicite
- Verifie les 3 tests refonte-design (CSS tokens + showcase dev + showcase prod 404)"
```

---

## Task 10: Audit couleurs hardcodées + remplacement par tokens

**Files:**
- Modify: `apps/web/src/server.js` — chercher et remplacer les `#2563eb`, `#7c3aed`, `#22c55e` qui restent en dur

**Pourquoi:** Identifié comme risque "Moyen" dans le spec section 10. Le user peut avoir copié-collé des couleurs en dur dans certains templates HTML inline, ce qui casserait le dark mode.

- [ ] **Step 1: Audit grep des anciennes couleurs**

```bash
grep -rn '#2563eb\|#1e3a8a\|#7c3aed\|#22c55e\|#4ade80\|#a78bfa' apps/web/src/server.js | grep -v "DESIGN_SYSTEM_CSS\|EDUCLINK_LOGO_SVG\|test-name"
```

Expected: liste des occurrences hors design system et hors logo (qui reste inchangé).

Si aucune ligne sortie : aller directement au Step 4.

- [ ] **Step 2: Pour chaque occurrence trouvée, identifier le contexte**

Exemple si on trouve `#2563eb` dans un attribut `style="..."` d'un HTML inline :

```html
<div style="background: #2563eb">
```

Remplacer par :

```html
<div style="background: var(--el-color-primary)">
```

Table de correspondance :

| Couleur hardcodée | Remplacer par |
|---|---|
| `#2563eb` | `var(--el-color-primary)` |
| `#1e3a8a` | `var(--el-color-primary-deep)` |
| `#7c3aed` | `var(--el-color-accent)` |
| `#22c55e` | `var(--el-color-success)` |
| `#4ade80` | `var(--el-color-soft-green)` (alias conservé) |
| `#a78bfa` | `var(--el-color-soft-violet)` |

⚠️ **Exception** : ne PAS toucher au logo SVG `EDUCLINK_LOGO_SVG` (vert→bleu→violet, signature visuelle de l'app, hors scope du sprint).

- [ ] **Step 3: Audit `<style>` inline**

```bash
grep -n "<style>\|<style " apps/web/src/server.js
```

Si des `<style>` inline overrident le design system, les inspecter — soit les supprimer (si redondants avec le nouveau CSS), soit les adapter pour utiliser les tokens.

- [ ] **Step 4: Lancer la suite complète**

```bash
npm test 2>&1 | tail -8
```

Expected: 412+ verts.

- [ ] **Step 5: Smoke test visuel — démarrer le serveur et naviguer en light + dark**

```bash
EDUCLINK_PERSISTENCE=memory SESSION_SECRET=dev-secret-32chars-pad-pad-pad-pad PORT=4324 node apps/web/src/server.js &
echo "Ouvre http://localhost:4324/__design dans ton navigateur."
echo "Verifie visuellement light + dark."
echo "Puis Ctrl-C pour stopper."
wait
```

Validation manuelle utilisateur (à faire dans le navigateur) :
- Page `/__design` rend correctement light et dark côte à côte
- Boutons : gradient indigo→violet visible en light, gradient légèrement clairci en dark
- Avatars : 6 palettes visibles, lisibles dans les deux thèmes
- Banners : icônes contextuelles présentes, sparkle anime sur success
- Cards : ombres douces en light, ombres profondes en dark, hover scale fonctionne
- Empty state : SVG illustration visible en gradient indigo/violet
- Pas de FOUC en rafraîchissant en dark mode

- [ ] **Step 6: Commit (si modifs)**

```bash
git status -s
# si modifs :
git add apps/web/src/server.js
git commit -m "refactor(design): remplace les couleurs hardcodees restantes par les tokens CSS

Garantit la coherence en dark mode pour les <style> inline qui utilisaient
encore les hex en dur. Le logo EDUCLINK_LOGO_SVG reste inchange (signature)."
```

Si pas de modif au Step 1 : skip ce step (rien à commit).

---

## Task 11: Lancer la suite complète + push → auto-deploy Railway

**Files:** aucun (git only)

**Pourquoi:** Validation finale avant que le user voit le résultat en prod.

- [ ] **Step 1: Lancer la suite complète une dernière fois**

```bash
npm test 2>&1 | tail -12
```

Expected: tous tests verts (412+). Pas d'erreur.

- [ ] **Step 2: Vérifier le diff final**

```bash
git log --oneline origin/main..HEAD
```

Expected: liste des commits Tasks 1-10 (~10 commits).

- [ ] **Step 3: Vérifier qu'aucun fichier sensible n'est inclus**

```bash
git diff origin/main..HEAD --stat
```

Expected uniquement :
- `apps/web/src/server.js` modifié
- `apps/web/src/server.test.js` modifié
- `apps/web/src/showcase.js` créé
- (et docs/superpowers/plans/2026-06-11-refonte-klassly-design.md si présent)

Aucun `.env`, `node_modules/`, ou fichier de build.

- [ ] **Step 4: Push vers main**

```bash
git push origin main 2>&1 | tail -5
```

Expected: `9bf...XXX..YYY  main -> main` (push réussi).

- [ ] **Step 5: Attendre le déploiement Railway et tester en prod**

```bash
echo "Railway redeploit en ~2-3 min. Patiente puis lance le check :"
sleep 180
curl -s -o /tmp/css_check.html -w "STATUS=%{http_code}\n" https://educlink-production.up.railway.app/assets/design-system.css
grep -o '"Nunito"\|#4F46E5\|\[data-theme="dark"\]' /tmp/css_check.html | head -5
```

Expected : STATUS=200 + les 3 marqueurs présents (`"Nunito"`, `#4F46E5`, `[data-theme="dark"]`).

- [ ] **Step 6: Validation manuelle utilisateur en prod (checklist)**

À demander au user de vérifier :

1. https://educlink-production.up.railway.app/login → page login avec nouveau design indigo
2. Login `admin@school-a.test` / `password123` → dashboard avec sidebar restylée
3. Click sur le bouton soleil/lune en haut → bascule en dark sans flash (anti-FOUC)
4. Rafraîchir → reste en dark (préférence persistée localStorage)
5. Naviguer vers `/admin/students`, `/admin/absences`, `/admin/decrocheurs` → cartes, badges, banners stylés
6. Aucun bouton ou texte illisible en dark mode

- [ ] **Step 7: Si tout va bien, mettre à jour TASKS.md (optionnel)**

Ajouter une ligne dans TASKS.md sous un nouveau "Sprint X — Refonte Klassly-style" pour traçabilité :

```markdown
## SPRINT 9 — Refonte visuelle Klassly-style (DESIGN)

### DESIGN-01 — Refonte design system + mode jour/nuit ✅ DONE
- Palette indigo #4F46E5 → violet #7C3AED
- Typo Nunito (Google Fonts)
- Composants restylés (cards/boutons/badges/banners/forms/tables)
- Nouveaux patterns (empty states, avatars 6 palettes, dot bg, skeleton, confetti)
- Mode jour/nuit avec anti-FOUC CSP-compliant
- Page /__design dev-only pour validation visuelle
- Spec : [docs/superpowers/specs/2026-06-11-refonte-klassly-design.md]
- Plan : [docs/superpowers/plans/2026-06-11-refonte-klassly-design.md]
```

Puis commit :

```bash
git add TASKS.md
git commit -m "docs(tasks): Sprint 9 DESIGN-01 refonte Klassly-style termine"
git push origin main
```

---

## Self-Review Checklist

**Spec coverage** :
- ✅ Tokens light + dark mode (spec §4) → Task 2
- ✅ Composants restylés (spec §5.1-5.8) → Task 3
- ✅ Nouveaux patterns empty state/avatar/skeleton/confetti (spec §5.9-5.12) → Task 4
- ✅ Mécanisme jour/nuit + anti-FOUC + CSP (spec §6) → Tasks 5+6+7
- ✅ Page showcase `/__design` (spec §7) → Tasks 8+9
- ✅ Tests automatisés (spec §8.1) → Task 1
- ✅ Audit couleurs hardcodées (spec §10 risque) → Task 10
- ✅ Livraison commit + push Railway (spec §9) → Task 11

**Placeholder scan** : pas de TBD / TODO / "fill in later" / "similar to" → ✅

**Type / signature consistency** :
- `THEME_BOOTSTRAP_JS` et `THEME_BOOTSTRAP_HASH` utilisés dans Tasks 5 + 9 (cohérent)
- `elAvatarPaletteFor(userId)` exposée globalement Task 6
- `renderShowcaseHtml()` exportée Task 8, importée Task 9
- Classes CSS : `.el-theme-toggle`, `.el-avatar`, `.el-empty`, `.el-skeleton`, `.el-confetti` — cohérentes entre CSS (Tasks 3-4) et JS (Task 6) et HTML rendu (Tasks 7-8)

**Scope check** : 1 sprint, 1 plan, 2 fichiers touchés, ~10 commits atomiques → bien dimensionné ✅
