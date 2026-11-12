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

