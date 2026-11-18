import type { CatalogAmcPlan, CatalogServiceItem, PriceBreakup } from './catalog.service.js';

/**
 * Price shown for one basket line, saved on the line (web_intake_items.price_snapshot) so staff
 * see exactly what the customer saw. Totals are per unit and include GST. null = price after
 * inspection / quote (the website shows "price on inspection" for these).
 */
export interface PriceSnapshot {
  /** Per unit, GST included. */
  total: number;
  /** Present when the price is built from a base price + GST (catalog services and AMC plans). */
  base?: number;
  gstRatePercent?: number;
  gst?: number;
  label: string;
}

export interface LineAc {
  type?: string;
  tonnage?: number;
}

const withLabel = (p: PriceBreakup | null, label: string): PriceSnapshot | null => (p ? { ...p, label } : null);

/** Service: exact AC type + tonnage row of the price matrix if one matches, else the base price. */
export function servicePriceFor(item: CatalogServiceItem, ac?: LineAc): PriceSnapshot | null {
  if (item.pricingModel === 'QUOTE_AFTER_DIAGNOSIS') return null;
  if (ac?.type && ac.tonnage !== undefined) {
    const row = item.priceMatrix.find(
      (p) => p.acType === ac.type && ac.tonnage! >= p.tonnageMin && ac.tonnage! <= p.tonnageMax,
    );
    if (row) {
      const { acType: _t, tonnageMin: _a, tonnageMax: _b, ...price } = row;
      return withLabel(price, `${item.name} (${ac.type.toLowerCase()}, ${ac.tonnage} ton)`);
    }
  }
  return withLabel(item.price, item.pricingModel === 'FROM' ? `${item.name} (from)` : item.name);
}

/**
 * AMC plan rate card: split/window × 0.8–1.0 ton ("small") or 1.5–2.2 ton ("large"); a flat rate
 * applies to any AC. Anything outside the card (inverter-only plans aside, cassette, > 2.2 ton,
 * unknown size) → null = price after inspection.
 */
export function amcPriceFor(plan: CatalogAmcPlan, ac?: LineAc): PriceSnapshot | null {
  if (plan.rates.flat) return withLabel(plan.rates.flat, plan.name);
  if (!ac?.type || ac.tonnage === undefined) return null;
  const t = ac.tonnage;
  const size = t >= 0.75 && t <= 1.0 ? 'Small' : t >= 1.5 && t <= 2.2 ? 'Large' : null;
  if (!size) return null;
  const key =
    ac.type === 'SPLIT' ? (`split${size}` as const) : ac.type === 'WINDOW' ? (`window${size}` as const) : null;
  if (!key) return null;
  return withLabel(plan.rates[key], `${plan.name} (${ac.type.toLowerCase()}, ${t} ton)`);
}

/** Product: the listed selling price (GST-inclusive retail price, as shown on the shop). */
export function productPriceFor(name: string, price: number | string | null | undefined): PriceSnapshot | null {
  const total = Number(price);
  if (price === null || price === undefined || price === '' || !Number.isFinite(total) || total <= 0) return null;
  return { total, label: `${name} (listed price incl. GST)` };
}
