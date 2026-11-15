import type { AcModel, AcModelVariant } from '../domain/types';

// High-Speed Master Data Client Caches (0ms Instant Brand & Model Selection)
export const clientModelsByBrandCache = new Map<string, AcModel[]>();
export const clientVariantsByModelCache = new Map<string, AcModelVariant[]>();

export function clearClientMasterCache() {
  clientModelsByBrandCache.clear();
  clientVariantsByModelCache.clear();
}
