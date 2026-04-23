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
- `packages/core/src/tenantScope.js` : helpers de scoping tenant (`filterByTenant`, `resolveTenantScope`) réutilisés.

## Règles clés implémentées

- `resolveTenantScope` impose désormais un `tenantId` explicite pour `super_admin` sur les routes tenant-scopées, et bloque tout override cross-tenant pour les rôles établissement.

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

## Durcissement auth/session (issue #48)

Les mécanismes de session ont été renforcés sans changer le parcours produit principal :

- **Sessions bornées dans le temps** : chaque session possède désormais une expiration serveur (`expiresAt`) avec TTL fixe (12h).
- **Validation de session côté guard** : `requireAuth` et `authorizeApiRequest` rejettent les sessions incohérentes (rôle invalide, userId absent, tenant manquant hors `super_admin`).
- **Protection anti-session fixation** : un ancien `sessionId` fourni au moment du login est invalidé avant émission de la nouvelle session.
- **Cookies de session plus robustes** : cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` aligné sur la durée de vie serveur; suppression explicite du cookie au logout et en cas de session expirée/stale côté dashboard.
- **Robustesse parsing cookie** : la lecture des cookies tolère mieux les valeurs corrompues/mal encodées.

Impact attendu :

- les sessions invalides/expirées sont rejetées plus tôt,
- le cycle login/logout est plus fiable,
- l’isolation RBAC/tenant existante reste inchangée et mieux protégée par des vérifications d’intégrité de session.
