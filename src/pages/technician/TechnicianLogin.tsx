import React, { useState } from 'react';
import { KeyRound, Smartphone, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';
import { technicianApi } from '@/services/technicianApi';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';

export interface TechnicianLoginProps {
  onLoginSuccess: () => void;
  onSwitchToAdmin: () => void;
}

export function TechnicianLogin({ onLoginSuccess, onSwitchToAdmin }: TechnicianLoginProps) {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setError('Please enter your Technician Code (e.g. TECH-0001) or Mobile Number.');
      return;
    }

    if (!pin || pin.length < 4) {
      setError('Please enter your 4-digit security PIN.');
      return;
    }

    try {
      setIsSubmitting(true);
      await technicianApi.login(cleanId, pin);
      onLoginSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
        backgroundColor: 'var(--bg-canvas)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-3)',
              padding: '8px 18px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-xs)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <img
              src={COMPANY_BANK_DETAILS.extremeLogoUrl}
              alt="Extreme Sales & Services"
              style={{ width: '40px', height: '40px', objectFit: 'contain' }}
            />
            <div
              style={{
                width: '1px',
                height: '26px',
                backgroundColor: 'var(--border-default)',
              }}
            />
            <img
              src={COMPANY_BANK_DETAILS.pysLogoUrl}
              alt="Place Your Service"
              style={{ width: '40px', height: '40px', objectFit: 'contain' }}
            />
          </div>

          <h1
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 var(--space-1) 0',
              letterSpacing: '-0.02em',
            }}
          >
            Technician Field Portal
          </h1>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            On-Site Dispatch &amp; Service Reporting Desk
          </p>
        </div>

        {/* Login Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {error && (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-error-bg)',
                border: '1px solid var(--color-error-border)',
                color: 'var(--color-error-text)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            {/* Tech Code or Phone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Technician Code or Mobile
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Smartphone size={16} />
                </span>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. TECH-0001 or 9876543210"
                  autoCapitalize="characters"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            {/* 4-digit PIN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Security PIN (4-Digits)
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Default: 1234
                </span>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <KeyRound size={16} />
                </span>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.15em',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-brand)',
                color: '#ffffff',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm)',
                opacity: isSubmitting ? 0.6 : 1,
                marginTop: 'var(--space-1)',
              }}
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Sign In to Field Desk</span>
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div
            style={{
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-subtle)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '11px',
                color: 'var(--color-success-solid, #2F7654)',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} />
              <span>Isolated Field Technician Session</span>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
              Authorized for Extreme Sales &amp; Services field staff only.
            </p>
          </div>
        </div>

        {/* Back-office switch link */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={onSwitchToAdmin}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '6px 12px',
            }}
          >
            Switch to Admin &amp; Back-Office Portal &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
