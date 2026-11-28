# S11b Customer Portal v2: API contract (PYS ↔ ESS)

The **single source of truth** for both sides. The same file is kept in both repos:
PYS `DOCS/architecture/S11b-PORTAL-API-CONTRACT.md` and ESS `docs/S11b-API-CONTRACT.md`. Change both together.

All routes are signed ESS routes (scope `portal:access`) under `/api/v1/ess/portal`, behind the `PORTAL_ENABLED`
switch. Every route except `/status`, `/code` and `/sign-in` needs the header `X-PYS-Customer-Session`; with no
session or an ended one → **401** `SESSION_ENDED`. The customer id comes **only** from the session.

**Order of checks** (every route): signature → kill switch → session. An unsigned call gets 401 whether accounts are
on or off; a signed call while accounts are off gets **503** `PORTAL_OFF`. ESS must not retry `PORTAL_OFF` or any 429.

**Ownership rule:** any id or number that does not belong to the session's customer → **404** `NOT_FOUND`, exactly
the same answer as a truly missing record:
`{ success: false, error: { code: 'NOT_FOUND', message: 'We could not find that.', details: { portal: true } } }`.
`details.portal` tells ESS the 404 came from a portal route; a 404 without it means the PYS it reached does not have
the route (an older PYS), which ESS shows as "coming soon". All answers use `Cache-Control: no-store` and the standard
`{ success: true, data }` envelope. Unexpected 500s carry only `Something went wrong on our side. Reference: <id>`.

Dates are `YYYY-MM-DD` (India dates), timestamps are ISO strings, amounts are numbers in rupees (2 decimals). The enum
values below are the raw PYS codes; **ESS turns them into words** (e.g. `SPLIT` → "Split AC").

## Signing
Canonical string: `timestamp \n nonce \n METHOD \n pathWithQuery \n sha256hex(rawBody)`; signature = hex
HMAC-SHA256 with the integration secret. Headers `X-PYS-Key-Id`, `X-PYS-Timestamp`, `X-PYS-Nonce`,
`X-PYS-Signature`; ±300 s clock window; each nonce works once. `X-PYS-Customer-Session` is not part of the signed
string (it is a bearer token over TLS). A fixed example both sides test against: PYS
`server/tests/integrationSignatureVector.test.ts`, ESS `web/tests/signature-vector.test.ts`.

## Sign-in (S11, unchanged shapes)
- `GET /status` → `{ enabled: true }`.
- `POST /code` body `{ email, clientIpHash }` → always **202** `{ sent: true }`, in the same time whether or not the
  email has an account: PYS answers first, then looks up the account and sends the email. The code goes to the email
  stored on the customer, matched exactly (no wildcards). `clientIpHash` is 64 lowercase hex (as for `/track`); a
  missing or malformed one shares one strict bucket. Limits: 10 code requests per visitor per hour (429
  `RATE_LIMITED`), 3 codes per account per 15 minutes (quiet). A code whose email failed does not count.
- `POST /sign-in` body `{ email, code, clientIpHash }` → `{ token, expiresAt }` or 401 `CODE_REJECTED` (same answer
  for every failure, including a locked account). 20 wrong codes per visitor per hour → 429; 10 wrong codes per
  account in 24 hours lock sign-in for 24 hours (staff clear it by switching access off and on).
- `POST /sign-out` (optional session) → `{ signedOut: true }`. `GET /me` → the v1 overview.
- Sessions: 30 days at most, 7 days idle. Codes: 10 minutes, 5 tries. Old codes (7 days) and ended sessions
  (30 days) are removed by housekeeping.

## Shared shapes
```ts
type CustomerStatus = { code: string; label: string; step: number; tone: string }; // as in /me today
type AcRef = { id: string; label: string };            // label e.g. "Daikin 1.5 ton · Living room" (built in PYS)
type Coverage = 'UNDER_WARRANTY' | 'AMC_COVERED' | 'EXPIRING_SOON' | 'OUT_OF_WARRANTY' | 'EXPIRED' | null;
```

