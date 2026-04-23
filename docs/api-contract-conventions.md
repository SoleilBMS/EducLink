# API contract conventions (v0.1 hardening)

This document defines the incremental convention introduced for issue #49.

## Success responses

All JSON API success responses should follow:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "request_id": "uuid"
  }
}
```

- `success` is always `true`.
- `data` contains the business payload.
- `meta.request_id` is generated for tracing.

## Error responses

All JSON API errors should follow:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

- `success` is always `false`.
- `error.code` is stable and machine-readable.
- `error.message` is concise and actionable.
- `error.details` is optional.

## Standard error classes

Centralized helpers are in `apps/web/src/modules/error-utils.js`:

- validation error → `422 VALIDATION_ERROR`
- forbidden error → `403 FORBIDDEN`
- not found error → `404 NOT_FOUND`
- internal error → `500 INTERNAL_ERROR`

## Route-level conventions

For refactored routes, use reusable helpers from `apps/web/src/routes/error-helpers.js`:

- `ensureAuthorized(auth)` for authz checks
- `handleRouteError(sendApiError, response, error, fallback)` for coherent fallback mapping

This keeps handlers focused on domain logic and avoids repeating status/code mapping.

## Scope of current rollout

The convention is now applied on representative modules:

- students
- parents
- teachers
- attendance
- shared HTTP response layer used by the rest of API endpoints

It is designed for progressive adoption in remaining modules without product behavior changes.
