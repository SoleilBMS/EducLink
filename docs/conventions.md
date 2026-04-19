# Conventions de code — EducLink

## Structure
- `apps/` contient les applications deployables (web, api).
- `packages/` contient le code partagé (core, ui, config, etc.).
- Organisation backend par domaine: `identity`, `students`, `attendance`, etc.

## Nommage
- Fichiers: `kebab-case`.
- Fonctions: verbes explicites (`createStudent`, `listAttendanceRecords`).
- Types/Classes: `PascalCase`.
- Variables: `camelCase`.

## Qualité
- Pas de logique tenant dans les contrôleurs: déléguer aux services.
- Toute feature doit inclure tests unitaires minimum.
- Pas de contournement RBAC côté frontend.

## Journalisation
- Toute opération sensible doit produire un audit log:
  - authentification
  - changement de rôle
  - consultation de données sensibles