## GET /overview
```ts
{
  customer: { name: string; companyName: string | null; email: string | null; phone: string | null; city: string | null };
  nextVisit: { date: string; startTime: string | null; technicianFirstName: string | null; requestNumber: string | null; ac: AcRef | null } | null;
  amc: { id: string; contractNumber: string; plan: string | null; endDate: string; totalVisits: number | null; visitsUsed: number; visitsLeft: number | null } | null; // the active contract ending soonest
  billing: { amountDue: number; unpaidBills: number };
  openRequests: number;
  alerts: Array<{ kind: 'AMC_ENDING' | 'AMC_EXPIRED' | 'WARRANTY_ENDING' | 'RECOMMENDATION' | 'BILL_DUE'; text: string; link: { kind: 'amc' | 'ac' | 'bill' | 'report'; id: string } | null }>;
}
```
- `AMC_ENDING`: an active contract ending within 30 days. `WARRANTY_ENDING`: within 30 days.
- `RECOMMENDATION`: an unresolved `service_report_items` row with `recommended_action` from the last 180 days (max 3).
- `BILL_DUE`: balance > 0.

## GET /acs
```ts
{ acs: Array<{ id: string; label: string; brand: string | null; model: string | null; type: string | null; tons: number | null; room: string | null; floor: string | null;
               coverage: Coverage; serialLast4: string | null; lastServiceDate: string | null; openRecommendations: number }> }
```
`serialLast4`: the last 4 characters of the indoor serial, else the serial, else the outdoor serial.

## GET /acs/:id
```ts
{
  ac: { id: string; label: string; brand: string | null; model: string | null; type: string | null; tons: number | null; technology: string | null; starRating: string | null;
        room: string | null; floor: string | null; installedOn: string | null; purchasedOn: string | null;
        serials: { indoor: string | null; outdoor: string | null; unit: string | null };   // FULL numbers (owner decision D1)
        condition: string | null; site: { name: string; address: string } | null;
        warranty: { status: Coverage; start: string | null; end: string | null; visitsTotal: number | null; visitsUsed: number | null } };
  amc: Array<{ id: string; contractNumber: string; plan: string | null; status: string; endDate: string }>;
  history: Array<{ reportNumber: string; date: string; serviceType: string | null; visitKind: 'AMC' | 'REQUEST' | 'OTHER';
                   faultReported: string | null; findings: string | null; workDone: string | null; outcome: string | null; conditionAfter: string | null;
                   refrigerantKg: number | null; parts: Array<{ name: string; quantity: number }>; technicianFirstName: string | null; photoCount: number }>;
  recommendations: Array<{ text: string; date: string; reportNumber: string }>;
}
```
- `history` is newest first. Only final reports are shown: status `SUBMITTED` or `VERIFIED` (never `DRAFT`).
- `warranty.visitsUsed` is always `null` for now (PYS does not count warranty visits yet); ESS then shows only the total.
- ESS treats an AMC as covering the AC only while its status is ACTIVE / EXPIRING_SOON **and** its end date has not passed.

## GET /amc
```ts
{ contracts: Array<{ id: string; contractNumber: string; plan: string | null; status: string; startDate: string; endDate: string; totalVisits: number | null; visitsUsed: number; visitsLeft: number | null; acCount: number }> }
```
Current contracts first, then old ones, newest first.

