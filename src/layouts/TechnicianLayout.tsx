import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { technicianApi, TechUser } from '@/services/technicianApi';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';

export interface TechnicianLayoutProps {
  activeTab: 'jobs' | 'completed' | 'profile';
  onTabChange: (tab: 'jobs' | 'completed' | 'profile') => void;
  onLogout: () => void;
  tech: TechUser | null;
  onTechChange?: (tech: TechUser) => void;
  children: React.ReactNode;
}

export function TechnicianLayout({
  activeTab,
  onTabChange,
  onLogout,
  tech,
  onTechChange,
  children,
}: TechnicianLayoutProps) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleStatusChange = async (newStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY') => {
    setIsStatusMenuOpen(false);
    if (!tech || tech.status === newStatus) return;

    try {
      setIsUpdatingStatus(true);
      await technicianApi.updateStatus(newStatus);
      const updated = { ...tech, status: newStatus };
      if (onTechChange) {
        onTechChange(updated);
      }
    } catch (err) {
      console.error('Failed to update duty status', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return { label: 'On Duty · Available', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', textColor: '#16a34a' };
      case 'BUSY':
      case 'ON_DUTY':
        return { label: 'On Site · Busy', dotColor: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)', textColor: '#d97706' };
      case 'OFF_DUTY':
      default:
        return { label: 'Off Duty', dotColor: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.12)', textColor: '#64748b' };
    }
  };

  const statusInfo = getStatusBadge(tech?.status || 'AVAILABLE');

  return (
    <div className="min-h-screen bg-surface-canvas text-brand-primary flex flex-col antialiased selection:bg-brand-primary selection:text-white">
      {/* Mobile Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-surface-raised border-b border-brand-border shadow-xs backdrop-blur-md px-3.5 py-2.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Tech Identifier */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-surface-subtle p-0.5 border border-brand-border shrink-0 flex items-center justify-center">
              <img
                src={COMPANY_BANK_DETAILS.pysLogoUrl}
                alt="PYS Field Portal"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-brand-primary truncate">
                  {tech?.name || 'Technician Desk'}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-brand-primary/10 text-brand-primary">
                  {tech?.technicianCode || 'TECH'}
                </span>
              </div>
              <p className="text-[10px] text-brand-secondary truncate">
                Extreme Sales &amp; Services · Field Desk
              </p>
            </div>
          </div>

          {/* Right Controls: Duty Status & Logout */}
          <div className="flex items-center gap-1.5 shrink-0 relative">
            <button
              type="button"
              onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
              disabled={isUpdatingStatus}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer"
              style={{
                backgroundColor: statusInfo.bgColor,
                borderColor: statusInfo.dotColor,
                color: statusInfo.textColor,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                style={{ backgroundColor: statusInfo.dotColor }}
              />
              <span className="hidden sm:inline">{statusInfo.label}</span>
              <span className="sm:hidden">{tech?.status === 'AVAILABLE' ? 'On Duty' : tech?.status === 'BUSY' ? 'Busy' : 'Off'}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {/* Status Dropdown Menu */}
            {isStatusMenuOpen && (
              <div className="absolute right-0 top-10 w-44 rounded-xl bg-surface-raised border border-brand-border shadow-lg p-1.5 z-50 space-y-1">
                <button
                  type="button"
                  onClick={() => handleStatusChange('AVAILABLE')}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-emerald-500/10 text-brand-primary cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Available (On Duty)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('BUSY')}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-amber-500/10 text-brand-primary cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>On Site (Busy)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('OFF_DUTY')}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 hover:bg-slate-500/10 text-brand-secondary cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span>Off Duty</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-brand-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Field Workspace */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-3.5 pb-24 sm:pb-8">
        {children}
      </main>

      {/* Bottom Thumb Navigation Bar (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface-raised/95 backdrop-blur-md border-t border-brand-border py-1.5 px-6 sm:hidden">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            type="button"
            onClick={() => onTabChange('jobs')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
              activeTab === 'jobs'
                ? 'text-brand-primary font-bold'
                : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Today's Jobs</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('completed')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
              activeTab === 'completed'
                ? 'text-brand-primary font-bold'
                : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Completed</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('profile')}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'text-brand-primary font-bold'
                : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
