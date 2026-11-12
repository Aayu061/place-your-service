import { apiClient } from '@/services/api/client';
import { technicianApi } from '@/services/technicianApi';

export type MediaScope = 'before-photo' | 'after-photo' | 'signature';

interface SignedUploadUrlResult {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  expiresInSeconds: number;
}

export async function compressImageFileToJpeg(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(file);
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image file.'));
    };
    img.src = objectUrl;
  });
}

export async function uploadFieldMediaFile(opts: {
  file: File;
  scope: MediaScope;
  entityRef?: string;
  portal?: 'admin' | 'tech';
}): Promise<string> {
  const compressed = await compressImageFileToJpeg(opts.file);
  const requestBody = {
    scope: opts.scope,
    mimeType: 'image/jpeg' as const,
    entityRef: opts.entityRef,
  };

  const signed =
    opts.portal === 'tech'
      ? await technicianApi.createMediaUploadUrl(requestBody)
      : await apiClient.post<SignedUploadUrlResult>('/service-reports/media/upload-url', requestBody);

  const uploadResponse = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: compressed,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Storage upload failed (${uploadResponse.status})`);
  }

  try {
    const viewRes =
      opts.portal === 'tech'
        ? await technicianApi.getMediaSignedUrl(signed.path)
        : await apiClient.get<{ signedUrl: string }>('/service-reports/media/signed-url', {
            params: { path: signed.path },
          });
    return viewRes.signedUrl || signed.path;
  } catch {
    return signed.path;
  }
}
