# Sanctum dashboard auth, separate from device auth

Dashboard/management/query endpoints require a Sanctum bearer token from `POST /v1/auth/login`
(demo seeder: `admin@weather.local` / `admin123`); ingestion keeps its own mechanism
(Bearer `api_key` + `device.auth`, hash sha256, per-device rate limit). Unauthenticated
dashboard calls return the standard error envelope with `code: unauthenticated` (401).

## Considered Options

- Leave dashboard open ("review scope"): zero friction for the reviewer, but fails spec §E
  (device vs user auth must differ) and teaches the wrong default.
- One shared secret for devices and users: simpler, but device keys are long-lived,
  unscoped, and stored on hardware in the field — a leaked firmware key must never
  grant dashboard write access, and user passwords must never ride on ingest paths.
- Sanctum tokens for users (chosen): expiry/revocation per token, `auth:sanctum` on
management/query only, frontend login page + `Authorization` header + auto-redirect
   on 401. Cost: reviewer must log in once (creds in README); accepted as spec-compliant.

Unknown device credentials return the same `unauthenticated` code (anti-enumeration,
intentional).
