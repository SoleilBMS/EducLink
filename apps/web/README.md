# apps/web

Prototype web minimal pour valider le socle d'authentification (issue #2).

## Fonctionnalités disponibles

- `GET /login` : page de connexion
- `POST /login` : création de session (`userId`, `role`, `tenantId`)
- `GET /dashboard` : route protégée
- `POST /logout` : destruction de session
- `GET /forgot-password` : page placeholder
- `GET /reset-password` : endpoint placeholder (`501 not_implemented`)

## Lancer localement

```bash
node apps/web/src/server.js
```

Puis ouvrir `http://localhost:3000/login`.

## Compte de démonstration

- email: `admin@school-a.test`
- mot de passe: `password123`
