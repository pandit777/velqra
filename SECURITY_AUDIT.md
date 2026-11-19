# VELQRA Security Audit

Date: 2026-11-18
Branch: `security/velqra-complete-hardening`

## Scope

Inspected frontend, backend, Supabase migrations, deployment configuration, seed scripts, routes, payment callbacks, uploads, and package manifests.

## Findings and remediations

| Severity | Area | Finding | Remediation / status |
|---|---|---|---|
| High | Product API | Public product detail/list routes could expose inactive records; detail query did not filter active status. | List/detail routes now require `is_active = true`; list is bounded to 200 rows. |
| Medium | HTTP headers | Backend lacked Helmet, CSP, request IDs, and request logging. | Added Helmet, CSP, HSTS in production, permissions policy, X-Request-ID, structured request completion logs. |
| Medium | Health | `/health` did not expose application/database status separately. | Split `application` and `database` health fields. |
| Medium | Operations | Seed and admin scripts could be run destructively in production. | Added explicit production confirmation gates. |
| Medium | SEO | Duplicate/conflicting social metadata and stale store messaging remained in `index.html`. | Consolidated Open Graph/Twitter image and corrected skincare messaging. |
| High | Inventory | Checkout and payment verification previously used separate reads/writes, allowing overselling and incorrect COD stock. | Orders now reserve stock atomically with order creation; payment retries reserve atomically; cancellation/payment failure releases once. Apply and validate `20261118000000_atomic_order_inventory.sql` before deploying the backend. |
| Medium | Order confirmation | Replaying a COD confirmation JWT could create duplicate orders; OTP verification could also race. | OTP is consumed once, confirmation JWT IDs are persisted and consumed in the order transaction, and COD orders are idempotent. Migration application is required before deployment. |
| Medium | Database | Private tables had RLS enabled but policy coverage is incomplete for direct authenticated access. | Existing schema keeps private tables protected by deny-by-default; owner/admin policies require review in a test database. |
| Medium | Uploads | Review photos are stored on Render's ephemeral filesystem. | Known limitation: migrate to Supabase Storage/private bucket before relying on persistent uploads. |
| Medium | Auth | JWT expiration and issuer/audience are not consistently bounded. | Manual follow-up required; do not roll without compatibility testing. |
| Low | Dependencies | No package vulnerabilities were reported before/after. | Keep locked dependencies patched and repeat `npm audit`. |
| Medium | Screenshots | Browser screenshots cannot be cryptographically prevented. | Added route-aware watermarking, focus/visibility blur, print blocking, and shortcut/key deterrence for admin, orders, tracking, and checkout. This is best-effort only. |
| Deployment prerequisite | Database migration | Atomic reservation, one-time confirmation tokens, and idempotent order creation require database functions/columns. | Apply `frontend/supabase/migrations/20261118000000_atomic_order_inventory.sql` and validate checkout, payment retry/failure, cancellation, and replay in a test database before deploying this backend. |
| Not fixed | Upload persistence | Review/product uploads may use local or configured object storage. | Supabase Storage setup and actual-file signature/re-encoding validation remain owner/setup work. |

## Route and service findings

- Active API entry point: `backend/index.js`; route modules in `backend/routes/` are legacy/unmounted in the observed entry point.
- Authentication: JWT Bearer middleware protects private routes.
- Admin: independent database lookup and initial-password check are used in `requireAdmin`.
- Payment: callback reverse-hash validation and server-side PayU transaction verification are present.
- Carts and orders: server-side price, stock, quantity, and delivery validation are present.
- Uploads: MIME allowlists and 5 MB/50 MB limits are present; stored file signatures and re-encoding remain manual follow-ups.

## Dependency audit

| Package area | Before | After |
|---|---|---|
| Backend | 0 vulnerabilities | 0 vulnerabilities |
| Frontend | 0 vulnerabilities | 0 vulnerabilities |
| Root | 0 vulnerabilities | 0 vulnerabilities |

## Not executed

- No Supabase migration was executed or tested against a database in this workspace.
- No live PayU, SMS, refund, or payment callback was triggered.
- No production secrets or deployment variables were changed.
