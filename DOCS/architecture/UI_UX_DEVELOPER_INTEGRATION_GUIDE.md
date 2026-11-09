# PYS Neumorphic Glass & GSAP Animation Integration Guide

**Document ID:** `DOCS/UI_UX_DEVELOPER_INTEGRATION_GUIDE.md`  
**Target Audience:** Frontend Developers, UI/UX Engineers, Full-Stack Contributors  
**Release Version:** 1.0.0 (Post-Upgrade)  
**System Standard:** WCAG AA/AAA Accessible • Hardware Accelerated • Zero UI Regressions  

---

## 1. Executive Summary & Design System Architecture

Place Your Service (PYS) has adopted a state-of-the-art **"Neumorphic Glass" (Hybrid Glassmorphism + Neumorphism)** design system powered by **GSAP (GreenSock Animation Platform)**. 

### Why Hybrid?
- **Glassmorphism alone** provides ethereal translucency, frosted backdrop blurs (`backdrop-filter: blur(16px)`), and specular edge highlights, but can feel physically detached or difficult to ground.
- **Neumorphism alone** provides tactile extrusion, soft ambient light, and physical inset grooves, but can suffer from poor contrast or heavy visual bulk.
- **The Neumorphic Glass Hybrid** merges both: translucent frosted glass panels floating atop soft dual-light ambient shadow fields, coupled with crisp specular border gleams and tactile inset controls.

```
┌─────────────────────────────────────────────────────────────┐
│  Neumorphic Glass Surface (.card-hybrid)                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Specular Top/Left Highlight: rgba(255, 255, 255, 0.75)│  │
│  │ Translucent Frosted Glass: rgba(255, 255, 255, 0.72)  │  │
│  │ Ambient Drop Shadow: 8px 12px 28px rgba(15, 23, 42, 0.08)│
│  │ Inset Micro Groove: 1px 1px 2px rgba(255, 255, 255, 0.8) │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Global CSS Design Tokens Reference

All design tokens are defined in `src/styles/tokens.css` and automatically adapt across themes. **Never hardcode hex values or raw box-shadows in component styles.**

| Token | CSS Variable | Value / Usage |
| :--- | :--- | :--- |
| **Glass Surface** | `--glass-bg-surface` | `rgba(255, 255, 255, 0.72)` (Translucent frosted surface) |
| **Glass Border** | `--glass-border` | `1px solid rgba(255, 255, 255, 0.55)` (Crisp specular rim) |
| **Glass Blur** | `--glass-blur` | `blur(16px)` (Standard frosted diffusion) |
| **Glass Highlight** | `--glass-specular-highlight`| `inset 0 1px 1px 0 rgba(255, 255, 255, 0.85)` |
| **Neomorph Extruded**| `--neomorph-shadow-flat` | `6px 6px 14px rgba(15, 23, 42, 0.08), -6px -6px 14px rgba(255, 255, 255, 0.9)` |
| **Neomorph Inset** | `--neomorph-shadow-inset`| `inset 3px 3px 6px rgba(15, 23, 42, 0.06), inset -3px -3px 6px rgba(255, 255, 255, 0.8)` |
| **Neomorph Pressed** | `--neomorph-shadow-pressed`| `inset 4px 4px 8px rgba(15, 23, 42, 0.1), inset -4px -4px 8px rgba(255, 255, 255, 0.9)` |
| **Hybrid Glass** | `--hybrid-glass-neomorph`| Frosted glass surface + outer soft ambient shadow + inner top specular highlight |

---

## 3. Core Component Library Reference

### 3.1. `<GlassCard>` (`src/components/ui/GlassCard.tsx`)
A high-performance card primitive featuring optional **3D magnetic tilt physics** and **specular ray tracking**.

```tsx
import { GlassCard } from '@/components/ui/GlassCard';

// 1. Basic Frosted Glass Card
<GlassCard variant="glass">
  <h3>Glass Panel</h3>
</GlassCard>

// 2. Tactile Neumorphic Card
<GlassCard variant="neomorph">
  <h3>Neumorphic Extruded Panel</h3>
</GlassCard>

