/**
 * Safe utility to detect prefers-reduced-motion across browser and test environments.
 * Prevents errors in environments like jsdom where window.matchMedia is not implemented.
 */
export function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
