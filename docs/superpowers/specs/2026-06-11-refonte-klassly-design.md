# Refonte visuelle EducLink — direction Klassly + mode jour/nuit

**Date** : 2026-06-11
**Statut** : spec validé, en attente d'implémentation
**Sprint cible** : refonte visuelle (1er sprint d'une série inspirée Klassly)
**Auteur** : brainstorming session Claude + SoleilBMS

---

## 1. Contexte

EducLink est en production sur Railway ([educlink-production.up.railway.app](https://educlink-production.up.railway.app)) avec un design system fonctionnel mais institutionnel (palette blue/green/purple, police Inter, angles relativement vifs). L'utilisateur veut **rapprocher l'expérience visuelle de [Klassly](https://klassroom.fr)** — produit français leader de la communication école↔parents — qui projette un univers **ludique, famille, accessible**, avec des dégradés bleu/violet, une typo ronde et des composants doux.

Ce sprint est le **premier d'une série** de rapprochements vers l'écosystème Klassly. Les sprints suivants (hors scope ici) introduiront les nouveaux modules fonctionnels manquants : fil d'actualité visuel (Klassly-core), devoirs enrichis (Klasswork), multidiffusion (Klassboard), sondages, RSVP événements, médiathèque.

Pour ce premier sprint on se limite à la **refonte visuelle** : aucune nouvelle fonctionnalité métier, aucun changement HTML/route, juste le design system CSS + la typo + un mode jour/nuit.

## 2. Objectifs

- **Identité visuelle alignée Klassly** : dégradé indigo→violet, typographie Nunito, composants généreux (radius larges, ombres douces), touches ludiques (illustrations, avatars colorés, micro-animations)
- **Mode jour/nuit** : toggle accessible dans le header, préférence persistée en localStorage, détection initiale via `prefers-color-scheme`, anti-FOUC garanti
- **Zéro régression fonctionnelle** : toutes les pages existantes restent opérationnelles, tous les tests existants passent
- **Une seule constante CSS** modifiée — pas de migration progressive, pas de feature flag visuel

## 3. Non-objectifs

- Aucun nouveau module fonctionnel (fil d'actualité, devoirs enrichis, sondages → sprints suivants)
- Aucune migration vers `apps/web-next` (Next.js preview, hors prod)
- Aucune refonte des emails transactionnels (Sprint OPS-04 plus tard)
- Aucun nouveau logo (on garde le SVG actuel)
- Aucune migration DB
- Aucun changement de structure HTML des pages

## 4. Design System — Tokens

### 4.1. Palette — Light mode (par défaut)

| Token | Valeur | Usage |
|---|---|---|
| `--el-color-primary` | `#4F46E5` | Indigo — couleur principale, boutons primary, liens |
| `--el-color-primary-deep` | `#4338CA` | Indigo profond — hover, états actifs |
| `--el-color-accent` | `#7C3AED` | Violet — accents, fin de gradient |
| `--el-color-soft-indigo` | `#818CF8` | Indigo clair — backgrounds soft, avatars |
| `--el-color-soft-violet` | `#A78BFA` | Violet clair — accents secondaires |
| `--el-color-bg` | `#FAFAFB` | Fond global page |
| `--el-color-bg-soft` | `#F4F4F8` | Sections secondaires |
| `--el-color-surface` | `#FFFFFF` | Cartes, panneaux |
| `--el-color-surface-alt` | `#F8FAFC` | Tables headers, surfaces alternées |
| `--el-color-text` | `#0F172A` | Texte principal |
| `--el-color-text-secondary` | `#64748B` | Texte secondaire, captions |
| `--el-color-border` | `#E2E8F0` | Bordures par défaut |
| `--el-color-border-strong` | `#CBD5E1` | Bordures emphasées (hover) |
| `--el-color-success` | `#22C55E` | Vert succès (conservé) |
| `--el-color-warning` | `#F59E0B` | Ambre warning |
| `--el-color-danger` | `#EF4444` | Rouge erreur |
| `--el-color-info-bg` | `#EEF2FF` | Fond info léger |
| `--el-gradient-brand` | `linear-gradient(120deg, #4F46E5 0%, #7C3AED 100%)` | Boutons primary, accents forts |
| `--el-gradient-soft` | `radial-gradient(...)` indigo 8% + violet 8% | Fond subtil pages clés |

### 4.2. Palette — Dark mode (`[data-theme="dark"]`)

| Token | Valeur dark |
|---|---|
| `--el-color-primary` | `#818CF8` (clairci) |
| `--el-color-primary-deep` | `#6366F1` |
| `--el-color-accent` | `#A78BFA` |
| `--el-color-bg` | `#0B0B14` |
| `--el-color-bg-soft` | `#14141F` |
| `--el-color-surface` | `#1A1A28` |
| `--el-color-surface-alt` | `#20202F` |
| `--el-color-text` | `#F1F5F9` |
| `--el-color-text-secondary` | `#94A3B8` |
| `--el-color-border` | `#2A2A3D` |
| `--el-color-border-strong` | `#3A3A52` |
| `--el-color-info-bg` | `#1E1B4B` |
| `--el-gradient-brand` | `linear-gradient(120deg, #6366F1 0%, #8B5CF6 100%)` |

### 4.3. Typographie — Nunito

- **Import** : `<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">`
- **Stack fallback** : `"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Weights utilisés** :
  - 400 : body, paragraphes, inputs
  - 600 : emphase, labels, badges
  - 700 : boutons, titres H3
  - 800 : titres H2
  - 900 : titres H1 / display
- **Letter-spacing** : `-0.02em` sur les titres (Nunito a besoin d'un tracking serré pour bien rendre en taille display)
- **Font features** : `font-feature-settings: "ss01", "cv11"` pour exploiter les variantes rondes

### 4.4. Radius (plus généreux)

| Token | Avant | Nouveau |
|---|---|---|
| `--el-radius-sm` | 6px | **10px** |
| `--el-radius-md` | 10px | **14px** |
| `--el-radius-lg` | 16px | **20px** |
| `--el-radius-xl` | 24px | **28px** |
| `--el-radius-2xl` | — | **36px** (nouveau) |
| `--el-radius-full` | — | **9999px** (nouveau, pour pills) |

### 4.5. Ombres (teintées indigo/violet)

```css
--el-shadow-xs:    0 1px 2px rgba(79, 70, 229, 0.08);
--el-shadow-sm:    0 4px 12px rgba(79, 70, 229, 0.10);
--el-shadow-md:    0 12px 28px -8px rgba(79, 70, 229, 0.18);
--el-shadow-lg:    0 24px 56px -12px rgba(124, 58, 237, 0.22);
--el-shadow-brand: 0 14px 30px -10px rgba(124, 58, 237, 0.45);
```

### 4.6. Spacing & tailles de texte

Conservés tels quels (le système 1-10 fonctionne, les tailles xs→4xl aussi).

## 5. Composants restylés

### 5.1. Sidebar

- Fond : `--el-color-surface` avec subtle gradient top→bottom `rgba(79,70,229,0.04)` → transparent
- Brand : logo SVG inchangé + sous-titre dans un cadre soft `padding: 12px; border-radius: 16px; background: rgba(79,70,229,0.06)`
- Nav links inactifs : `padding: 10px 16px; border-radius: 12px;` hover → fond `rgba(79,70,229,0.08)` + `transform: translateX(2px)`
- Nav link actif (`.is-active`) : fond `--el-gradient-soft`, bordure gauche 3px gradient brand, texte indigo deep
- Badges compteurs ("Absences 2") : pills full-rounded (`border-radius: 9999px`)
- **Emoji discrets devant chaque label** (ex : `🎒 Élèves`, `👨‍🏫 Enseignants`, `📊 Statistiques`) — apportent une touche ludique sans casser la lisibilité

### 5.2. Header (`.el-app-header`)

- Fond `--el-color-surface`, ombre `xs`, padding `16px 24px`, border-radius `0` (full-width top)
- Titre H1 : Nunito 800, taille `--el-text-3xl`, `letter-spacing: -0.025em`
- User box : **avatar circulaire 40x40 avec gradient signature** + nom + rôle (badge pill)
- **Toggle thème jour/nuit** : bouton icône SVG (soleil/lune) en haut à droite, `border-radius: 9999px; padding: 8px;`

### 5.3. Cartes (`.el-card`)

- `border-radius: var(--el-radius-lg)` (20px)
- `padding: var(--el-space-6)` (24px)
- `box-shadow: var(--el-shadow-sm)` par défaut
- Variant `.is-interactive` : hover → `transform: scale(1.01)` + `box-shadow: var(--el-shadow-md)`
- Variant `.is-highlight` : bordure top 3px `var(--el-gradient-brand)` via pseudo-élément `::before`
- Variant `.is-elevated` : `box-shadow: var(--el-shadow-lg)`
- **Décorateur de titre** `.el-card-title-accent` : mini blob coloré 12x12 `background: var(--el-gradient-brand); border-radius: 9999px;` devant le H2

### 5.4. Boutons

- **Primary** (par défaut) : `background: var(--el-gradient-brand); border-radius: 14px; padding: 12px 24px; box-shadow: var(--el-shadow-brand); font-weight: 700;` — hover `transform: translateY(-2px); filter: brightness(1.05);` — active `transform: translateY(0) scale(0.98);` (subtle bounce)
- **Secondary** (`.el-button-secondary`) : `border: 1.5px solid var(--el-color-primary); background: transparent; color: var(--el-color-primary);`
- **Ghost** (`.el-button-link`) : `background: transparent; color: var(--el-color-primary); text-decoration: none;` — hover `color: var(--el-color-accent); text-decoration: underline;`
- **Destructive** (`.el-button-destructive`) : `background: rgba(239,68,68,0.12); color: var(--el-color-danger);` — hover `background: rgba(239,68,68,0.18);`

### 5.5. Badges (`.el-badge`)

- Pills : `border-radius: 9999px; padding: 4px 12px; font-weight: 600; font-size: var(--el-text-xs);`
- Variants (fond 12% / texte deep) : `.is-success`, `.is-warning`, `.is-error`, `.is-danger`, `.is-info` (nouveau)
- Par défaut : fond `rgba(15,23,42,0.06)`, texte `--el-color-text-secondary`

### 5.6. Banners (`.el-banner`)

- `border-radius: 16px; padding: 16px 20px; box-shadow: var(--el-shadow-xs); border-left: 4px solid;`
- **Icône en début** : ✓ (success), ⚠ (warning), ✕ (danger), ⓘ (info) — taille 20x20
- Variants : `.is-success` (vert), `.is-warning` (ambre), `.is-error` / `.is-danger` (rouge), `.is-info` (indigo)
- Variant `.is-success` : icône ✨ animée en CSS (subtle rotation 2s loop)

### 5.7. Formulaires

- `input, textarea, select` : `border-radius: 12px; border: 1.5px solid var(--el-color-border); padding: 12px 16px;`
- Focus : `border-color: var(--el-color-primary); box-shadow: 0 0 0 4px rgba(79,70,229,0.18);`
- Label : `font-weight: 600; font-size: var(--el-text-sm); margin-bottom: 6px; color: var(--el-color-text);`

### 5.8. Tables

- Header (`thead th`) : `background: var(--el-color-surface-alt); color: var(--el-color-text-secondary); font-weight: 600; padding: 12px 16px; font-size: var(--el-text-sm);`
- Row (`tbody tr`) : bordure bas `1px solid var(--el-color-border)`, hover `background: rgba(79,70,229,0.04)`
- Cell padding : `14px 16px`

### 5.9. Empty states (nouveau pattern `.el-empty`)

- Container centré : `text-align: center; padding: 48px 24px;`
- **Illustration SVG inline** 96x96 en gradient soft (4 illustrations à créer : "aucun élève" `👥`-style, "aucun message" 💌-style, "aucun devoir" 📚-style, "aucun événement" 📅-style) — illustrations simples au trait, palette indigo/violet
- Titre H3 + paragraphe gris + CTA bouton optionnel

### 5.10. Avatars (nouveau composant `.el-avatar`)

- Cercle `40x40` (variants `.is-small` 32px, `.is-large` 56px)
- **Palette de 6 gradients** attribuée déterministiquement via hash du `userId` :
  - Indigo : `linear-gradient(135deg, #4F46E5, #7C3AED)`
  - Teal : `linear-gradient(135deg, #14B8A6, #06B6D4)`
  - Rose : `linear-gradient(135deg, #EC4899, #F43F5E)`
  - Orange : `linear-gradient(135deg, #F59E0B, #EF4444)`
  - Violet : `linear-gradient(135deg, #7C3AED, #C026D3)`
  - Fuchsia : `linear-gradient(135deg, #C026D3, #F43F5E)`
- Initiales blanches centrées (1-2 caractères), `font-weight: 700`
- Helper JS dans `ux.js` : `function avatarGradientFor(userId) { return PALETTE[hash(userId) % 6]; }`

### 5.11. Patterns décoratifs

- **Dot pattern** : SVG inline en background sur login + dashboards
  ```css
  background-image: radial-gradient(rgba(79,70,229,0.08) 1px, transparent 1px);
  background-size: 24px 24px;
  ```
- **Confetti CSS** sur les banners de succès importants (POST réussi) : 6 particules animées 1s, désactivable via `prefers-reduced-motion: reduce`

### 5.12. Animations & micro-interactions

- Toutes les transitions : `cubic-bezier(0.4, 0, 0.2, 1)` durée `160ms` par défaut
- Respect `@media (prefers-reduced-motion: reduce)` : désactive scale/translate, garde les color transitions
- Loading skeleton (utilitaire `.el-skeleton`) : shimmer gradient `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)` animation 1.5s loop

## 6. Mécanisme jour/nuit

### 6.1. Application du thème

- Attribut HTML : `<html data-theme="light">` ou `<html data-theme="dark">`
- CSS overrides : tous les tokens dark vivent dans un bloc `[data-theme="dark"] { --el-color-bg: #0B0B14; ... }`

### 6.2. Script anti-FOUC (inline dans `<head>`, avant le CSS)

```html
<script>
(function() {
  try {
    var stored = localStorage.getItem('el-theme');
    var prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefers ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
</script>
```

### 6.3. Toggle dans le header

- Bouton avec deux SVG (soleil/lune), affiche celui correspondant à l'autre thème
- Au click : toggle entre `light` et `dark`, persiste en localStorage, met à jour `data-theme`
- Logique dans `ux.js` (extension du fichier existant)

### 6.4. CSP considération

Le script anti-FOUC est inline, donc nécessite l'autorisation par la CSP. La CSP actuelle est `script-src 'self'` — il faudra l'ajouter via un hash `'sha256-...'`.

**Procédure concrète d'implémentation** :
1. Définir le script inline comme une constante `THEME_BOOTSTRAP_JS` à côté de `DESIGN_SYSTEM_CSS`
2. Calculer le hash via `crypto.createHash('sha256').update(THEME_BOOTSTRAP_JS).digest('base64')` au démarrage du serveur (une fois, gardé en mémoire)
3. Injecter dynamiquement dans le header CSP : `script-src 'self' 'sha256-${THEME_BOOTSTRAP_HASH}'`
4. Le `renderPageHead` injecte le script entre balises `<script>...</script>`

Avantage : zéro maintenance manuelle du hash, calcul automatique à chaque démarrage.

## 7. Implémentation — fichiers touchés

| Fichier | Action | Volume |
|---|---|---|
| [apps/web/src/server.js](apps/web/src/server.js) | Réécriture intégrale de la constante `DESIGN_SYSTEM_CSS` (ligne 726+), extension `UX_SCRIPT_JS` (toggle thème), ajout constante `THEME_BOOTSTRAP_JS` + hash CSP, swap Inter → Nunito dans `renderPageHead`, branchement route `/__design` dev-only | Constante CSS entièrement réécrite (~700 lignes finales) + ~80 lignes ailleurs |
| [apps/web/src/showcase.js](apps/web/src/showcase.js) | **Nouveau fichier** : page `/__design` dev-only qui rend tous les composants en light + dark côte à côte (boutons, cartes, badges, banners, forms, tables, empty states, avatars) | ~300 lignes nouvelles |

**Aucun autre fichier touché.** Aucune classe CSS renommée (compatibilité backward 100%). Aucune migration DB. Aucun changement HTML des pages existantes. Aucun changement de route métier.

## 8. Tests

### 8.1. Tests automatisés à ajouter

- **`server.test.js`** : `test('refonte-design: /__design accessible en dev, 404 en production', ...)` — vérifie les deux comportements via `NODE_ENV`
- **`server.test.js`** : `test('refonte-design: les tokens critiques sont présents dans le CSS servi', ...)` — GET `/assets/design-system.css` doit contenir `#4F46E5` (primary), `font-family: "Nunito"`, `[data-theme="dark"]` (sélecteur dark mode)
- Aucun test existant ne devrait casser (zéro changement HTML, zéro changement classes CSS)

### 8.2. Validation manuelle (utilisateur)

- Login en light → vérifier visuel + cliquer le toggle thème → passe en dark sans flash
- Dashboard admin → sidebar nav active, badges pills, cartes cartes interactives, header avec avatar gradient
- Dashboard parent → empty state avec illustration (s'il y a un parent sans enfants liés)
- Page bulletin → tables stylées, banner de succès avec ✨
- Page `/admin/absences` → badges pills colorés
- Mobile (375px) : sidebar collapse correct, pas d'overflow horizontal
- Toggle dark dans plusieurs pages : préférence persistée entre navigations

## 9. Livraison

- **1 commit** : `feat(design): refonte visuelle Klassly-style + mode jour/nuit`
- Push sur `main` → auto-deploy Railway (~2 min)
- Vérification manuelle prod par l'utilisateur sur [educlink-production.up.railway.app](https://educlink-production.up.railway.app)

## 10. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Page qui utilise une couleur en dur (hex hardcodé) au lieu de la variable CSS | Moyen | `grep -rn '#2563eb\|#7c3aed\|#22c55e' apps/web/src/` avant commit — remplacer par token |
| Style inline qui override le design system (login, demo) | Moyen | Audit des appels à `<style>` dans server.js avant commit |
| Lisibilité dégradée en dark mode sur un badge spécifique | Moyen | Page `/__design` couvre tous les composants en light ET dark → vérification visuelle exhaustive |
| Police Nunito qui ne charge pas (Fonts down) | Faible | Fallback `system-ui` + `font-display: swap` (pas de blocage rendu) |
| Hash CSP du script anti-FOUC incorrect → script bloqué → FOUC | Faible | Calcul du hash via Node `crypto.subtle` au build, ou commit avec hash hardcodé puis vérif en dev |
| Tests existants qui cassent | Très faible | Aucun changement HTML attendu, juste CSS |

## 11. Hors scope (sprints suivants)

À traiter dans des spec séparés, **après** validation de ce sprint en prod :

1. **Sprint Klassly-feed** : fil d'actualité visuel (posts photos, likes, commentaires, réactions emoji)
2. **Sprint Klasswork** : devoirs enrichis (multi-pièces jointes photo/audio/vidéo, soumission élève, correction graduée, commentaires parents par devoir, codes couleur matière)
3. **Sprint Klassboard** : multidiffusion ciblée multi-classes, SMS d'urgence (provider externe), stats d'engagement (vues/lectures par publication)
4. **Sprint Klassly-events** : sondages parents, RSVP événements, autorisations parentales numériques, calendrier d'événements partagé, anniversaires automatiques
5. **Sprint Klassly-medialib** : médiathèque/album photos par classe avec mosaïque
6. **Sprint Klassly-onboarding** : code de classe court (6 chiffres) pour rejoindre une classe en 1 étape
7. **Sprint Klassly-i18n** : traduction automatique multilingue (pour familles non-francophones)
8. **Sprint webnext-port** : porter cette refonte vers `apps/web-next` (Next.js preview)
9. **Sprint emails-redesign** : refonte des emails transactionnels avec la nouvelle identité (dépend de Sprint OPS-04)

## 12. Définition of Done

Ce sprint est terminé quand :

- [ ] `DESIGN_SYSTEM_CSS` refondu avec les tokens listés en section 4
- [ ] Composants des sections 5.1 à 5.12 restylés et visuellement cohérents en light + dark
- [ ] Mode jour/nuit fonctionnel (toggle, persistance, anti-FOUC)
- [ ] Page `/__design` créée et accessible en dev uniquement
- [ ] 2 nouveaux tests ajoutés et passent
- [ ] `npm test` passe (409+ tests verts)
- [ ] Commit + push → deploy Railway healthcheck vert
- [ ] Validation manuelle utilisateur OK sur prod
