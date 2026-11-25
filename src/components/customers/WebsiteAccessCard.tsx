import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/useToast';

/**
 * S11: whether this customer may sign in on the ESS website ("My account") with a one-time email code.
 * Only active PERMANENT customers with an email can have it; switching it off ends their website sessions.
 */
export function WebsiteAccessCard({
  customerId,
  customerType,
  isActive,
  email,
}: {
  customerId: string;
  customerType: string;
  isActive: boolean;
  email: string | null | undefined;
}) {
  const { showToast } = useToast();
  const [state, setState] = useState<{ enabled: boolean; lastLoginAt: string | null } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const eligible = customerType === 'PERMANENT' && isActive && Boolean(email);

  useEffect(() => {
    let live = true;
    setState(null);
    setLoadFailed(false);
    apiClient
      .get<{ enabled: boolean; lastLoginAt: string | null }>(`/customers/${customerId}/portal-access`)
      .then((res) => live && setState(res))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [customerId]);

  const toggle = async () => {
    if (!state) return;
    setSaving(true);
    try {
      const res = await apiClient.put<{ enabled: boolean }>(`/customers/${customerId}/portal-access`, { enabled: !state.enabled });
      setState({ ...state, enabled: res.enabled });
      showToast({
        type: 'success',
        title: res.enabled ? 'Website account switched on' : 'Website account switched off',
        message: res.enabled
          ? `They can now sign in on the ESS website with a code sent to ${email}.`
          : 'They can no longer sign in, and any open website sessions were ended.',
      });
    } catch (err) {
      showToast({ type: 'error', title: 'Could not change website access', message: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
        ESS website account
      </div>
      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--text-xs)' }}>
        {!eligible ? (
          <span style={{ color: 'var(--text-muted)' }}>
            Only active permanent customers with an email address can have a website account.
          </span>
        ) : loadFailed ? (
          <span style={{ color: 'var(--text-muted)' }}>Could not load the website account. Reopen the customer to try again.</span>
        ) : !state ? (
          <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {state.enabled ? 'On: can sign in with a code sent to ' : 'Off. When on, they sign in with a code sent to '}
                <strong>{email}</strong>
              </span>
              <Button size="sm" variant={state.enabled ? 'outline' : 'primary'} isLoading={saving} onClick={() => void toggle()}>
                {state.enabled ? 'Switch off' : 'Switch on'}
              </Button>
            </div>
            {state.lastLoginAt && (
              <span style={{ color: 'var(--text-muted)' }}>Last signed in {new Date(state.lastLoginAt).toLocaleString('en-IN')}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
