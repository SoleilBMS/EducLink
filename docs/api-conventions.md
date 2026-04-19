# Conventions API — EducLink

## Principes
- Toutes les routes métier sont préfixées par `/api/v1`.
- Toute route protégée doit extraire le contexte: `user_id`, `tenant_id`, `role`.
- Toute requête DB doit être scoppée par `tenant_id` sauf cas `super_admin` explicitement autorisé.

## Format des réponses

### Succès
```json
{
  "data": {},
  "meta": {
    "request_id": "uuid"
  }
}
```

### Erreur
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission"
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

## Codes d'erreur recommandés
- `UNAUTHORIZED`
- `FORBIDDEN`
- `TENANT_SCOPE_REQUIRED`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
