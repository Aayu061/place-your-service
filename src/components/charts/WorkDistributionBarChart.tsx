import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/utils/reducedMotion';

export interface DistributionCategory {
  label: string;
  count: number;
  color?: string;
  category?: 'PM' | 'BREAKDOWN';
}

export interface WorkDistributionBarChartProps {
  items: DistributionCategory[];
  title?: string;
  subtitle?: string;
  height?: number;
}

export const WorkDistributionBarChart: React.FC<WorkDistributionBarChartProps> = ({
  items,
  title = 'Work Queue Distribution',
  subtitle = 'Breakdown vs Preventive Maintenance allocation by service category',
  height = 180,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxCount = Math.max(...items.map((i) => i.count), 5) * 1.15;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const bars = container.querySelectorAll('.work-bar-pillar');
    if (!bars.length) return;

    if (isReducedMotion()) {
      gsap.set(bars, { scaleY: 1, opacity: 1 });
      return;
    }

    gsap.fromTo(
      bars,
      { scaleY: 0, opacity: 0 },
      {
        scaleY: 1,
        opacity: 1,
        duration: 0.9,
        stagger: 0.07,
        ease: 'power2.out',
        transformOrigin: 'bottom',
      }
    );
  }, [items]);

  return (
    <div
      className="card card-hybrid"
      style={{
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </h4>
          <p style={{ margin: '2px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Preventive (PM)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-warning-solid)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Breakdown Ticket</span>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          height: `${height}px`,
          padding: 'var(--space-2) 0 var(--space-4) 0',
          borderBottom: '1px solid var(--border-default)',
          position: 'relative',
        }}
      >
        {items.map((item, idx) => {
          const heightPercent = Math.max(8, (item.count / maxCount) * 100);
          const isHovered = hoveredIndex === idx;
          const barColor = item.color || (item.category === 'PM' ? 'var(--color-brand)' : 'var(--color-warning-solid)');

          return (
            <div
              key={idx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Count label floating above bar */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isHovered ? barColor : 'var(--text-secondary)',
                  marginBottom: '4px',
                  transition: 'color var(--duration-hover) var(--ease-standard)',
                }}
              >
                {item.count}
              </span>

              {/* The Neumorphic Bar Column */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '36px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'flex-end',
                  backgroundColor: 'rgba(15, 23, 42, 0.03)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--neomorph-shadow-inset)',
                  padding: '2px',
                }}
              >
                <div
                  className="work-bar-pillar"
                  style={{
                    width: '100%',
                    height: `${heightPercent}%`,
                    backgroundColor: barColor,
                    borderRadius: 'var(--radius-xs)',
                    opacity: isHovered ? 1 : 0.88,
                    boxShadow: isHovered
                      ? `0 0 10px ${barColor}66, inset 0 1px 1px rgba(255, 255, 255, 0.8)`
                      : 'inset 0 1px 1px rgba(255, 255, 255, 0.6)',
                    transition: 'opacity var(--duration-hover) var(--ease-standard), box-shadow var(--duration-hover) var(--ease-standard)',
                  }}
                />
              </div>

              {/* Category label below bar */}
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: isHovered ? 600 : 500,
                  color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                  marginTop: '6px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '54px',
                  transition: 'color var(--duration-hover) var(--ease-standard)',
                }}
                title={item.label}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
