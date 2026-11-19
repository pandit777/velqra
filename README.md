# VELQRA

VELQRA is a React/Vite storefront with an Express/Supabase backend.

## Requirements

- Node.js 24 LTS
- npm 11 or newer

## Install and validate

```powershell
cd backend
npm ci
npm test
npm audit
npm ls --depth=0

cd ../frontend
npm ci
npm run build
npm audit
npm ls --depth=0
```

Copy `backend/.env.example` and `frontend/.env.example` to local `.env` files and replace placeholders. Never commit real credentials.

## Deployment

Review [DEPLOYMENT_UPGRADE_GUIDE.md](DEPLOYMENT_UPGRADE_GUIDE.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md), and [SECURITY_FIXES.md](SECURITY_FIXES.md) before deployment. Supabase migrations are not executed automatically.
