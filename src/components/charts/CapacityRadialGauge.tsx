import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGsapCountUp } from '@/hooks/useGsapCountUp';
import { Badge } from '@/components/ui/Badge';
import { isReducedMotion } from '@/utils/reducedMotion';

export interface CapacityRadialGaugeProps {
  capacityPercent: number; // 0 to 100
  compliancePercent: number; // 0 to 100
  title?: string;
  subtitle?: string;
}

export const CapacityRadialGauge: React.FC<CapacityRadialGaugeProps> = ({
  capacityPercent,
  compliancePercent,
  title = 'Fleet Capacity & Service Compliance',
  subtitle = 'Active field workload vs. preventive maintenance index',
}) => {
  const outerCircleRef = useRef<SVGCircleElement>(null);
  const innerCircleRef = useRef<SVGCircleElement>(null);
  const counterRef = useGsapCountUp(capacityPercent, { suffix: '%' });

  const size = 180;
  const strokeWidth = 10;
  const center = size / 2;

  // Outer ring (Capacity)
  const outerRadius = center - strokeWidth;
  const outerCircumference = 2 * Math.PI * outerRadius;

  // Inner ring (Compliance)
  const innerRadius = outerRadius - strokeWidth - 6;
  const innerCircumference = 2 * Math.PI * innerRadius;

  // Determine health color
  const getCapacityColor = (pct: number) => {
    if (pct > 90) return 'var(--color-error-solid)';
    if (pct > 75) return 'var(--color-warning-solid)';
    return 'var(--color-brand)';
  };

  const getComplianceColor = (pct: number) => {
    if (pct >= 85) return 'var(--color-success-solid)';
    if (pct >= 65) return 'var(--color-warning-solid)';
    return 'var(--color-error-solid)';
  };

  const capacityColor = getCapacityColor(capacityPercent);
  const complianceColor = getComplianceColor(compliancePercent);

  useEffect(() => {
    const outer = outerCircleRef.current;
    const inner = innerCircleRef.current;
    if (!outer || !inner) return;

    const outerTargetOffset = outerCircumference - (capacityPercent / 100) * outerCircumference;
    const innerTargetOffset = innerCircumference - (compliancePercent / 100) * innerCircumference;

    if (isReducedMotion()) {
      gsap.set(outer, { strokeDashoffset: outerTargetOffset });
      gsap.set(inner, { strokeDashoffset: innerTargetOffset });
      return;
    }

    const tl = gsap.timeline();
    tl.fromTo(
      outer,
      { strokeDashoffset: outerCircumference },
      { strokeDashoffset: outerTargetOffset, duration: 1.5, ease: 'power2.out' }
    ).fromTo(
      inner,
      { strokeDashoffset: innerCircumference },
      { strokeDashoffset: innerTargetOffset, duration: 1.3, ease: 'power2.out' },
      '-=1.1'
    );

    return () => {
      tl.kill();
    };
  }, [capacityPercent, compliancePercent, outerCircumference, innerCircumference]);

  return (
    <div
      className="card card-hybrid"
      style={{
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        height: '100%',
      }}
    >
      <div style={{ width: '100%', textAlign: 'left' }}>
        <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h4>
        <p style={{ margin: '2px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      </div>

      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
        >
          {/* Background track: Outer Ring */}
          <circle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="transparent"
            stroke="var(--color-neutral-100)"
            strokeWidth={strokeWidth}
          />

          {/* Active progress: Outer Ring */}
          <circle
            ref={outerCircleRef}
            cx={center}
            cy={center}
            r={outerRadius}
            fill="transparent"
            stroke={capacityColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={outerCircumference}
            strokeDashoffset={outerCircumference}
            style={{
              transition: 'stroke 0.4s ease',
              filter: `drop-shadow(0 0 4px ${capacityColor}44)`,
            }}
          />

          {/* Background track: Inner Ring */}
          <circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill="transparent"
            stroke="var(--color-neutral-100)"
            strokeWidth={strokeWidth - 2}
          />

          {/* Active progress: Inner Ring */}
          <circle
            ref={innerCircleRef}
            cx={center}
            cy={center}
            r={innerRadius}
            fill="transparent"
            stroke={complianceColor}
            strokeWidth={strokeWidth - 2}
            strokeLinecap="round"
            strokeDasharray={innerCircumference}
            strokeDashoffset={innerCircumference}
            style={{
              transition: 'stroke 0.4s ease',
              filter: `drop-shadow(0 0 4px ${complianceColor}44)`,
            }}
          />
        </svg>

        {/* Center Ticker Content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <span
            ref={counterRef}
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            {capacityPercent}%
          </span>
          <span
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginTop: '4px',
            }}
          >
            Dispatch Load
          </span>
        </div>
      </div>

      {/* Legend & Health Tag */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: capacityColor }} />
            <span style={{ color: 'var(--text-secondary)' }}>Technician Load</span>
          </div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{capacityPercent}%</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: complianceColor }} />
            <span style={{ color: 'var(--text-secondary)' }}>AMC Service Health</span>
          </div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{compliancePercent}%</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-1)' }}>
          <Badge variant={capacityPercent > 85 ? 'warning' : 'success'}>
            {capacityPercent > 85 ? 'HIGH DISPATCH CAPACITY' : 'OPTIMAL FIELD CAPACITY'}
          </Badge>
        </div>
      </div>
    </div>
  );
};
