# Place Your Service (PYS) — Production Deployment Manifest

**Target Architecture:**
- **Frontend:** Vercel (`https://place-your-service.vercel.app`)
- **Backend API:** Render (`https://place-your-service-api.onrender.com/api/v1`)
- **Database / Auth:** Supabase (`https://jvccvdxfilzlncbgiplk.supabase.co`)
- **Email Delivery:** Gmail SMTP in production (`EMAIL_TRANSPORT=gmail`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`; about 500 emails a day). Resend is the fallback transport when Gmail is not configured.
- **Partner Storefront Integration:** Extreme Sales & Services (`https://extreme-sales-services.vercel.app` / `https://extreme-sales-services-gh7s.onrender.com`)

## Environment Variable Alignment Checklist

### Vercel (`place-your-service`)
- `VITE_SUPABASE_URL`: `https://jvccvdxfilzlncbgiplk.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: Configured in Vercel (public anon key)
- `VITE_ESS_STOREFRONT_URL`: `https://extreme-sales-services.vercel.app`
- `VITE_API_BASE_URL`: `https://place-your-service-api.onrender.com`

### Render (`place-your-service-api`)
- `CORS_ORIGIN`: `https://place-your-service.vercel.app,https://extreme-sales-services-gh7s.onrender.com,https://extreme-sales-services.vercel.app`
- `SUPABASE_URL`: `https://jvccvdxfilzlncbgiplk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Configured
- `M2M_API_KEY`: Configured in Render (secret — never write the value here)
- `ESS_WEBHOOK_URL`: `https://extreme-sales-services-gh7s.onrender.com/api/webhooks/pys`
- `ESS_WEBHOOK_SECRET`: Configured in Render (secret — never write the value here)
- `RESEND_API_KEY`: Configured
- `RESEND_FROM_EMAIL`: `Extreme Sales & Services <onboarding@resend.dev>`
- `RESEND_REPLY_TO`: `extremess0121@gmail.com`
- `RATE_LIMIT_WINDOW_MS`: `900000` (15 minutes, as in `render.yaml`)
- `RATE_LIMIT_MAX`: `100` per address. Signed ESS calls (`/api/v1/ess`) have their own limit of 10x this.
- `EMAIL_TRANSPORT`: `gmail`; `GMAIL_USER`, `GMAIL_APP_PASSWORD`: configured (secrets)
- `INTEGRATION_SECRET_KEY`: configured (secret). It has three jobs: it seals the ESS integration keys, it is the key
  for hashing customer sign-in codes, and live sign-in codes stop working when it changes. Changing it means
  re-sealing the integration keys; plan it, never rotate it casually.
- `ESS_REVALIDATE_URL`: the ESS website's `/api/revalidate` address
- `PORTAL_ENABLED`: customer website accounts. **Off unless exactly `true`.** See below.

## Customer website accounts (S11 / S11b)
Contract: `DOCS/architecture/S11b-PORTAL-API-CONTRACT.md`. Rollback scripts: `supabase/rollback/`.

Release order (each step safe on its own; accounts stay off until the last one):
1. Run the migrations on live, in order, in the Supabase SQL editor: `20261125030000_customer_portal_auth.sql`,
   `20261127000000_customer_portal_hardening.sql`, `20261128000000_customer_portal_v2.sql`. Without them the
   dashboard's website-access card and the portal routes fail.
2. Deploy PYS (Render). With `PORTAL_ENABLED` unset, every portal route answers 503 `PORTAL_OFF`.
3. Deploy the ESS website (Vercel). It shows "coming soon" while PYS says off (or does not have the routes).
4. In Render, set `PORTAL_ENABLED=true` (a restart, no code change). Switch on website access for the owner's own
   customer record first and sign in once before switching it on for anyone else.

To switch accounts off quickly: set `PORTAL_ENABLED` to anything other than `true`. Full removal: revert the code,
then run `supabase/rollback/20261127_customer_portal_rollback.sql` (it also undoes the v2 migration).

Key rotation (ESS integration key): create the new key in PYS (old one becomes RETIRING), update
`PYS_INTEGRATION_KEY_ID` / `PYS_INTEGRATION_SECRET` on Vercel and redeploy ESS, then retire the old key. Note that
the ESS secret is also the salt of the visitor fingerprint, so per-visitor limits start fresh after a rotation.

## Build & Test Status
- Frontend TypeScript & Vite: PASSED (0 errors)
- Backend TypeScript: PASSED (0 errors)
- Unit & Integration Test Suite: PASSED (38 test files, 403 tests)
- Last Deployment Trigger: 2026-11-15T21:35:00+05:30
