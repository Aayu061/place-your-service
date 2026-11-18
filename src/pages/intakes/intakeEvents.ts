/** Lets the sidebar badge refresh immediately after an approve/reject instead of waiting for its poll. */
export const INTAKES_CHANGED_EVENT = 'pys:intakes-changed';

export function notifyIntakesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INTAKES_CHANGED_EVENT));
}