## GET /amc/:id
```ts
{
  contract: { id: string; contractNumber: string; plan: string | null; planCode: string | null; status: string; startDate: string; endDate: string; frequency: string;
              amount: number; includes: { gasCharging: boolean; spareParts: boolean; unlimitedComplaints: boolean }; coverageSummary: string | null;
              acs: AcRef[];
              visits: { total: number | null; used: number; left: number | null; byType: Array<{ type: 'DRY_SERVICE' | 'JET_SERVICE' | 'PUMPDOWN_SERVICE'; total: number; used: number }> };
              timeline: Array<{ visitNumber: number; date: string | null; month: string | null; state: 'DONE' | 'UPCOMING' | 'PLANNED' | 'MISSED';
                                startTime: string | null; technicianFirstName: string | null; serviceType: string | null; reportNumber: string | null }>;
              canRenew: boolean; renewalRequestedAt: string | null };
}
```
- `visits.used` uses the same rule as G1 (dashboard rule). `frequency` is a code (MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY).
- `timeline` has one entry per visit number (all the contract's ACs grouped).
- `canRenew`: status ACTIVE or EXPIRING_SOON with an end date within 30 days, or EXPIRED within the last 60 days, and
  no open renewal request.

## POST /amc/:id/renew   body `{ note?: string (≤ 500) }`
Creates one `web_intakes` row with kind `AMC_RENEWAL` and `amc_contract_id`, linked to the customer.
- New → `201 { requested: true, reference, alreadyRequested: false }`.
- One already open → `200 { requested: true, reference: <that one's>, alreadyRequested: true }` (nothing new stored).
- Outside the renewal window → **409** `NOT_RENEWABLE` (a retry cannot help). Bad note → **400** `INVALID_INPUT`.
- Staff approval only closes the review; staff renew the contract themselves.

## GET /requests?filter=open|completed|all   (default all)
```ts
{ requests: Array<{ number: string; type: string | null; createdAt: string; status: CustomerStatus; ac: AcRef | null;
                    visit: { date: string; startTime: string | null; technicianFirstName: string | null } | null; hasReport: boolean; billNumber: string | null }> }
```

## GET /requests/:number
```ts
{ request: { number: string; type: string | null; description: string | null; createdAt: string; status: CustomerStatus; ac: AcRef | null;
             timeline: Array<{ label: string; at: string }>;   // customer-facing steps only, from the status history
             visits: Array<{ date: string; startTime: string | null; state: string; technicianFirstName: string | null }>;
             reports: Array<{ reportNumber: string; date: string }>;
             bill: { number: string; total: number; balance: number; status: 'PAID' | 'PART_PAID' | 'DUE' } | null } }
```

## GET /reports/:number
```ts
{ report: { number: string; date: string; startTime: string | null; endTime: string | null; serviceType: string | null; visitKind: 'AMC' | 'REQUEST' | 'OTHER';
            requestNumber: string | null; contractNumber: string | null; technicianFirstName: string | null; outcome: string | null;
            workDescription: string | null; observations: string | null; actionTaken: string | null; recommendation: string | null;
            acs: Array<{ ac: AcRef | null; label: string; faultReported: string | null; findings: string | null; workDone: string | null; outcome: string | null; conditionAfter: string | null; refrigerantKg: number | null }>;
            parts: Array<{ name: string; quantity: number }>;
            photos: Array<{ kind: 'BEFORE' | 'AFTER'; url: string; expiresAt: string }>;   // signed 10-minute links, private bucket
            site: { name: string; address: string } | null };
  business: { legalName: string; gstin: string | null; address: string | null; phone: string | null; email: string | null } }
```
Never returned: technician remarks, correction reasons, deviation reasons, staff names, signature image, payment notes,
part costs. Only `SUBMITTED` / `VERIFIED` reports.

## GET /billing
```ts
{ totals: { due: number; paidThisYear: number };   // Indian financial year (from 1 April)
  bills: Array<{ number: string; date: string | null; forLabel: string; total: number; paid: number; balance: number; status: 'PAID' | 'PART_PAID' | 'DUE' }> }
```
- `forLabel`, e.g. "Service request SR-…" or "AMC E2E-…". Newest first.
- Rows come from `payments` with `customer_id` = the session customer.

## GET /billing/:number
```ts
{ bill: { number: string; date: string | null; forLabel: string; requestNumber: string | null; contractNumber: string | null;
          customer: { name: string; code: string | null; phone: string | null; address: string | null };
          total: number; taxable: number; gstRate: 18; gst: number; paid: number; balance: number; status: 'PAID' | 'PART_PAID' | 'DUE';
          payments: Array<{ date: string | null; method: string; amount: number; referenceLast4: string | null; kind: 'PAYMENT' | 'REVERSAL' }>;
          upiLink: string | null };   // only when balance > 0; same format as buildPaymentInvoiceTemplate
  business: { legalName: string; gstin: string | null; address: string | null; phone: string | null; email: string | null } }
```
- `taxable = round(total / 1.18, 2)`, `gst = total - taxable` (totals are taken to include 18% GST, as in the invoice
  email; PYS does not store a GST split per bill). **Open owner question:** confirm this holds for AMC and part-paid bills.
- Reversed transactions are shown as `REVERSAL` with a negative amount.

## POST /profile/change-request   body `{ message: string (5..1000) }`
Creates a `web_intakes` row, kind `PROFILE_CHANGE`, linked to the customer. → `201 { requested: true, reference }`.
Limited to 5 per day per customer (→ 429 `RATE_LIMITED`), also when requests arrive at the same moment. Bad message →
400 `INVALID_INPUT`.

## POST /sign-out-all
Revokes all of the customer's sessions (including the current one). → `200 { signedOut: true }`.

## Business identity
`business` comes from the published ESS content block `business.identity` (legalName, gstin, address, phone, email),
the same block the website footer uses. Any field the block leaves out comes from the invoice email's details, so a
tax invoice always carries the GSTIN.

## Staff side (PYS dashboard)
- Website access is switched on per active PERMANENT customer with a usable email (422 `NO_EMAIL` otherwise); every
  switch is in the activity log.
- `AMC_RENEWAL` / `PROFILE_CHANGE` requests arrive in the approval inbox. Approving only closes the review.
