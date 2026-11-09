# Service Visit Reports — Root Cause Analysis & Implementation Plan

## 1. Executive Summary & Root Cause Diagnosis

### 1.1 Root Cause of Submission Failure & Validation Notice
**Observed Problem**: The validation notice `"Manual report number is mandatory. Please enter a report number."` is displayed to the user and appears sticky/blocking.

**Confirmed Root Causes**:
1. **Stale Form Error State in `ServiceVisitReportModal.tsx`**:
   - `setErrorMessage('Manual report number is mandatory. Please enter a report number.')` is triggered when a submission is attempted with an empty report number or on initial validation.
   - However, the `reportNumber` input `onChange` handler was defined as:
     `onChange={(e) => setReportNumber(e.target.value)}`
   - This handler never cleared `errorMessage` or field-level validation errors!
   - As a consequence, once a user triggered the validation notice, the error remained permanently rendered in the red alert banner even after the user typed a valid, well-formed report number.
2. **HTML5 Native `required` Attribute Collisions**:
   - Multiple inputs (`reportNumber`, `visitDate`, dynamic `partItems`, and `repairItems`) had native HTML5 `required` attributes, while the enclosing `<form>` lacked `noValidate`.
   - In browser environments, if any conditionally rendered or hidden sub-field failed native browser constraints, the form submit was silently suppressed before reaching React's `handleSubmit`.
3. **Missing Discrete Form State Machine**:
   - Form state relied on a simple boolean `isSubmitting` rather than a dedicated state machine (`IDLE` -> `VALIDATING` -> `SUBMITTING` -> `SUCCESS` -> `ERROR`).
   - Duplicate clicks were not prevented during validation, and client-side validation errors were not displayed inline beneath the input.
4. **Time Validation Gap**:
   - For same-day visits, there was no check ensuring `endTime > startTime`.
5. **ApiError Parsing Mismatch**:
   - The catch block in `handleSubmit` attempted to inspect `axiosErr?.response?.data?.error?.message`.
   - However, the application uses a native `fetch`-based `ApiClient` that throws instances of `ApiError` with `.statusCode`, `.code`, `.message`, and `.details`.

---

## 2. Comprehensive Audit Findings

### 2.1 State Management & Validation Bugs
- **Stale Error Banner**: Global `errorMessage` banner is not dismissed on input changes.
- **Missing Inline Field Errors**: Errors are only shown at the top of the form, detached from the relevant inputs.
- **Normalization Gap**: Report number input displayed uppercase via CSS (`className="uppercase"`), but the raw state wasn't normalized on input change.
- **Item Repeater Validation**: When switching outcomes (e.g. from `COMPLETED` to `PENDING_PARTS` or `PENDING_REPAIRS`), the repeater inputs require clear inline validation and clean state preservation without stale mandatory blockers.

### 2.2 Workflow & State-Machine Integrity
- **AMC PM Obligation Completion**:
  - In `server/src/services/serviceReport.service.ts`, when a report for a preventive visit linked to an appointment with `pm_obligation_id` is marked `COMPLETED`, if `pm_obligation_id !== schedule.id`, the linked PM obligation row must be synchronized to `COMPLETED`.
  - When the report is `PENDING_PARTS` or `PENDING_REPAIRS`, the PM obligation must remain uncompleted.
- **Service Request Workflow Lifecycle**:
  - `COMPLETED` transitions `service_requests.status` to `RESOLVED` (preserving downstream `PAYMENT` and `CLOSED` steps).
  - `PENDING_PARTS` transitions `service_requests.status` to `AWAITING_PARTS`.
  - `PENDING_REPAIRS` transitions `service_requests.status` to `REVISIT_REQUIRED`.
  - This flow is correct in the backend, but frontend feedback must clearly explain what happened.
- **Multi-Asset Outcome Precedence**:
  - A visit cannot be marked `COMPLETED` if any asset has `PENDING_PARTS` or `PENDING_REPAIRS`.
  - If any asset is pending parts, the overall visit is `PENDING_PARTS`.
  - If any asset is pending repairs (and none pending parts), the overall visit is `PENDING_REPAIRS`.
  - A visit is `COMPLETED` only if all assets are completed.

