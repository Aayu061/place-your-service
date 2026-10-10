import { describe, it, expect } from 'vitest';
import { normalizeTechnology, TECHNOLOGY_OPTIONS } from '../src/utils/technology.js';

describe('Server Technology Normalization Utility', () => {
  it('normalizes Inverter correctly', () => {
    expect(normalizeTechnology('Inverter')).toBe('Inverter');
    expect(normalizeTechnology('inverter')).toBe('Inverter');
    expect(normalizeTechnology('  Inverter  ')).toBe('Inverter');
  });

  it('normalizes Non Inverter to Non-Inverter', () => {
    expect(normalizeTechnology('Non Inverter')).toBe('Non-Inverter');
    expect(normalizeTechnology('non inverter')).toBe('Non-Inverter');
    expect(normalizeTechnology('  Non Inverter  ')).toBe('Non-Inverter');
    expect(normalizeTechnology('noninverter')).toBe('Non-Inverter');
  });

  it('normalizes Non-Inverter correctly', () => {
    expect(normalizeTechnology('Non-Inverter')).toBe('Non-Inverter');
    expect(normalizeTechnology('non-inverter')).toBe('Non-Inverter');
  });

  it('normalizes Fixed Speed correctly', () => {
    expect(normalizeTechnology('Fixed Speed')).toBe('Fixed Speed');
    expect(normalizeTechnology('fixed speed')).toBe('Fixed Speed');
    expect(normalizeTechnology('fixed-speed')).toBe('Fixed Speed');
  });

  it('normalizes Variable Speed correctly', () => {
    expect(normalizeTechnology('Variable Speed')).toBe('Variable Speed');
    expect(normalizeTechnology('variable speed')).toBe('Variable Speed');
    expect(normalizeTechnology('variable-speed')).toBe('Variable Speed');
  });

  it('normalizes Unknown correctly', () => {
    expect(normalizeTechnology('Unknown')).toBe('Unknown');
    expect(normalizeTechnology('unknown')).toBe('Unknown');
  });

  it('returns empty string for null, undefined, or empty values without defaulting to Inverter', () => {
    expect(normalizeTechnology(null)).toBe('');
    expect(normalizeTechnology(undefined)).toBe('');
    expect(normalizeTechnology('')).toBe('');
    expect(normalizeTechnology('   ')).toBe('');
  });

  it('preserves unknown/custom technology values without inventing a specification', () => {
    expect(normalizeTechnology('Premium Series - Inverte')).toBe('Premium Series - Inverte');
    expect(normalizeTechnology('Dual Inverter')).toBe('Dual Inverter');
    expect(normalizeTechnology('Hybrid Heat Pump')).toBe('Hybrid Heat Pump');
  });

  it('TECHNOLOGY_OPTIONS includes canonical set', () => {
    expect(TECHNOLOGY_OPTIONS).toContain('Inverter');
    expect(TECHNOLOGY_OPTIONS).toContain('Non-Inverter');
    expect(TECHNOLOGY_OPTIONS).toContain('Fixed Speed');
    expect(TECHNOLOGY_OPTIONS).toContain('Variable Speed');
    expect(TECHNOLOGY_OPTIONS).toContain('Unknown');
    expect(TECHNOLOGY_OPTIONS).not.toContain('Non Inverter');
  });
});
