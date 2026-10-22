import { describe, it, expect } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from 'react-dom/client';
import { generateSmoothBezierSpline, generateSplineArea } from '@/utils/spline';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OperationalTrendChart } from '@/components/charts/OperationalTrendChart';
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';
import { WorkDistributionBarChart } from '@/components/charts/WorkDistributionBarChart';

describe('Neumorphic Glass & GSAP Visualizations Suite', () => {
  describe('Catmull-Rom to Cubic Bezier Spline Utility', () => {
    it('handles empty, single, and dual coordinate sets gracefully', () => {
      expect(generateSmoothBezierSpline([])).toBe('');
      expect(generateSmoothBezierSpline([{ x: 10, y: 20 }])).toBe('M 10.00,20.00');
      expect(generateSmoothBezierSpline([{ x: 0, y: 0 }, { x: 100, y: 50 }])).toBe('M 0.00,0.00 L 100.00,50.00');
    });

    it('generates C1-continuous cubic Bezier control commands for multiple points', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 50, y: 60 },
        { x: 100, y: 40 },
        { x: 150, y: 80 },
      ];
      const spline = generateSmoothBezierSpline(points);

      expect(spline.startsWith('M 0.00,100.00')).toBe(true);
      expect(spline).toContain('C');
      // Must contain 3 curve segments for 4 points
      const curveMatches = spline.match(/C/g);
      expect(curveMatches?.length).toBe(3);
    });

    it('creates a closed SVG area polygon for gradient fills', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 50, y: 60 },
        { x: 100, y: 40 },
      ];
      const area = generateSplineArea(points, 200);

      expect(area.startsWith('M 0.00,100.00')).toBe(true);
      expect(area.endsWith('L 100.00,200.00 L 0.00,200.00 Z')).toBe(true);
    });
  });

  describe('GlassCard Component', () => {
    it('renders with card-hybrid, card-glass, and card-neomorph classes', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <div>
            <GlassCard variant="hybrid" data-testid="hybrid-card">Hybrid</GlassCard>
            <GlassCard variant="glass" data-testid="glass-card">Glass</GlassCard>
            <GlassCard variant="neomorph" data-testid="neomorph-card">Neomorph</GlassCard>
          </div>
        );
      });

      const hybrid = container.querySelector('[data-testid="hybrid-card"]');
      const glass = container.querySelector('[data-testid="glass-card"]');
      const neomorph = container.querySelector('[data-testid="neomorph-card"]');

      expect(hybrid?.className).toContain('card-hybrid');
      expect(glass?.className).toContain('card-glass');
      expect(neomorph?.className).toContain('card-neomorph');
    });

    it('supports 3D magnetic tilt physics and specular overlay when enableTilt is active', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <GlassCard enableTilt variant="hybrid" data-testid="tilt-card">
            Tilt Content
          </GlassCard>
        );
      });

      const card = container.querySelector('[data-testid="tilt-card"]') as HTMLDivElement;
      expect(card.className).toContain('gpu-accelerated');

      // Trigger mouse move to simulate magnetic tilt
      act(() => {
        const event = new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50 });
        card.dispatchEvent(event);
      });

      // Reset on mouse leave
      act(() => {
        const leaveEvent = new MouseEvent('mouseleave', { bubbles: true });
        card.dispatchEvent(leaveEvent);
      });

      expect(card.style.transform).toContain('scale3d(1, 1, 1)');
    });
  });

  describe('Tactile Buttons & Inset Form Controls', () => {
    it('Button supports btn-neomorph and btn-glass variants', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <div>
            <Button variant="neomorph">Neumorphic</Button>
            <Button variant="glass">Glass</Button>
          </div>
        );
      });

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].className).toContain('btn-neomorph');
      expect(buttons[1].className).toContain('btn-glass');
    });

    it('Input supports variant="neomorph" rendering inset shadow groove', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(<Input variant="neomorph" label="Neumorphic Input" placeholder="Search..." />);
      });

      const input = container.querySelector('input');
      expect(input?.className).toContain('form-input-neomorph');
    });
  });

  describe('Operational Interactive Chart Visualizations', () => {
    it('OperationalTrendChart renders SVG spline curve, area gradient, and data points', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      const mockData = [
        { label: 'Day 1', value: 10, secondaryValue: 5 },
        { label: 'Day 2', value: 20, secondaryValue: 8 },
        { label: 'Day 3', value: 15, secondaryValue: 12 },
      ];

      act(() => {
        root.render(<OperationalTrendChart data={mockData} />);
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      const paths = container.querySelectorAll('path');
      expect(paths.length).toBeGreaterThanOrEqual(3); // secondary, area, primary

      const textLabels = container.querySelectorAll('text');
      expect(textLabels.length).toBeGreaterThan(0);
    });

    it('CapacityRadialGauge renders concentric SVG progress rings and central ticker', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(<CapacityRadialGauge capacityPercent={75} compliancePercent={88} />);
      });

      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBe(4); // 2 background tracks + 2 progress rings

      expect(container.textContent).toContain('75%');
      expect(container.textContent).toContain('Fleet Capacity & Service Compliance');
    });

    it('WorkDistributionBarChart renders categorical pillars and count indicators', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      const mockItems = [
        { label: 'Dry Svc', count: 30, category: 'PM' as const },
        { label: 'Gas Leak', count: 12, category: 'BREAKDOWN' as const },
      ];

      act(() => {
        root.render(<WorkDistributionBarChart items={mockItems} />);
      });

      const pillars = container.querySelectorAll('.work-bar-pillar');
      expect(pillars.length).toBe(2);

      expect(container.textContent).toContain('Dry Svc');
      expect(container.textContent).toContain('Gas Leak');
      expect(container.textContent).toContain('30');
      expect(container.textContent).toContain('12');
    });
  });
});
