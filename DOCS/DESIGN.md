# Place Your Service — UI/UX & Design Specification

## 1. Design Direction

Place Your Service should look like a modern professional SaaS product rather than a generic admin template.

The visual goal:

> Clean, premium, operational, fast, confident, and modern.

The interface should feel sophisticated without becoming decorative or difficult to use.

---

## 2. Core UX Principles

1. Information should be scannable.
2. Common actions should require minimal clicks.
3. Complex workflows should be progressive.
4. Status should always be visually obvious.
5. Destructive actions require confirmation.
6. Tables should remain usable with large datasets.
7. Every async operation needs feedback.
8. Animation should communicate hierarchy and change.
9. Mobile/tablet layouts must remain functional.
10. Accessibility is part of the design, not an afterthought.

---

## 3. Application Shell

Recommended structure:

```text
┌──────────────────────────────────────────┐
│ Top Bar / Search / Notifications / User │
├──────────────┬───────────────────────────┤
│ Sidebar      │ Main Content              │
│              │                           │
│ Navigation   │ Page                      │
│              │                           │
└──────────────┴───────────────────────────┘
```

Sidebar:

- Dashboard
- Customers
- AC Assets
- Service Requests
- Service Schedule
- AMC Management
- Technicians
- Parts & Inventory
- Payments
- Reports
- Activity Logs
- Settings

Admin additionally sees:

- Staff Management

---

## 4. Dashboard Design

Dashboard hierarchy:

### Level 1 — urgent operational summary

- Overdue services
- Today's services
- Pending requests
- AMC expiring soon

### Level 2 — business KPIs

- Active AMC
- Customers
- Monthly services
- Revenue
- Parts consumption

### Level 3 — trends

- Service volume
- Breakdown vs preventive maintenance
- Revenue trend
- Technician workload/performance

Cards should animate values subtly when data changes.

Charts should animate on initial render but not repeatedly distract users.

---

## 5. Customer 360

Instead of fragmented screens, provide a customer workspace.

Suggested sections:

- Overview
- Sites
- AC Assets
- AMC
- Active Services
- Service History
- Payments
- Activity

Use tabs or a clear secondary navigation.

The user should be able to understand a customer's complete service relationship from one place.

---

## 6. Service Workspace

A service page should behave like an operational workspace.

Sections:

1. Service identity/status
2. Customer/site/AC information
3. Schedule
4. Technician assignment
5. Service progress
6. Service report
7. Parts used
8. Payment
9. Activity/history

Use a visual lifecycle/status stepper.

---

## 7. Tables

Tables should provide:

- Search
- Filters
- Sorting
- Pagination
- Column alignment
- Status badges
- Row actions
- Bulk actions only where safe
- Responsive overflow behavior

Use sticky headers for long tables where useful.

Avoid putting excessive information into every column.

---

## 8. Forms

Use:

- Logical sections
- Clear labels
- Required indicators
- Inline validation
- Helpful placeholders
- Select/search controls for relational data
- Date pickers
- Confirmation before destructive submission

For long forms, use grouped sections or multi-step flows.

---

## 9. Drawers and Modals

Use drawers for:

- Quick creation
- Quick editing
- Record previews

Use full pages for:

- Complex service workflows
- Customer 360
- Reports
- Large configuration tasks

Modals should not become miniature applications.

---

## 10. Status Design

Every major status should have:

- Text
- Consistent semantic styling
- Optional icon
- Accessible contrast

Do not rely on color alone.

Examples:

`PENDING`, `SCHEDULED`, `ASSIGNED`, `IN PROGRESS`, `AWAITING PARTS`, `COMPLETED`, `CANCELLED`

---

## 11. Motion System

Motion should be modern and restrained.

### Page transition

Use a short fade/translate transition.

Approximate duration:

`180–300ms`

### Modal/drawer

Use:

- opacity
- small translate/scale
- easing with a natural deceleration

Approximate duration:

`200–350ms`

### Hover

Small elevation/transform changes:

`120–180ms`

### Dashboard numbers

Use short count-up transitions when appropriate.

### Lists

Use subtle stagger only for small lists.

Do not animate hundreds of table rows.

---

## 12. Modern Interaction Ideas

Use tasteful:

- Command/search interface
- Keyboard shortcuts where useful
- Hover previews
- Contextual quick actions
- Animated status transitions
- Expand/collapse sections
- Skeleton loading
- Optimistic UI only where safe
- Toast notifications
- Smooth filter transitions
- Animated charts
- Timeline reveal
- Drag-and-drop only where it genuinely improves scheduling

---

## 13. Loading States

Never show an empty white screen while data loads.

Use:

- Skeleton cards
- Skeleton tables
- Button loading states
- Progress indicators for longer operations

---

## 14. Empty States

Every major page needs a useful empty state.

Example:

```text
No service requests yet

Create your first service request to start managing service operations.

[Create Service Request]
```

---

## 15. Error States

Errors should explain:

- What happened
- Whether the user needs to act
- How to retry

Avoid technical messages such as raw SQL/PostgREST errors.

---

## 16. Responsive Design

Desktop is the primary operational environment.

Tablet must remain fully functional.

Mobile should support essential operational tasks without creating unusable compressed tables.

Use responsive transformations rather than simply shrinking everything.

---

## 17. Accessibility

Support:

- Keyboard navigation
- Visible focus
- Semantic HTML
- Accessible labels
- Screen-reader-friendly controls
- Sufficient contrast
- Non-color status communication
- Reduced-motion preference

Respect:

`prefers-reduced-motion`

When reduced motion is enabled, replace complex transitions with minimal fades or instant state changes.

---

## 18. Design System

Define reusable:

- Typography scale
- Spacing scale
- Border radius
- Shadows
- Buttons
- Inputs
- Selects
- Badges
- Cards
- Tables
- Tabs
- Modals
- Drawers
- Toasts
- Tooltips
- Dropdowns
- Pagination
- Empty states
- Skeletons

The design system should prevent every page from developing a different visual language.

---

## 19. Visual Quality Rule

Avoid:

- excessive gradients
- unnecessary glassmorphism
- oversized decorative illustrations
- animation on every element
- excessive shadows
- random colors
- generic template appearance

Prefer clarity and controlled visual hierarchy.
