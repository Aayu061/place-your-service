# Production Bug Fix Completion Report: AC Master Data Model Update Failure

**Incident / Issue:** AC Master Data Model Update Returns HTTP 400 (`Failed to update AC model: undefined`)  
**Target Resource:** `PATCH /api/v1/ac-models/:id` & `src/pages/AcMasterManagement.tsx`  
**Example Model:** `123V-VERTIS` (ID: `8bfbc460-7fed-4411-b101-b41bf2263389`)  
**Status:** RESOLVED & VERIFIED  
**Date:** 2026-10-10  

---

## 1. Executive Summary

When updating existing AC models (such as `123V-VERTIS`) in the AC Master Data Management page, administrators experienced an immediate failure:
```
Failed to update AC model: undefined
```
The browser network inspector showed a `400 Bad Request` response from `PATCH /api/v1/ac-models/:id`.

Through deep telemetry investigation using live Supabase unified access logs, database state inspection, and source code tracing across the Express API and React frontend, the failure was traced to a critical architectural vulnerability in backend session management combined with improper error message formatting in the service layer.

The issue has been completely fixed, validated through 345 passing automated tests across the backend and frontend suites, and confirmed via typechecking, linting, and full production bundle builds.

---

## 2. Root Cause Analysis

### 2.1 Primary Root Cause: Supabase Client Session Mutability & RLS Rejection
1. In `server/src/services/auth.service.ts`:
   ```typescript
   // BEFORE:
   const supabase = getSupabaseClient();
   const { data, error } = await supabase.auth.signInWithPassword({ email, password });
   ```
2. The `@supabase/supabase-js` client manages internal auth session state in memory. When `supabase.auth.signInWithPassword()` was invoked on the server-wide singleton returned by `getSupabaseClient()`, it mutated the client's internal session token, replacing the unrestricted backend `SUPABASE_SERVICE_ROLE_KEY` privileges with the JWT of whichever user logged in last.
3. Supabase unified access logs revealed that at `2026-10-10T11:04:28.445Z`, a `PATCH /rest/v1/ac_models` call was dispatched with:
   - `request.sb.jwt.authorization.payload.role`: `"authenticated"`
   - `request.sb.auth_user`: `"1b859ea0-1504-4cb3-b63d-344d1fa4e1d6"` (User Aayush Panchal, role: `STAFF`)
4. PostgreSQL Row Level Security (RLS) on `public.ac_models` specifies:
   ```sql
   CREATE POLICY "Allow admin update ac_models" ON public.ac_models
     FOR UPDATE TO authenticated
     USING (public.get_user_role(auth.uid()) = 'ADMIN')
     WITH CHECK (public.get_user_role(auth.uid()) = 'ADMIN');
   ```
5. Because the server singleton had adopted the STAFF user's JWT, `public.get_user_role(auth.uid())` evaluated to `STAFF`, failing the RLS policy. PostgreSQL updated 0 rows and returned an empty result `[]` (HTTP 200 with content length 2).

### 2.2 Secondary Root Cause: Service Layer Error Message Formatting (`undefined`)
1. In `server/src/services/masterData.service.ts`:
   ```typescript
   // BEFORE:
   const { data: updated, error } = await supabase
     .from('ac_models')
     .update(updates)
     .eq('id', modelId)
     .select('*, ac_brands(name, code)')
     .maybeSingle();

   if (error || !updated) {
     throw new BadRequestError(`Failed to update AC model: ${error?.message}`);
   }
   ```
2. When PostgREST matched 0 rows due to RLS, Supabase JS returned `{ data: null, error: null }`.
3. The condition `if (error || !updated)` evaluated to true because `!updated` was true. However, because `error` was `null`, `${error?.message}` evaluated to `undefined`.
4. This resulted in the error message string:
   `"Failed to update AC model: undefined"`.
5. The Express error handler caught the `BadRequestError` and emitted:
   `{ success: false, error: { code: "BAD_REQUEST", message: "Failed to update AC model: undefined" } }`.

### 2.3 Tertiary Cause: Embedded Join Mutations in Update Queries
1. Chaining `.select('*, ac_brands(name, code)')` on `.update(...)` queries is fragile in PostgREST and couples update row counting with relation serialization.
2. In the event of schema joins or missing relation cache, the update query could return null even if row update was attempted.

---

## 3. Changes Implemented

