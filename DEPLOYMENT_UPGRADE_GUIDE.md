# Deployment Upgrade Guide

## Runtime

- Node 24 LTS is the required runtime.
- Render must use Node 24 and `npm ci && npm run build` for frontend; backend uses `npm ci && npm start`.
- Frontend Node requirements are also declared in `frontend/package.json`.

## Pre-deployment

1. Review the diff and run `npm ci`, audits, tests, lint, and builds.
2. Apply migrations only to a disposable/test Supabase database.
3. Review `20261117000000_add_security_hardening.sql`; it is not automatically executed.
4. Configure placeholders in `.env.example` as Render/Vercel environment variables.
5. Verify the public Supabase anon key can only access public products/reviews under RLS.
6. Validate PayU callbacks in PayU sandbox before any live rollout.

## Environment setup

- Backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`.
- Payments: `PAYU_MERCHANT_KEY`, `PAYU_SALT`, `PAYU_BASE_URL`, success/failure callback URLs.
- SMS/email: provider credentials and test-mode variables.
- Render: never set secret values in `render.yaml`.

## Rollback

- Revert or redeploy the previous Git commit.
- Do not roll back SQL unless a migration is proven reversible and owner-approved.
- If migrations were applied, keep additive columns and RPC; disable only application feature flags when available.
