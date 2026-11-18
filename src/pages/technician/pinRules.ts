import { technicianApi, type TechUser } from '@/services/technicianApi';

/** Server error code when the technician must set a new PIN first. */
export const PIN_CHANGE_REQUIRED_CODE = 'PIN_CHANGE_REQUIRED';

const BLOCKED = new Set(['123456', '654321', '000000', '111111', '121212', '112233', '123123', '696969', '159753', '147258']);

function isRun(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  return asc || desc;
}

/**
 * Same rules the server applies (server/src/utils/techAuth.ts validateNewTechPin), checked early
 * so the technician sees the problem before sending. Returns an error message or null.
 */
export function checkNewTechPin(newPin: string, oldPin?: string): string | null {
  if (!/^\d{6}$/.test(newPin)) return 'New PIN must be exactly 6 digits.';
  if (/^(\d)\1{5}$/.test(newPin)) return 'New PIN cannot be the same digit repeated.';
  if (isRun(newPin)) return 'New PIN cannot be a run of digits like 123456.';
  if (BLOCKED.has(newPin) || /^(\d\d)\1\1$/.test(newPin) || /^(\d{3})\1$/.test(newPin)) {
    return 'New PIN is too easy to guess. Choose a less common PIN.';
  }
  if (oldPin !== undefined && oldPin === newPin) return 'New PIN must be different from your old PIN.';
  return null;
}

/**
 * After a PIN change the server signs out every older session and returns a fresh token.
 * Store it in the same place (remembered device or this tab only) as the current session.
 */
export function storeTokenAfterPinChange(token: string | undefined, tech?: TechUser | null, remember?: boolean): void {
  if (!token) return;
  const current = tech ?? technicianApi.getStoredTech();
  if (!current) return;
  let remembered = remember;
  if (remembered === undefined) {
    try {
      remembered = Boolean(window.localStorage.getItem('pys_tech_token'));
    } catch {
      remembered = false;
    }
  }
  technicianApi.setSession(token, current, remembered);
}
