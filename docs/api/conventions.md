# API conventions (Phase 1)
- JSON only. Errors: `{error:{code,message,details}}` with request-id header `x-request-id`.
- Auth (Phase 2+): `Authorization: Bearer <jwt>`.
- Health: `GET /health`, `GET /version`.
