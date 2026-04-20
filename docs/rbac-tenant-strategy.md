# RBAC + tenant scoping (socle sécurité)

Ce document décrit la stratégie minimale implémentée pour l'issue #3.

## Principes

- Toute route API protégée passe par un guard d'authentification/autorisation.
- Toute donnée métier tenant-scopée est filtrée par `tenant_id`.
- `super_admin` est le seul rôle pouvant faire du cross-tenant, et uniquement quand la route l'autorise explicitement.
- Les autres rôles restent strictement limités à leur `tenantId` de session.

## Rôles supportés

- `super_admin`
- `school_admin`
- `director`
- `teacher`
- `parent`
- `student`
- `accountant`

## Helpers sécurité

- `packages/auth/src/roles/roles.js` : constantes et validation des rôles.
- `packages/auth/src/permissions/permissions.js` : règles d'accès explicites (`canReadStudent`, `canReadClassRoom`) + contrôle de tenant.
- `packages/auth/src/guards/api-guard.js` : erreurs propres (`UNAUTHORIZED`, `FORBIDDEN`, `TENANT_SCOPE_REQUIRED`) et enforcement du scope API.
- `packages/core/src/tenantScope.js` : helper de scoping tenant (`filterByTenant`) réutilisé.

## Règles clés implémentées

- Parent : accès uniquement aux élèves liés.
- Teacher : accès uniquement à ses classes et aux élèves de ses classes.
- School admin / director : accès établissement uniquement.
- Super admin : accès global contrôlé (opt-in côté route).

## Tests

Les tests couvrent :
- accès refusés (parent non lié, cross-tenant),
- scoping tenant pour school admin,
- périmètre teacher,
- accès global super_admin,
- format d'erreur API pour accès non authentifié/interdit.
