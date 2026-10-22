import { useRef, useCallback, useEffect } from 'react';
import { isReducedMotion } from '@/utils/reducedMotion';

export interface UseTiltEffectOptions {
  maxTilt?: number;
  perspective?: number;
  scale?: number;
  speed?: number;
}

/**
 * Hook providing 3D magnetic tilt physics and specular ray tracking
 * for Glassmorphic and Neumorphic interactive cards.
 */
export function useTiltEffect(options: UseTiltEffectOptions = {}) {
  const {
    maxTilt = 7,
    perspective = 1000,
    scale = 1.02,
  } = options;

  const elementRef = useRef<HTMLDivElement>(null);

  const applyTilt = useCallback(
    (clientX: number, clientY: number) => {
      const el = elementRef.current;
      if (!el || isReducedMotion()) return;

      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 200, height: 100 };
      const width = rect.width > 0 ? rect.width : 200;
      const height = rect.height > 0 ? rect.height : 100;

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const xPct = (x / width - 0.5) * 2; // -1 to +1
      const yPct = (y / height - 0.5) * 2; // -1 to +1

      const rotX = -yPct * maxTilt;
      const rotY = xPct * maxTilt;

      el.style.transform = `perspective(${perspective}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`;
      el.style.setProperty('--specular-x', `${((x / width) * 100).toFixed(1)}%`);
      el.style.setProperty('--specular-y', `${((y / height) * 100).toFixed(1)}%`);
    },
    [maxTilt, perspective, scale]
  );

  const resetTilt = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;

    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    el.style.setProperty('--specular-x', '50%');
    el.style.setProperty('--specular-y', '50%');
  }, [perspective]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      applyTilt(e.clientX, e.clientY);
    },
    [applyTilt]
  );

  const handleMouseLeave = useCallback(() => {
    resetTilt();
  }, [resetTilt]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      applyTilt(e.clientX, e.clientY);
    };

    const onLeave = () => {
      resetTilt();
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);

    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [applyTilt, resetTilt]);

  return {
    elementRef,
    handleMouseMove,
    handleMouseLeave,
    resetTilt,
  };
}
