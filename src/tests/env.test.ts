import { describe, it, expect } from 'vitest';
import { config } from '@/config/env';

describe('Environment Configuration Security', () => {
  it('loads configuration defaults without exposing secrets', () => {
    expect(config.appName).toBe('Place Your Service');
    expect(config.supabase).toBeDefined();
    expect(typeof config.supabase.url).toBe('string');
    expect(typeof config.supabase.anonKey).toBe('string');
  });

  it('never contains service-role key or private secrets in browser config', () => {
    // Assert that no service_role key exists anywhere in the config object
    const serialized = JSON.stringify(config).toLowerCase();
    expect(serialized).not.toContain('service_role');
    expect(serialized).not.toContain('servicerole');
    expect(serialized).not.toContain('secret');
  });
});
