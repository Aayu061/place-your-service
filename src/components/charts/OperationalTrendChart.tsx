import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { generateSmoothBezierSpline, generateSplineArea, SplinePoint } from '@/utils/spline';
import { isReducedMotion } from '@/utils/reducedMotion';

export interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface OperationalTrendChartProps {
  data: DataPoint[];
  title?: string;
  subtitle?: string;
  height?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export const OperationalTrendChart: React.FC<OperationalTrendChartProps> = ({
  data,
  title = 'Service Volume & Execution Velocity',
  subtitle = '7-Day operational breakdown tickets vs. completed maintenance visits',
  height = 200,
  primaryLabel = 'Completed Visits',
  secondaryLabel = 'New Requests',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const padding = { top: 20, right: 30, bottom: 35, left: 35 };
  const width = 600; // viewBox width

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue || 0)), 10) * 1.15;

  const points: SplinePoint[] = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.value / maxVal) * chartHeight;
    return { x, y };
  });

  const secondaryPoints: SplinePoint[] = data.map((d, i) => {
    const val = d.secondaryValue || 0;
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
    return { x, y };
  });

  const primarySpline = generateSmoothBezierSpline(points);
  const primaryArea = generateSplineArea(points, padding.top + chartHeight);
  const secondarySpline = generateSmoothBezierSpline(secondaryPoints);

  useEffect(() => {
    const path = pathRef.current;
    const area = areaRef.current;
    if (!path) return;

    if (isReducedMotion()) {
      gsap.set(path, { strokeDasharray: 'none', strokeDashoffset: 0 });
      if (area) gsap.set(area, { opacity: 0.85 });
      return;
    }

    const length = path.getTotalLength ? path.getTotalLength() : 800;

    // Sequence the line draw and subtle area fade-in with GSAP timeline
    const tl = gsap.timeline();
    tl.fromTo(
      path,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: 1.4, ease: 'power2.out' }
    );

    if (area) {
      tl.fromTo(area, { opacity: 0 }, { opacity: 0.85, duration: 0.8, ease: 'power1.out' }, '-=0.6');
    }

    return () => {
      tl.kill();
    };
  }, [data]);

  return (
    <div
      className="card card-hybrid"
      style={{
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
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

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{primaryLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-warning-solid)' }} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{secondaryLabel}</span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          className="chart-svg-container"
        >
          <defs>
            <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.35" />
              <stop offset="85%" stopColor="var(--color-brand)" stopOpacity="0.02" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>

            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="var(--color-brand)" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartHeight * (1 - ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {Math.round(ratio * maxVal)}
                </text>
              </g>
            );
          })}

          {/* Secondary Trend Curve */}
          <path
            d={secondarySpline}
            fill="none"
            stroke="var(--color-warning-solid)"
            strokeWidth="2"
            strokeDasharray="5 3"
            opacity="0.85"
            className="chart-spline-path"
          />

          {/* Primary Gradient Area */}
          <path ref={areaRef} d={primaryArea} fill="url(#primaryAreaGrad)" />

          {/* Primary Trend Curve */}
          <path
            ref={pathRef}
            d={primarySpline}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2.5"
            filter="url(#glowFilter)"
            className="chart-spline-path"
          />

          {/* Interactive Data Points */}
          {points.map((p, i) => {
            const isHovered = hoveredIndex === i;
            return (
              <g
                key={i}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Invisible hover target for effortless mouse capture */}
                <circle cx={p.x} cy={p.y} r={14} fill="transparent" />

                {/* Visible Data Dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6 : 4}
                  fill="#ffffff"
                  stroke="var(--color-brand)"
                  strokeWidth={isHovered ? 3 : 2}
                  className="chart-hover-glow"
                />

                {/* X Axis Label */}
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isHovered ? 'var(--color-brand)' : 'var(--text-muted)'}
                  fontWeight={isHovered ? 600 : 400}
                >
                  {data[i].label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && data[hoveredIndex] && (
          <div
            style={{
              position: 'absolute',
              top: `${Math.max(10, points[hoveredIndex].y - 50)}px`,
              left: `${(points[hoveredIndex].x / width) * 100}%`,
              transform: 'translateX(-50%)',
              background: 'var(--glass-bg-surface)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              boxShadow: 'var(--hybrid-glass-neomorph)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              pointerEvents: 'none',
              zIndex: 10,
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
              {data[hoveredIndex].label}
            </div>
            <div style={{ color: 'var(--color-brand)', fontWeight: 500 }}>
              {primaryLabel}: <strong>{data[hoveredIndex].value}</strong>
            </div>
            {data[hoveredIndex].secondaryValue !== undefined && (
              <div style={{ color: 'var(--color-warning-solid)', fontWeight: 500 }}>
                {secondaryLabel}: <strong>{data[hoveredIndex].secondaryValue}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
