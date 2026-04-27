# EducLink — Frontend Next.js (`apps/web-next`)

Frontend moderne EducLink basé sur **Next.js 14 (App Router) + TypeScript + Tailwind CSS**.
Cible : remplacer progressivement le rendu HTML inline servi par `apps/web/src/server.js` par
une SPA SSR moderne, mobile-first, alignée à la charte EducLink (gradient
`#22C55E → #2563EB → #7C3AED`, police Inter, design tokens).

L'application **consomme l'API existante** `apps/web` via les rewrites de `next.config.mjs`
(`/api/v1/*` → `http://localhost:3000/api/v1/*`).

## Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 14 (App Router, RSC) |
| Langage | TypeScript strict |
| Styles | Tailwind CSS 3 + tokens EducLink (`tailwind.config.ts`) |
| Police | Inter via `next/font/google` (auto-hosted, zéro CLS) |
| API | Rewrite vers `apps/web` sur :3000 |
| Port dev | **3100** (pour ne pas entrer en conflit avec :3000) |

## Démarrer en local

Prérequis : Node.js 20+, le backend `apps/web` qui tourne sur `:3000`.

```bash
# 1. Backend legacy (terminal 1)
cd ../../
npm run start:dev   # http://localhost:3000

# 2. Frontend Next.js (terminal 2)
cd apps/web-next
cp .env.local.example .env.local
npm install
npm run dev         # http://localhost:3100
```

## Pages livrées

| Route | Description |
|---|---|
| `/` | Landing — hero gradient, présentation produit, audience |
| `/login` | Formulaire de connexion + comptes de démo |
| `/dashboard` | Tableau de bord direction — métriques, activité, alertes IA, actions rapides |
| `/students` | Liste des élèves — consomme `/api/v1/students` (avec fallback mock si backend down) |

## Conventions

- **Composants UI partagés** : `components/ui/` (Logo, Button, Badge, Card via classes Tailwind `card`, `btn-primary`, `btn-secondary`, `badge` définies dans `globals.css`)
- **Composants shell** : `components/shell/` (Sidebar, Header)
- **Layouts par groupe** : `app/(app)/layout.tsx` pour les pages authentifiées (sidebar visible)
- **Server Components par défaut** ; `'use client'` seulement quand nécessaire (Sidebar pour `usePathname`)

## Charte appliquée

Tokens définis dans `tailwind.config.ts` :

```ts
colors.brand = {
  blue: '#2563eb',
  'blue-dark': '#1e3a8a',
  green: '#22c55e',
  'green-soft': '#4ade80',
  purple: '#7c3aed',
  'purple-soft': '#a78bfa'
}
backgroundImage['brand-gradient'] = 'linear-gradient(95deg, #22c55e 0%, #2563eb 52%, #7c3aed 100%)'
```

Utilitaires custom dans `globals.css` :
- `.text-brand-gradient` — wordmark gradient
- `.btn-primary` / `.btn-secondary` — boutons normalisés
- `.badge` — pastille brand
- `.card` — carte standard avec hover

## TODO (prochaines itérations)

- [ ] Auth réelle (cookie de session partagé avec `apps/web` ou nouveau `/api/auth/session`)
- [ ] Migration des autres pages : `/teacher/attendance`, `/teacher/grades`, `/parent/*`, `/student/*`, `/admin/finance`
- [ ] Composants formulaires partagés (Input, Select, DatePicker)
- [ ] Tests E2E avec Playwright
- [ ] i18n (FR / AR / EN) avec `next-intl`
- [ ] Mobile : drawer pour la sidebar
