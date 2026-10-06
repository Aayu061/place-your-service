import React, { useState } from 'react';
import { Mail, Lock, LogIn, AlertCircle, Shield, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export const Login: React.FC = () => {
  const { login, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeError = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your work email address.');
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
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-brand-subtle)',
              color: 'var(--color-brand)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <Shield size={28} />
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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              leftIcon={<LogIn size={18} />}
              style={{
                width: '100%',
                marginTop: 'var(--space-2)',
                fontWeight: 600,
              }}
            >
              Sign In to Dashboard
            </Button>
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
          <div>Role resolution enforced via Render backend & Supabase Auth</div>
        </div>
      </div>
    </div>
  );
};