### 2.3 UI Layout & Aesthetics Defects
- **Modal Layout (`ServiceVisitReportModal.tsx`)**:
  - Modal content had no single intentional scroll container (`max-h-[75vh] overflow-y-auto`).
  - Read-Only Appointment Details lacked clear label/value separation and visual grouping.
  - Outcome selector cards lacked high-contrast selected states, descriptive microcopy, and accessible focus rings.
  - Per-asset cards were cluttered and lacked proper badge hierarchy.
  - Footer was placed at the bottom of the form without sticky positioning, causing button clipping.
- **Register Layout (`ServiceReportsManagement.tsx`)**:
  - KPI cards were calculated only from the current page (`reports.forEach`), causing misleading counts when paginated.
  - Filter bar had stacked controls with inconsistent heights and lack of alignment.
  - Table action buttons were unaligned.
  - Empty state lacked compact elegance when filtering.

---

## 3. Implementation Plan by Phase

### Phase 2: Form Submission Algorithm & Validation Engine
- File: `src/components/serviceReports/ServiceVisitReportModal.tsx`
- Add `noValidate` to `<form>`.
- Implement discrete form state machine: `IDLE | VALIDATING | SUBMITTING | SUCCESS | ERROR`.
- Add inline field errors (`reportNumberError`, `timeError`, `assetErrors`, `itemErrors`).
- Normalize report number: uppercase and whitespace-trimmed.
- On typing in `reportNumber`, immediately clear `reportNumberError` and `errorMessage`.
- Add validation: `endTime > startTime` when both are provided on the same date.
- Correctly catch and format `ApiError` (handle 409 conflict, 400 validation, 500 server error).

### Phase 3: Workflow State & Multi-Asset Consistency
- File: `server/src/services/serviceReport.service.ts`
- Ensure PM obligation completion is synchronized when `primaryOutcome === 'COMPLETED'` and `pm_obligation_id` exists.
- Return server-side aggregate KPI counts in `listReports` (`summary: { total, completed, pendingParts, pendingRepairs }`).

### Phase 4: Modal UI Redesign
- File: `src/components/serviceReports/ServiceVisitReportModal.tsx`
- Structured sections:
  1. Sticky Modal Header with schedule badge and close button.
  2. Read-Only Appointment Details: 2-column key-value grid with background contrast.
  3. Report Timing & Manual Number: 3-column grid with inline error.
  4. Primary Outcome: 3 equal-width selectable cards (`COMPLETED`, `PENDING_PARTS`, `PENDING_REPAIRS`) with distinct theme colors and icons.
  5. AC Asset Findings: Clear asset card per AC unit with condition badge and refrigerant inputs.
  6. Outcome-Specific Repeaters: Polished parts repeater or repairs repeater.
  7. Technician Remarks & Customer Representative Sign-Off.
  8. Sticky Modal Footer with Cancel and Submit buttons.

### Phase 5: Submit Button & State Machine UX
- Single authoritative form submit handler.
- Submit button shows loading spinner and disables during `VALIDATING` and `SUBMITTING`.
- Scroll to first invalid field on client validation failure.
- Form inputs remain disabled during submit and re-enabled on error without data loss.

### Phase 6: Service Visit Reports Register Redesign
- File: `src/pages/ServiceReportsManagement.tsx`
- Header: Title, description, refresh, and link to Service Schedule.
- 4 Aligned KPI Cards in responsive grid: Total Reports, Service Completed, Pending for Parts, Pending for Repairs.
- Aligned Filter Toolbar: Search input with debounce, Visit Type dropdown, Outcome dropdown, Date Range inputs, and "Clear Filters" button.
- Clean Table with badges, schedule references, and aligned action buttons.

### Phase 7: Report Details & Print View Audit
- File: `src/components/serviceReports/ServiceReportPrintView.tsx`
- Verify print styling hides UI controls and faithfully displays saved report data.

### Phase 8: Automated Regression Testing
- File: `src/tests/serviceReports.test.tsx`
- Add tests covering:
  1. Entering report number clears stale mandatory notice.
  2. Outcome switching preserves repeater state and does not leave hidden required blockers.
  3. 409 duplicate report number error displays clear conflict message and keeps entered data.
  4. Time validation: rejects end time earlier than start time.
  5. Double submission prevention.

### Phase 9 & 10: Build Verification & Documentation
- Run `npm test`, `npm --prefix server run test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Update `DOCS/COMPLETION_REPORT_SERVICE_VISIT_REPORTS.md`.
- Commit and push changes to GitHub.
