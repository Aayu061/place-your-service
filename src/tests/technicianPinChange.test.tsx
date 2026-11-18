import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { TechnicianLogin } from '@/pages/technician/TechnicianLogin';
import { checkNewTechPin } from '@/pages/technician/pinRules';
import { technicianApi, TechUser } from '@/services/technicianApi';
import { ApiError } from '@/services/api/client';

const tech: TechUser = {
  id: 'tech-9',
  technicianCode: 'TECH-0009',
  name: 'Anil Shinde',
  phone: '9820099999',
  email: null,
  status: 'AVAILABLE',
};

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function render(ui: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function submitLogin(container: HTMLElement, id: string, pin: string) {
  const idInput = container.querySelector('input[type="text"]') as HTMLInputElement;
  const pinInput = container.querySelector('input[type="password"]') as HTMLInputElement;
  act(() => {
    setInputValue(idInput, id);
    setInputValue(pinInput, pin);
  });
  await act(async () => {
    (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('Technician forced PIN change', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('PIN rules match the server', () => {
    expect(checkNewTechPin('1234')).toMatch(/6 digits/);
    expect(checkNewTechPin('123456')).toMatch(/run of digits/);
    expect(checkNewTechPin('000000')).toMatch(/same digit/);
    expect(checkNewTechPin('582941', '582941')).toMatch(/different/);
    expect(checkNewTechPin('582941', '1234')).toBeNull();
  });

  it('shows the set-new-PIN screen instead of opening the portal, then continues with the new token', async () => {
    const onLoginSuccess = vi.fn();
    vi.spyOn(technicianApi, 'login').mockResolvedValue({
      token: 'pys_tech_limited',
      technician: tech,
      pinChangeRequired: true,
    } as never);
    const updatePin = vi.spyOn(technicianApi, 'updatePin').mockResolvedValue({ updated: true, token: 'pys_tech_full' } as never);
    const setSession = vi.spyOn(technicianApi, 'setSession');

    const { container, cleanup } = render(<TechnicianLogin onLoginSuccess={onLoginSuccess} onSwitchToAdmin={vi.fn()} />);
    await submitLogin(container, 'TECH-0009', '1234');

    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Set a new PIN');

    const [newPin, confirmPin] = Array.from(container.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
    const form = container.querySelector('form[aria-label="Set a new PIN"]') as HTMLFormElement;

    // A weak PIN is refused on the phone before anything is sent
    act(() => {
      setInputValue(newPin, '123456');
      setInputValue(confirmPin, '123456');
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('run of digits');
    expect(updatePin).not.toHaveBeenCalled();

    act(() => {
      setInputValue(newPin, '582941');
      setInputValue(confirmPin, '582941');
    });
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updatePin).toHaveBeenCalledWith('1234', '582941');
    expect(setSession).toHaveBeenCalledWith('pys_tech_full', tech, true);
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('shows the lock message after too many wrong PINs', async () => {
    vi.spyOn(technicianApi, 'login').mockRejectedValue(
      new ApiError(429, 'TECH_LOGIN_LOCKED', 'Too many wrong PIN attempts. Try again in 15 minutes or ask the admin to reset your PIN.')
    );
    const { container, cleanup } = render(<TechnicianLogin onLoginSuccess={vi.fn()} onSwitchToAdmin={vi.fn()} />);
    await submitLogin(container, 'TECH-0009', '0000');
    expect(container.textContent).toContain('Too many wrong PIN attempts');
    cleanup();
  });
});
