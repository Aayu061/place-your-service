import React from 'react';
import { useTiltEffect, UseTiltEffectOptions } from '@/hooks/useTiltEffect';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'glass' | 'hybrid' | 'neomorph';
  enableTilt?: boolean;
  tiltOptions?: UseTiltEffectOptions;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  variant = 'hybrid',
  enableTilt = false,
  tiltOptions,
  className = '',
  style,
  onMouseMove,
  onMouseLeave,
  ...props
}) => {
  const { elementRef, handleMouseMove, handleMouseLeave } = useTiltEffect(tiltOptions);

  const variantClass =
    variant === 'glass'
      ? 'card-glass'
      : variant === 'neomorph'
      ? 'card-neomorph'
      : 'card-hybrid';

  const onMouseMoveCombined = (e: React.MouseEvent<HTMLDivElement>) => {
    if (enableTilt) handleMouseMove(e);
    if (onMouseMove) onMouseMove(e);
  };

  const onMouseLeaveCombined = (e: React.MouseEvent<HTMLDivElement>) => {
    if (enableTilt) handleMouseLeave();
    if (onMouseLeave) onMouseLeave(e);
  };

  return (
    <div
      ref={enableTilt ? elementRef : undefined}
      className={`card ${variantClass} ${enableTilt ? 'gpu-accelerated' : ''} ${className}`.trim()}
      style={{
        transformStyle: enableTilt ? 'preserve-3d' : undefined,
        ...style,
      }}
      onMouseMove={enableTilt ? onMouseMoveCombined : onMouseMove}
      onMouseLeave={enableTilt ? onMouseLeaveCombined : onMouseLeave}
      {...props}
    >
      {/* Specular Ray Shimmer Overlay */}
      {enableTilt && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            background:
              'radial-gradient(circle at var(--specular-x, 50%) var(--specular-y, 50%), rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 60%)',
            opacity: 0.75,
            transition: 'opacity var(--duration-hover) var(--ease-standard)',
            zIndex: 1,
          }}
          aria-hidden="true"
        />
      )}
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
};
