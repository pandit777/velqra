# Security Fixes

## Implemented

- Added Helmet security headers and production HSTS/CSP configuration.
- Added per-request ID response and structured HTTP request completion logs.
- Filtered public product list/detail responses to active products and bounded list results.
- Split `/health` application/database status fields.
- Added explicit production confirmation gates to seed and admin provisioning scripts.
- Added Node 24 declarations and aligned package engines.
- Removed real-looking Supabase/project values from `.env.example`.
- Removed duplicate/conflicting Open Graph and Twitter metadata.
- Restricted robots indexing of private/account routes.
- Added an additive migration for order idempotency and atomic stock reservation; production SQL execution was reported successful on 2026-11-18, but database objects and live order flows were not independently verified.
- Applied site-wide best-effort focus/visibility blur, print blocking, and supported keyboard/context-menu deterrence without identity watermarks. Browser code cannot block OS screenshots or external cameras.

## Verification

- `npm audit` backend/root: zero vulnerabilities.
- `npm ci`, build, lint, test, and final frontend audit will be recorded after validation.
- Backend syntax checks passed.
- Frontend `npm run build` passed.
- Backend test script ran with 0 discovered tests.
- Backend and frontend `npm ci` passed; npm audits reported 0 vulnerabilities.
