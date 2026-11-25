import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseLib from '../src/lib/supabase.js';
import { productPhotoStorage, ESS_PRODUCT_PHOTOS_BUCKET } from '../src/services/mediaStorage.service.js';
import { productPhotoUploadSchema } from '../src/validators/ess.validator.js';

function fakeStorage(listing: Record<string, Array<{ name: string; created_at?: string }>> = {}) {
  const bucketCalls: string[] = [];
  const createSignedUploadUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://x.supabase.co/upload/${path}?token=t`, token: 't' }, error: null }));
  const getPublicUrl = (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${ESS_PRODUCT_PHOTOS_BUCKET}/${path}` } });
  const list = vi.fn(async (prefix: string) => ({ data: listing[prefix] ?? [], error: null }));
  vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
    storage: {
      from: (name: string) => {
        bucketCalls.push(name);
        return { createSignedUploadUrl, getPublicUrl, list };
      },
    },
  } as never);
  return { bucketCalls, createSignedUploadUrl, list };
}

describe('ESS product photo storage (S10)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('gives a one-time upload link in the product-photo bucket, under a dated random name', async () => {
    const s = fakeStorage();
    const out = await productPhotoStorage.createUploadLink({ contentType: 'image/webp', sizeBytes: 120_000 });
    expect(s.bucketCalls.every((b) => b === ESS_PRODUCT_PHOTOS_BUCKET)).toBe(true);
    expect(out.path).toMatch(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(out.publicUrl).toBe(`https://x.supabase.co/storage/v1/object/public/${ESS_PRODUCT_PHOTOS_BUCKET}/${out.path}`);
    expect(out.signedUrl).toContain(out.path);
  });

  it('refuses other file types and photos over 5 MB (before asking storage)', async () => {
    const s = fakeStorage();
    await expect(productPhotoStorage.createUploadLink({ contentType: 'image/gif', sizeBytes: 1000 })).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(productPhotoStorage.createUploadLink({ contentType: 'image/png', sizeBytes: 5 * 1024 * 1024 + 1 })).rejects.toThrow(/5 MB/);
    expect(s.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(productPhotoUploadSchema.safeParse({ contentType: 'image/svg+xml', sizeBytes: 10 }).success).toBe(false);
    expect(productPhotoUploadSchema.safeParse({ contentType: 'image/jpeg', sizeBytes: 10 }).success).toBe(true);
  });

  it('lists uploaded photos newest day first, skipping anything that is not a photo', async () => {
    fakeStorage({
      '': [{ name: '2026-11-25' }, { name: '2026-11-24' }, { name: 'stray-file.txt' }],
      '2026-11-25': [{ name: 'b.webp', created_at: '2026-11-25T10:00:00Z' }, { name: 'notes.txt' }],
      '2026-11-24': [{ name: 'a.jpg' }],
    });
    const photos = await productPhotoStorage.list();
    expect(photos.map((p) => p.path)).toEqual(['2026-11-25/b.webp', '2026-11-24/a.jpg']);
    expect(photos[0].publicUrl).toContain('/public/ess-product-photos/2026-11-25/b.webp');
  });
});