// 3. Hybrid Card with 3D Magnetic Tilt Physics
<GlassCard
  variant="hybrid"
  enableTilt={true}
  tiltOptions={{ maxTilt: 6, perspective: 1000, scale: 1.02 }}
>
  <h3>Interactive 3D Tilt Card</h3>
</GlassCard>
```

#### Props:
- `variant`: `'hybrid'` (default), `'glass'`, or `'neomorph'`
- `enableTilt`: `boolean` (default `false`) — Enables 3D cursor tracking and specular gleam ray. Automatically respects `prefers-reduced-motion`.
- `tiltOptions`: `{ maxTilt?: number, perspective?: number, scale?: number, speed?: number }`

---

### 3.2. `<Card>` (`src/components/ui/Card.tsx`)
Standard UI card component updated to support all new variants.

```tsx
import { Card } from '@/components/ui/Card';

<Card variant="hybrid" padding="lg">
  <p>Standard card upgraded with Neumorphic Glass</p>
</Card>
```

---

### 3.3. `<Button>` (`src/components/ui/Button.tsx`)
Tactile physical push buttons with active-state inset transitions.

```tsx
import { Button } from '@/components/ui/Button';

// Neumorphic Button: soft extruded shadow that depresses into an inset groove on :active
<Button variant="neomorph">Tactile Action</Button>

// Glass Button: frosted backdrop with specular sheen
<Button variant="glass">Frosted Action</Button>

// Standard Variants (Primary, Secondary, Ghost, Danger) continue to work normally
<Button variant="primary">Standard Save</Button>
```

---

### 3.4. `<Input>` (`src/components/ui/Input.tsx`)
Tactile search bars and form fields with inset shadow carving.

```tsx
import { Input } from '@/components/ui/Input';

<Input
  variant="neomorph"
  label="Asset Serial Number"
  placeholder="Scan or enter serial..."
  value={serial}
  onChange={(e) => setSerial(e.target.value)}
/>
```

---

## 4. GSAP Data Visualization Components

All charts are built with **pure SVG**, hardware-accelerated transforms (`transform: translate3d(0,0,0)`), and clean GSAP timeline animations with automatic cleanup.

### 4.1. `<OperationalTrendChart>`
**Location:** `src/components/charts/OperationalTrendChart.tsx`  
**Features:** 
- Mathematical **Catmull-Rom to Cubic Bezier** C1-continuous spline curve smoothing.
- Semi-transparent gradient area fill.
- Animated SVG path drawing (`stroke-dashoffset` tween).
- Interactive tooltip tracking coordinates with crosshair indicators.

```tsx
import { OperationalTrendChart } from '@/components/charts/OperationalTrendChart';

const trendData = [
  { label: 'Oct 1', value: 14, secondaryValue: 8 },
  { label: 'Oct 5', value: 22, secondaryValue: 12 },
  { label: 'Oct 10', value: 19, secondaryValue: 15 },
  { label: 'Oct 15', value: 31, secondaryValue: 18 },
];

<OperationalTrendChart
  data={trendData}
  title="Service Throughput Velocity"
  subtitle="Daily completed work orders vs intake volume"
  primaryColor="var(--color-brand)"
  secondaryColor="var(--color-info-solid)"
  height={220}
/>
```

---

### 4.2. `<CapacityRadialGauge>`
**Location:** `src/components/charts/CapacityRadialGauge.tsx`  
**Features:**
- Concentric dual SVG radial progress tracks (Outer: Fleet Capacity, Inner: Service Compliance).
- Circumference stroke dashoffset animations.
- Smooth GSAP numerical percentage count-up in the central hub.
- Accessible legend and status summary.

```tsx
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';

<CapacityRadialGauge
  capacityPercent={82}
  compliancePercent={94}
  title="Technician Fleet Capacity"
  subtitle="Active deployment vs monthly preventive maintenance quota"
  size={240}
/>
```

---

### 4.3. `<WorkDistributionBarChart>`
**Location:** `src/components/charts/WorkDistributionBarChart.tsx`  
**Features:**
- Tactile inset column troughs (`--neomorph-shadow-inset`).
- Staggered GSAP pillar growth (`stagger: 0.07`, `scaleY: 0` to `1`).
- Hover glow and category tooltips.

```tsx
import { WorkDistributionBarChart } from '@/components/charts/WorkDistributionBarChart';

