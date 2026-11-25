import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError } from '../utils/errors.js';
import { getIstTodayIso } from '../utils/date.js';

export const SERVICE_REPORT_MEDIA_BUCKET = 'service-report-media';

const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface SignedUploadResponse {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  expiresInSeconds: number;
}

class MediaStorageService {
  async createSignedUploadUrl(params: {
    scope: 'before-photo' | 'after-photo' | 'signature';
    mimeType: string;
    entityRef?: string;
  }): Promise<SignedUploadResponse> {
    const ext = MIME_EXT_MAP[params.mimeType.toLowerCase()];
    if (!ext) {
      throw new BadRequestError('Unsupported image format. Allowed types: JPEG, PNG, WebP.');
    }

    const safeRef = (params.entityRef || 'general').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'general';
    const path = `${params.scope}/${getIstTodayIso()}/${safeRef}/${randomUUID()}.${ext}`;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(SERVICE_REPORT_MEDIA_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new BadRequestError(
        `Could not create signed upload URL for storage bucket '${SERVICE_REPORT_MEDIA_BUCKET}': ${error?.message || 'Storage error'}`
      );
    }

    return {
      bucket: SERVICE_REPORT_MEDIA_BUCKET,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      expiresInSeconds: 7200,
    };
  }

  async createSignedViewUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    if (!path || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }

    const normalized = path.replace(/^\/+/, '');
    if (normalized.includes('..')) {
      throw new BadRequestError('Invalid storage path.');
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(SERVICE_REPORT_MEDIA_BUCKET)
      .createSignedUrl(normalized, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new BadRequestError(error?.message || 'Could not sign media view URL.');
    }

    return data.signedUrl;
  }
}

export const mediaStorageService = new MediaStorageService();

/* ------------------------------------------------------------------------------------------------
 * ESS product photos (S10): public-read bucket, uploads only through a one-time signed link that the
 * PYS API hands to a signed-in ESS admin/staff (routes/ess/admin.ts). The bucket itself also limits
 * size (5 MB) and type (JPEG/PNG/WebP); migration 20261125020000.
 * ---------------------------------------------------------------------------------------------- */
export const ESS_PRODUCT_PHOTOS_BUCKET = 'ess-product-photos';
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface ProductPhotoUpload {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}

export interface ProductPhoto {
  path: string;
  publicUrl: string;
  createdAt: string | null;
}

export const productPhotoStorage = {
  async createUploadLink(input: { contentType: string; sizeBytes: number }): Promise<ProductPhotoUpload> {
    const ext = PRODUCT_PHOTO_TYPES[input.contentType.toLowerCase()];
    if (!ext) throw new BadRequestError('Use a JPEG, PNG or WebP photo.');
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > PRODUCT_PHOTO_MAX_BYTES) {
      throw new BadRequestError('The photo must be smaller than 5 MB.');
    }
    const path = `${getIstTodayIso()}/${randomUUID()}.${ext}`;
    const bucket = getSupabaseClient().storage.from(ESS_PRODUCT_PHOTOS_BUCKET);
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new BadRequestError(`Could not prepare the upload: ${error?.message || 'storage error'}`);
    return { path, signedUrl: data.signedUrl, token: data.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
  },

  /** Newest first; folders are the upload dates (YYYY-MM-DD). */
  async list(limit = 200): Promise<ProductPhoto[]> {
    const bucket = getSupabaseClient().storage.from(ESS_PRODUCT_PHOTOS_BUCKET);
    const { data: days, error } = await bucket.list('', { limit: 400, sortBy: { column: 'name', order: 'desc' } });
    if (error) throw new Error(`Failed to list product photos: ${error.message}`);
    const out: ProductPhoto[] = [];
    for (const day of (days ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.name))) {
      if (out.length >= limit) break;
      const { data: files, error: e2 } = await bucket.list(day.name, { limit, sortBy: { column: 'created_at', order: 'desc' } });
      if (e2) throw new Error(`Failed to list product photos: ${e2.message}`);
      for (const f of files ?? []) {
        if (!/\.(jpg|png|webp)$/.test(f.name)) continue;
        const path = `${day.name}/${f.name}`;
        out.push({ path, publicUrl: bucket.getPublicUrl(path).data.publicUrl, createdAt: (f as { created_at?: string }).created_at ?? null });
        if (out.length >= limit) break;
      }
    }
    return out;
  },
};

