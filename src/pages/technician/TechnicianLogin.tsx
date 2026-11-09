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
    <div className="min-h-screen bg-surface-canvas flex flex-col justify-center items-center p-4 antialiased selection:bg-brand-primary selection:text-white">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 p-2 rounded-2xl bg-surface-raised border border-brand-border shadow-xs">
            <img
              src={COMPANY_BANK_DETAILS.extremeLogoUrl}
              alt="Extreme Sales & Services"
              className="h-10 w-10 object-contain"
            />
            <div className="h-6 w-px bg-brand-border" />
            <img
              src={COMPANY_BANK_DETAILS.pysLogoUrl}
              alt="Place Your Service"
              className="h-10 w-10 object-contain"
            />
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-brand-primary">
            Technician Field Portal
          </h1>
          <p className="text-xs text-brand-secondary">
            On-Site Dispatch &amp; Service Reporting Desk
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-raised border border-brand-border rounded-2xl p-6 shadow-sm space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tech Code or Phone */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-brand-primary">
                Technician Code or Mobile
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-secondary">
                  <Smartphone className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. TECH-0001 or 9876543210"
                  autoCapitalize="characters"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary placeholder:text-brand-secondary/60 focus:outline-hidden focus:ring-2 focus:ring-brand-primary focus:border-brand-primary font-medium transition-all"
                />
              </div>
            </div>

            {/* 4-digit PIN */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-brand-primary">
                  Security PIN (4-Digits)
                </label>
                <span className="text-[10px] text-brand-secondary">Default: 1234</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-secondary">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-sunken border border-brand-border rounded-xl text-sm font-mono tracking-widest text-brand-primary placeholder:text-brand-secondary/60 focus:outline-hidden focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-all text-center sm:text-left"
                />
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-brand-primary hover:bg-brand-primary/90 text-surface-canvas font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Field Desk</span>
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="pt-2 border-t border-brand-border text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Isolated Field Technician Session</span>
            </div>
            <p className="text-[10px] text-brand-secondary">
              Authorized for Extreme Sales &amp; Services field staff only.
            </p>
          </div>
        </div>

        {/* Back-office switch link */}
        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="text-xs text-brand-secondary hover:text-brand-primary underline transition-colors cursor-pointer"
          >
            Switch to Admin &amp; Back-Office Portal &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