const categories = [
  { label: 'Dry Service', count: 48, category: 'PM' },
  { label: 'Jet Wash', count: 32, category: 'PM' },
  { label: 'Gas Leak', count: 18, category: 'BREAKDOWN' },
  { label: 'PCB Board', count: 9, category: 'BREAKDOWN' },
  { label: 'Compressor', count: 6, category: 'BREAKDOWN' },
];

<WorkDistributionBarChart
  items={categories}
  title="Work Queue Breakdown"
  subtitle="Preventive maintenance vs corrective breakdown allocation"
  height={180}
/>
```

---

### 4.4. `useGsapCountUp` Hook
**Location:** `src/hooks/useGsapCountUp.ts`  
Tween any number smoothly from 0 to target value.

```tsx
import { useGsapCountUp } from '@/hooks/useGsapCountUp';

const MetricDisplay = ({ value }: { value: number }) => {
  const numberRef = useGsapCountUp({
    endValue: value,
    duration: 1.2,
    decimals: 0,
  });

  return <span ref={numberRef} className="text-2xl font-bold">0</span>;
};
```

---

## 5. Mathematical Algorithms Reference

### 5.1. Catmull-Rom to Cubic Bezier Spline Math (`src/utils/spline.ts`)
To convert discrete operational data points $P_0, P_1, P_2, P_3$ into smooth SVG paths without artificial overshoot or jagged linear segments:

$$\text{Control Point 1: } C_1 = P_1 + \frac{P_2 - P_0}{6}$$
$$\text{Control Point 2: } C_2 = P_2 - \frac{P_3 - P_1}{6}$$

The algorithm automatically computes mirror virtual control points for the boundaries ($P_{-1}$ and $P_{n+1}$) so the line originates and terminates smoothly without snapping.

### 5.2. 3D Magnetic Tilt & Specular Ray Math (`src/hooks/useTiltEffect.ts`)
Given bounding box dimensions $(W, H)$ and mouse coordinates $(X, Y)$ within the card:

$$X_{pct} = \left(\frac{X}{W} - 0.5\right) \times 2 \quad \in [-1, 1]$$
$$Y_{pct} = \left(\frac{Y}{H} - 0.5\right) \times 2 \quad \in [-1, 1]$$
$$\text{Rotation } X = -Y_{pct} \times \theta_{max}$$
$$\text{Rotation } Y = X_{pct} \times \theta_{max}$$
$$\text{Specular } X\% = \frac{X}{W} \times 100\%, \quad \text{Specular } Y\% = \frac{Y}{H} \times 100\%$$

This drives CSS `transform: perspective(1000px) rotateX(...) rotateY(...) scale3d(1.02, 1.02, 1)` and dynamically updates the radial specular gradient position in real-time.

---

## 6. Critical Developer Rules: How to Add Features Without Breaking UI

To ensure future features, pages, modals, and tables never break the visual hierarchy, accessibility, or test suites, adhere strictly to these 6 golden rules:

### Rule 1: Never Apply CSS Transforms to Parent Layout Shells
- **The Stacking Context Trap:** In CSS, applying `transform`, `filter`, or `perspective` to a parent container (e.g. `<main>`, `.app-shell`, or `.content-container`) causes that element to become the containing block for all `position: fixed` descendants!
- **Consequence:** If you put a transform on a page wrapper, fixed Drawers (`<Drawer>`), Modals, and `<TopBar>` dropdowns will get trapped inside the scrolled container, clipping offscreen and breaking z-index layering.
- **Enforcement:** Always scope `transform` and 3D tilt effects to card-level leaves (`.card-hybrid`, `.glass-card`). Never apply them to page layouts.

### Rule 2: Always Use `isReducedMotion()` for Animations
- **Accessibility & Test Safety:** Some users have vestibular disorders and configure `prefers-reduced-motion: reduce`. Furthermore, headless test runners (like Vitest in JSDOM) do not have full media query engines.
- **Enforcement:** Always import `isReducedMotion` from `@/utils/reducedMotion`. When true, set final states immediately with `gsap.set()` and return early.

```tsx
// Good: Safe across all environments and accessible
import { isReducedMotion } from '@/utils/reducedMotion';