### 3.1 Server Architectural Isolation (`server/src/lib/supabase.ts`)
- Added `createAuthClient()`: creates a dedicated, ephemeral Supabase client instance with auto-refresh disabled and no session persistence, exclusively for credential verification (`signInWithPassword`).
- Enforced permanent `service_role` authorization headers on `getSupabaseClient()` so the singleton backend client can never lose its unrestricted administrative privileges.

### 3.2 Authentication Service (`server/src/services/auth.service.ts`)
- Refactored `authService.login()` to authenticate credentials via `createAuthClient()`.
- The singleton `getSupabaseClient()` is never touched or mutated by user logins.

### 3.3 Master Data Service (`server/src/services/masterData.service.ts`)
- Refactored `updateModel()` and `updateModelStatus()`:
  - Updates target table directly returning only `select('id').maybeSingle()`.
  - Disambiguated error branches:
    - If `error`: throws `BadRequestError(`Failed to update AC model: ${error.message}`)`
    - If `!updated`: throws `NotFoundError(`AC model with ID '${modelId}' not found`)`
  - Re-fetches the authoritative, joined record via `this.getModelById(modelId)`.
- Applied identical robust patterns to `updateBrand()`, `updateBrandStatus()`, `updateVariant()`, and `updateVariantStatus()`.
- Guaranteed that `${error?.message}` is never interpolated without an explicit fallback, eliminating any occurrence of `"undefined"` in error messages.

### 3.4 Frontend Modal & State Management (`src/pages/AcMasterManagement.tsx`)
- Updated `handleSaveModel`:
  - On update success, uses the authoritative server response (`res.model`) to immediately update the local model cards without waiting for a re-fetch.
  - Form modal cleanly closes and success toast is displayed.
  - On error, catches `ApiError` or standard `Error` and displays the exact server error message.
  - The modal remains open and entered form values are preserved upon failure, enabling the user to correct input without losing work.
  - Prevented duplicate form submissions via `isSubmittingModel` state.

---

## 4. Verification & Testing

### 4.1 Automated Backend Route & Service Regression Tests
Ran `npm test` in `server/`:
- Added 7 dedicated regression tests in `server/tests/masterDataRoutes.test.ts`:
  - `PATCH /api/v1/ac-models/:id` updates specs and returns 200 with updated model
  - Rejects duplicate model numbers with `409 CONFLICT`
  - Returns `404 NOT_FOUND` for non-existent model ID
  - Validates UUID format, positive capacity, and non-empty payload with `422 VALIDATION_ERROR`
  - Returns clear database error message instead of `undefined` on query errors
  - Rejects unauthorized `STAFF` role with `403 FORBIDDEN`
  - Allows `ADMIN` to toggle model active status via `/api/v1/ac-models/:id/status`
- Added regression test in `server/tests/authRoutes.test.ts` verifying `login` uses `createAuthClient` and protects singleton client immutability.
- **Results:** **20 test files passed (100%), 227 tests passed (100%)**.

### 4.2 Automated Frontend UI & Component Regression Tests
Ran `npm test` in root:
- Added 2 dedicated regression tests in `src/tests/acMasterAndAssetUpgrade.test.tsx`:
  - Admin edits existing AC model specs successfully and updates model card with authoritative response
  - Admin edit model failure preserves form values and displays actual server error instead of undefined
- **Results:** **15 test files passed (100%), 118 tests passed (100%)**.

### 4.3 TypeScript Typechecking & Code Quality
- Root frontend: `npm run typecheck` (`tsc --noEmit`) -> **Passed with 0 errors**.
- Server backend: `npm run typecheck` (`tsc --noEmit`) -> **Passed with 0 errors**.
- Frontend linting: `npm run lint` (`eslint .`) -> **Passed with 0 warnings/errors**.
- Server linting: `npm run lint` (`tsc --noEmit`) -> **Passed with 0 warnings/errors**.

### 4.4 Production Build Verification
- Root frontend build: `npm run build` (`tsc -b && vite build`) -> **Passed (dist generated in 3.80s)**.
- Server backend build: `npm run build` (`tsc`) -> **Passed (dist generated)**.

---

## 5. Architectural Integrity & Safety Guarantees

1. **Parent-Model-Plus-Variants Protection:** The database model hierarchy (`ac_brands` -> `ac_models` -> `ac_model_variants`) and asset foreign key relationships (`ac_assets.model_id`) were fully preserved without schema or relation breaks.
2. **Zero Spec Fabrication:** Manufacturer technical attributes remain strictly enforced by validation schemas.
3. **No Unrelated Code Modifications:** All changes were strictly scoped to authentication client isolation, master data service error handling, and AC master UI error preservation.
