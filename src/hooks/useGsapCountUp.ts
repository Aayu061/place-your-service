import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { isReducedMotion } from '@/utils/reducedMotion';

export interface UseGsapCountUpOptions {
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

/**
 * Hook to smoothly animate numerical metric changes using GSAP.
 * Includes automatic cleanup, formatting, and strict prefers-reduced-motion accessibility.
 */
export function useGsapCountUp(
  targetValue: number,
  options: UseGsapCountUpOptions = {}
) {
  const {
    duration = 1.2,
    prefix = '',
    suffix = '',
    decimals = 0,
  } = options;

  const nodeRef = useRef<HTMLSpanElement>(null);
  const currentValRef = useRef<{ val: number }>({ val: 0 });

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const formatNumber = (num: number) => {
      if (decimals > 0) {
        return `${prefix}${num.toFixed(decimals)}${suffix}`;
      }
      return `${prefix}${Math.round(num).toLocaleString()}${suffix}`;
    };

    // Accessibility: instant update without animation if reduced motion preferred
    if (isReducedMotion()) {
      currentValRef.current.val = targetValue;
      node.textContent = formatNumber(targetValue);
      return;
    }

    const tween = gsap.to(currentValRef.current, {
      val: targetValue,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (node) {
          node.textContent = formatNumber(currentValRef.current.val);
        }
      },
    });

    return () => {
      tween.kill();
    };
  }, [targetValue, duration, prefix, suffix, decimals]);

  return nodeRef;
}