useEffect(() => {
  if (isReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6 });
}, []);
```

### Rule 3: Always Register GSAP Revert Cleanup in `useEffect`
- React 19 mounts and unmounts components during strict mode and route transitions. If GSAP tweens are left running on unmounted DOM nodes, memory leaks and phantom state modifications will occur.
- **Enforcement:** Use `gsap.context()` or return a cleanup function:

```tsx
useEffect(() => {
  const ctx = gsap.context(() => {
    // animations here
  }, containerRef);

  return () => ctx.revert(); // Automatically kills all tweens on unmount!
}, []);
```

### Rule 4: Text Contrast Invariant on Translucent Surfaces
- When displaying text over frosted glass (`.card-glass`, `.card-hybrid`), never use semi-transparent white text or low-contrast light grays.
- **Enforcement:** Always use the defined typography tokens:
  - Headers & Numbers: `var(--text-primary)` (Slate 900 `#0f172a`)
  - Subtitles & Labels: `var(--text-secondary)` (Slate 600 `#475569`)
  - Timestamps & Hints: `var(--text-muted)` (Slate 400 `#94a3b8`)
- This guarantees WCAG AA (4.5:1) and AAA (7:1) contrast against the white-frosted glass backdrop.

### Rule 5: Zero Synthetic Metrics Principle
- Never create fake or randomized business numbers in analytics components.
- If real operational data is loading or empty, display genuine zeros or an `<EmptyState>` card instead of placeholder mock stats.
- Keep data transformations pure: calculate percentages as `Math.min(100, Math.round((completed / total) * 100))` with safe division fallbacks `(total > 0 ? ... : 0)`.

### Rule 6: Form Inset Rule for Neumorphism
- When building forms, use `variant="neomorph"` for input controls and search boxes inside a `.card-hybrid` container.
- The convex surface of the card paired with the concave inset shadow of the input creates an intuitive physical affordance that indicates "this element is an editable slot".

---

## 7. Step-by-Step Recipes: Adding New UI Features

### Recipe A: Adding an Animated KPI Metric Card
```tsx
import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useGsapCountUp } from '@/hooks/useGsapCountUp';

interface KpiProps {
  label: string;
  value: number;
  unit?: string;
  subtext: string;
}

export const KpiStatCard: React.FC<KpiProps> = ({ label, value, unit = '', subtext }) => {
  const countRef = useGsapCountUp({ endValue: value, duration: 1.0 });

  return (
    <GlassCard variant="hybrid" enableTilt={true} style={{ padding: 'var(--space-4)' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: 'var(--space-2) 0' }}>
        <span ref={countRef} style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
          0
        </span>
        {unit && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{unit}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        {subtext}
      </p>
    </GlassCard>
  );
};
```

---

### Recipe B: Adding a Tactile Filter Bar
```tsx
import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export const FilterBar: React.FC<{ search: string; onSearch: (val: string) => void }> = ({ search, onSearch }) => {
  return (
    <div
      className="card card-hybrid"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div style={{ flex: 1 }}>
        <Input
          variant="neomorph"
          placeholder="Filter work orders by technician or customer..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <Button variant="neomorph">Export Data</Button>
      <Button variant="glass">+ New Request</Button>
    </div>
  );
};
```

---

## 8. Verification & Test Checklist

Before opening a pull request or deploying code with new UI features, run this verification battery:

```bash
# 1. Typecheck: Verify strict TypeScript compliance
npm run typecheck

# 2. Lint: Verify 0 ESLint errors and 0 warnings
npm run lint

# 3. Test: Verify all 19 test suites and 208+ assertions pass cleanly
npm test

# 4. Production Build: Verify clean Vite bundling
npm run build
```

Following this guide ensures the PYS HVAC CRM maintains its cutting-edge visual distinction, rock-solid accessibility, and flawless operational stability.
