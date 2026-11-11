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
cd atelimarket-frontend
npm ci
npm run dev
```

Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and a strong `JWT_SECRET`. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` sender for registration email codes, and configure Fast2SMS for live mobile codes. Local development can use `SMS_TEST_MODE=true` to display test email/SMS codes; test codes are never returned when `NODE_ENV=production`.
For one-time admin provisioning with `node admin-seed.js`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` locally; the script never prints the password and will update an existing admin instead of deleting it.

Registration requires independently verified email and mobile codes. Accounts are created only after both codes are entered; passwords are hashed before pending registration data is stored.

The frontend defaults to the local API at `http://localhost:5000/api`. Set `VITE_API_URL` (and, if needed, `VITE_AUTH_URL`) in `atelimarket-frontend/.env` to override it. Frontend Supabase variables are only needed for features that use the Supabase client directly; never put the backend service-role key in the frontend.

## Security notes

- Keep Supabase service-role, JWT, Fast2SMS, Resend, and PayU salt values only in backend/hosting secrets. Never use a `VITE_` variable for a private credential; browser bundles and requests are inspectable.
- The Supabase anon key and PayU merchant key/payment hash are public by design. Protect Supabase data with Row Level Security and keep all price, authorization, and payment verification decisions on the backend.
- Browser developer tools will always show the current user's own requests and session token. Client-side code cannot hide those from that user; frontend error handlers must not log request objects or authorization headers.
- Backend request limits are process-local. If running multiple backend instances, configure a shared rate-limit store before scaling so SMS and login throttles apply across instances.
- OTP columns in Supabase must support the 64-character SHA-256 hashes now stored by the backend.
- If a private key was ever placed in a frontend environment variable or shared in a build, revoke/rotate it with its provider. Removing it from the source alone does not invalidate the old key.
- Reset any admin password that may have appeared in earlier source history; use the environment-based admin seed script and rotate the credential even after removing it from the current files.

## Deployment

- Render uses `backend/render.yaml`. Provide the values marked `sync: false` in the Render dashboard, including Supabase, JWT, Resend, sender email, Fast2SMS, and PayU settings; do not commit credentials.
- Deploy `atelimarket-frontend` as the Vercel project root. Vercel builds to `dist` and rewrites client-side routes to `index.html`.
- Set the Vercel build-time variable `VITE_API_URL` to the deployed backend's `/api` URL if it differs from the configured default.
- Apply the SQL migration in `supabase/migrations` to the Supabase project before using the product table policies.
