import React, { useState } from 'react';
import { Mail, Lock, LogIn, AlertCircle, CheckCircle, Wrench } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ServerWarmupIndicator } from '@/components/feedback/ServerWarmupIndicator';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { LegalTermsModal, LegalTab } from '@/components/legal/LegalTermsModal';
import { getSupabaseClient } from '@/services/supabase';

export interface LoginProps {
  onSwitchToTech?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToTech }) => {
  const { login, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab>('privacy');
  const [resetMode, setResetMode] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const openLegalModal = (tab: LegalTab) => {
    setLegalModalTab(tab);
    setLegalModalOpen(true);
  };

  const activeError = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSuccessMessage(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your work email address.');
      return;
    }

    if (resetMode) {
      setIsSubmitting(true);
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setLocalError('Password reset requires live Supabase Auth configuration. Contact your administrator.');
          return;
        }
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (resetErr) {
          setLocalError(resetErr.message || 'Could not dispatch password reset email.');
          return;
        }
        setResetSuccessMessage(`Password reset instructions sent to ${email.trim()}. Check your inbox.`);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to send password reset email.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Authentication failed. Please check network connectivity.'
      );
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
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              padding: '4px',
              marginBottom: 'var(--space-3)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <img
              src={COMPANY_BANK_DETAILS.pysLogoUrl}
              alt="Place Your Service Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <h1
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 'var(--space-1)',
            }}
          >
            Place Your Service
          </h1>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            Internal Operations & Service Management Portal
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              marginTop: 'var(--space-2)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            <span>Authorized Admin & Staff Access Only</span>
          </div>
        </div>

        {/* Free-Tier Server Warmup Status */}
        <ServerWarmupIndicator inline />

        {/* Error Alert Banner */}
        {activeError && (
          <div
            role="alert"
            className="animate-slide-down"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-subtle, rgba(239, 68, 68, 0.1))',
              border: '1px solid var(--color-danger-border, rgba(239, 68, 68, 0.2))',
              color: 'var(--color-danger, #ef4444)',
              fontSize: 'var(--text-xs)',
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Authentication Failure</div>
              <div>{activeError}</div>
            </div>
          </div>
        )}

        {/* Password Reset Confirmation Banner */}
        {resetSuccessMessage && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
              color: 'var(--color-success-text)',
              fontSize: 'var(--text-xs)',
              lineHeight: 1.4,
            }}
          >
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>{resetSuccessMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              id="login-email"
              label="Work Email"
              type="email"
              autoComplete="email"
              required
              disabled={isSubmitting}
              placeholder="e.g. admin@pys.internal"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (localError) setLocalError(null);
              }}
              leftIcon={<Mail size={16} />}
            />

            {!resetMode && (
              <Input
                id="login-password"
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (localError) setLocalError(null);
                }}
                leftIcon={<Lock size={16} />}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px' }}>
              <button
                type="button"
                onClick={() => {
                  setResetMode((prev) => !prev);
                  setLocalError(null);
                  setResetSuccessMessage(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-brand)',
                  cursor: 'pointer',
                }}
              >
                {resetMode ? 'Back to Sign In' : 'Forgot Password?'}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              leftIcon={resetMode ? <Mail size={18} /> : <LogIn size={18} />}
              style={{
                width: '100%',
                marginTop: 'var(--space-2)',
                fontWeight: 600,
              }}
            >
              {resetMode ? 'Send Password Reset Link' : 'Sign In to Dashboard'}
            </Button>

            <div style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (onSwitchToTech) {
                    onSwitchToTech();
                  } else {
                    const url = new URL(window.location.href);
                    url.searchParams.set('portal', 'tech');
                    window.history.pushState({ portal: 'tech' }, '', url.toString());
                    window.dispatchEvent(new Event('popstate'));
                  }
                }}
                style={{
                  background: 'rgba(235, 94, 40, 0.08)',
                  border: '1px solid rgba(235, 94, 40, 0.25)',
                  borderRadius: '10px',
                  padding: '9px 14px',
                  color: '#eb5e28',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <Wrench size={14} />
                <span>Field Technician? Open Field Desk &rarr;</span>
              </button>
            </div>
          </div>
        </form>

        {/* Security & Architecture Boundary Notice */}
        <div
          style={{
            marginTop: 'var(--space-6)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />
            <span>End-to-End Server Authorization Boundary</span>
          </div>
          <div>Extreme Sales & Services (Fiduciary) · Place Your Service (Platform)</div>

          {/* Legal and Privacy Navigation Links */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: 'var(--space-2)',
              fontSize: '11px',
            }}
          >
            <button
              type="button"
              onClick={() => openLegalModal('privacy')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-primary-600, #3b82f6)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Privacy Policy
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => openLegalModal('terms')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-primary-600, #3b82f6)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Terms of Service
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => openLegalModal('security')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-primary-600, #3b82f6)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              DPDP Compliance
            </button>
          </div>
        </div>

        <LegalTermsModal
          isOpen={legalModalOpen}
          onClose={() => setLegalModalOpen(false)}
          initialTab={legalModalTab}
        />
      </div>
    </div>
  );
};
