/**
 * Place Your Service — Technology Normalization & Constants
 * Normalizes known equivalent display labels consistently across the application.
 */

export const TECHNOLOGY_OPTIONS = [
  'Inverter',
  'Non-Inverter',
  'Fixed Speed',
  'Variable Speed',
  'Unknown',
] as const;

export type KnownTechnology = (typeof TECHNOLOGY_OPTIONS)[number];

/**
 * Normalizes equivalent technology strings to standard canonical form.
 * - 'Non Inverter', 'Non-Inverter', 'noninverter' -> 'Non-Inverter'
 * - 'Inverter' -> 'Inverter'
 * - 'Fixed Speed' -> 'Fixed Speed'
 * - 'Variable Speed' -> 'Variable Speed'
 * - 'Unknown' -> 'Unknown'
 * - null, undefined, '' -> ''
 * - Other strings -> preserves trimmed original without inventing a specification
 */
export function normalizeTechnology(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const trimmed = val.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'non inverter' || lower === 'non-inverter' || lower === 'noninverter') {
    return 'Non-Inverter';
  }
  if (lower === 'inverter') {
    return 'Inverter';
  }
  if (lower === 'fixed speed' || lower === 'fixed-speed') {
    return 'Fixed Speed';
  }
  if (lower === 'variable speed' || lower === 'variable-speed') {
    return 'Variable Speed';
  }
  if (lower === 'unknown') {
    return 'Unknown';
  }
  return trimmed;
}
