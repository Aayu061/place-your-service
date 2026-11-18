# Place Your Service (PYS) — Production Deployment Manifest

**Target Architecture:**
- **Frontend:** Vercel (`https://place-your-service.vercel.app`)
- **Backend API:** Render (`https://place-your-service-api.onrender.com/api/v1`)
- **Database / Auth:** Supabase (`https://jvccvdxfilzlncbgiplk.supabase.co`)
- **Email Delivery:** Resend (`Extreme Sales & Services <onboarding@resend.dev>`)
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
- `RATE_LIMIT_WINDOW_MS`: `60000`
- `RATE_LIMIT_MAX`: `100`

## Build & Test Status
- Frontend TypeScript & Vite: PASSED (0 errors)
- Backend TypeScript: PASSED (0 errors)
- Unit & Integration Test Suite: PASSED (38 test files, 403 tests)
- Last Deployment Trigger: 2026-11-15T21:35:00+05:30
