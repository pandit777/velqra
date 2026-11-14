# AteliMarket

AteliMarket is a React/Vite storefront backed by an Express API and Supabase.

## Stack

- Frontend: React 18, Vite, React Router, Tailwind CSS, Axios
- Backend: Node.js, Express, Supabase PostgreSQL, JWT, bcrypt, Multer
- Payments and verification delivery: PayU, Fast2SMS, and Resend (configured with backend environment variables)

## Local development

Use Node.js 18 or 20. Install and run each app in a separate terminal:

```powershell
cd backend
npm ci
npm run dev
```

```powershell
cd frontend
npm ci
npm run dev
```

Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and a strong `JWT_SECRET`. Registration verification codes are sent only by SMS; configure a valid `FAST2SMS_API_KEY` for live mobile codes. With `SMS_TEST_MODE=true`, numbers listed in `SMS_TEST_NUMBERS` still use live Fast2SMS; other numbers receive a local test code. Set `SMS_TEST_MODE=false` to send live SMS to all valid numbers. Test codes are never returned when `NODE_ENV=production`.
The backend creates the fixed `admin` login on first startup using `INITIAL_ADMIN_PASSWORD` from backend environment secrets (minimum 16 characters). The storefront stays locked and admin API operations are denied until that account changes its password (minimum 12 characters). For databases that still use the old bootstrap password, set `LEGACY_ADMIN_PASSWORD` for one startup to rotate it to `INITIAL_ADMIN_PASSWORD`, then remove the legacy variable. The optional `node admin-seed.js` helper uses `INITIAL_ADMIN_PASSWORD` and only creates a missing account.

Login and registration open as dedicated pages. Registration requires a valid `@gmail.com` address and verifies ownership of the mobile number using one SMS code. The email address remains part of the account details but does not receive a verification code. Accounts are created after the SMS code is entered; passwords are hashed before pending registration data is stored.
Forgot-password recovery sends a time-limited OTP to the registered mobile number; the verified reset session is also time-limited and can be used once.

Delivered orders have a downloadable PDF delivery receipt in My Orders and Order Tracking. It is generated from the saved order details when requested; this receipt does not include GST/tax calculations.
Checkout stores first- and last-touch UTM campaign fields with each order. Meta Purchase events are sent server-side for COD orders and successful PayU payments only when the customer opts in at checkout. Configure `META_PIXEL_ID` and `META_ACCESS_TOKEN` as backend hosting secrets; never add the access token to frontend environment variables. `META_TEST_EVENT_CODE` is optional and should be removed after testing.
The storefront catalog includes product search and a simple two-option category filter: All or Face Wash. On desktop and mobile, search opens from the header icon, while the category buttons remain directly below the banner.
The storefront interface supports English, Hindi, Punjabi, Telugu, and Bengali. Customers can display prices in INR, USD, EUR, GBP, AED, CAD, AUD, SGD, JPY, or CNY; their language and currency preferences are saved in the browser. Foreign-currency display uses Frankfurter reference exchange rates, cached locally and refreshed every six hours, so rates can be delayed or temporarily unavailable. Unavailable conversions are shown explicitly.
Currency selection is display-only: product and order amounts, checkout totals, payment processing, and downloadable receipts remain in INR. Product names and descriptions remain in the language supplied by the store.

The frontend defaults to the local API at `http://localhost:5000/api`. Set `VITE_API_URL` (and, if needed, `VITE_AUTH_URL`) in `frontend/.env` to override it. Frontend Supabase variables are only needed for features that use the Supabase client directly; never put the backend service-role key in the frontend.

## Security notes

- Keep Supabase service-role, JWT, Fast2SMS, Resend, and PayU salt values only in backend/hosting secrets. Never use a `VITE_` variable for a private credential; browser bundles and requests are inspectable.
- Keep `META_ACCESS_TOKEN` in backend/hosting secrets. Meta matching identifiers are SHA-256 hashed server-side, and no Meta Purchase event is sent unless the customer opts in.
- The Supabase anon key and PayU merchant key/payment hash are public by design. Protect Supabase data with Row Level Security and keep all price, authorization, and payment verification decisions on the backend.
- PayU callback hashes alone do not mark an order paid: the backend also checks PayU's Verify Payment API for the matching captured transaction and amount. Admin order lists omit online orders until that check succeeds.
- Browser developer tools will always show the current user's own requests and session token. Client-side code cannot hide those from that user; frontend error handlers must not log request objects or authorization headers.
- Backend request limits are process-local. If running multiple backend instances, configure a shared rate-limit store before scaling so SMS and login throttles apply across instances.
- OTP columns in Supabase must support the 64-character SHA-256 hashes now stored by the backend.
- If a private key was ever placed in a frontend environment variable or shared in a build, revoke/rotate it with its provider. Removing it from the source alone does not invalidate the old key.
- The initial admin password is a known bootstrap credential, not a production secret. Change it immediately on first login; the storefront remains unavailable until it is changed.
- Rotate any provider credentials that were previously present in `backend/.env.example`; example files should contain placeholders only.

## Deployment

- Render uses `backend/render.yaml` for both the API and static frontend. The frontend rewrite serves `index.html` for client-side routes such as `/product/:id`, so direct navigation and refresh work. Provide the values marked `sync: false` in the Render dashboard, including Supabase, JWT, Resend, sender email, Fast2SMS, and PayU settings; do not commit credentials.
- To test the local frontend against the hosted API, temporarily add `http://localhost:10000` to the backend's `ALLOWED_ORIGINS` setting in Render. Remove it after testing.
- Deploy `frontend` as the Vercel project root. Vercel builds to `dist` and rewrites client-side routes to `index.html`.
- Set the Vercel build-time variable `VITE_API_URL` to the deployed backend's `/api` URL if it differs from the configured default.
- Run `supabase/schema.sql` in the Supabase SQL Editor to create the app's tables, indexes, and policies. It is safe to run on an existing database; existing rows are preserved.
