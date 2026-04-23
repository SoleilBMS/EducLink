# Observabilité & logging structuré (issue #50)

## Format retenu

EducLink utilise maintenant un logger applicatif structuré avec les champs suivants (quand pertinents) :

- `timestamp`
- `level` (`debug|info|warn|error`)
- `message`
- `module`
- `requestId` (corrélation HTTP)
- `tenantId`
- `userId` / `actor`
- `error` (code, status, message tronqué)

Le format de sortie est :
- `pretty` par défaut en local (lisible humainement)
- `json` recommandé en staging/production (`LOG_FORMAT=json`)

Le niveau est pilotable via `LOG_LEVEL`.

## Points intégrés

- Initialisation serveur (`web.server`) avec mode de persistance et provider IA par défaut.
- Entrée/sortie des requêtes HTTP (`web.http`) avec :
  - corrélation par `x-request-id` (propagé si présent, généré sinon)
  - `statusCode` + `durationMs` en fin de requête
- Auth :
  - `Authentication failed`
  - `Authentication succeeded`
  - `Logout succeeded`
- IA :
  - succès de génération de brouillon
  - échec de génération avec contexte d’erreur
- Audit :
  - accès refusé
  - récupération réussie des logs audit
- Formulaires enseignant (attendance / lesson log / homework) : warning en cas d’échec de persistance.

## Confidentialité / données sensibles

Le logger applique une sanitation de contexte :
- masquage automatique des clés sensibles (`password`, `token`, `authorization`, `cookie`, `secret`, `apiKey`)
- exclusion des valeurs `undefined` et fonctions
- pas de dump des payloads complets de requêtes

## Limites actuelles

- Pas de backend de monitoring externe dans cette PR (volontaire).
- Tous les endpoints n’ont pas encore un log métier dédié ; priorité donnée aux flux critiques auth/HTTP/IA/audit.
- Les logs restent applicatifs (pas encore de métriques/trace distribuée).
