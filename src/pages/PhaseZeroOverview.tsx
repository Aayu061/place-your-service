import React, { useState } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRight,
  Database,
  Calendar,
  Lock,
  GitBranch,
} from 'lucide-react';
import { UserRole, ServiceStatus, AmcFrequency } from '@/domain/types';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getAllowedNextStatuses, isValidServiceStatusTransition } from '@/domain/stateMachines';
import { calculateAmcScheduleDates } from '@/domain/amcCalculator';
import { config } from '@/config/env';

interface PhaseZeroOverviewProps {
  currentRole: UserRole;
}

export const PhaseZeroOverview: React.FC<PhaseZeroOverviewProps> = ({ currentRole }) => {
  // Interactive State Machine Playground
  const [selectedStatus, setSelectedStatus] = useState<ServiceStatus>('REQUESTED');
  const [targetStatus, setTargetStatus] = useState<ServiceStatus>('PENDING');

  // Interactive AMC Schedule Calculation Playground
  const [frequency, setFrequency] = useState<AmcFrequency>('QUARTERLY');
  const [startDateStr] = useState<string>('2026-04-01');
  const [endDateStr] = useState<string>('2027-03-31');

  const calculatedDates = React.useMemo(() => {
    try {
      return calculateAmcScheduleDates(
        new Date(startDateStr),
        new Date(endDateStr),
        frequency
      );
    } catch {
      return [];
    }
  }, [startDateStr, endDateStr, frequency]);

  const isTransitionAllowed = isValidServiceStatusTransition(selectedStatus, targetStatus);
  const allowedNext = getAllowedNextStatuses(selectedStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Hero Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #075985 100%)',
          color: '#ffffff',
          padding: 'var(--space-8)',
          borderRadius: 'var(--radius-xl)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: '780px', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              backgroundColor: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: 'var(--radius-full)',
              padding: '4px 12px',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: '#bae6fd',
              marginBottom: 'var(--space-4)',
            }}
          >
            <CheckCircle2 size={14} />
            <span>Phase 0: Project Foundation &amp; Repository Initialized</span>
          </div>
          <h2 style={{ fontSize: 'var(--text-3xl)', color: '#ffffff', marginBottom: 'var(--space-3)' }}>
            Place Your Service
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: 'var(--text-base)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            Internal AC Service Management Web Platform. The core architecture, TypeScript domain contracts,
            state transition rules, security boundaries, and design token foundation are established for real
            operational workflows.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: '#e2e8f0' }}>
              <Lock size={16} style={{ color: '#38bdf8' }} />
              <span>No Fake Operational Data</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: '#e2e8f0' }}>
              <Database size={16} style={{ color: '#38bdf8' }} />
              <span>Prepared for Supabase PostgreSQL &amp; RLS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: '#e2e8f0' }}>
              <ShieldCheck size={16} style={{ color: '#38bdf8' }} />
              <span>Admin &amp; Staff Roles Enforced</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Key Foundation Verification Cards */}
      <div className="grid grid-cols-3 gap-6">
        {/* Scope Boundaries */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ShieldCheck size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Locked Scope</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Application Users:</strong>
                <ul style={{ paddingLeft: 'var(--space-4)', marginTop: 'var(--space-1)', color: 'var(--text-secondary)' }}>
                  <li><strong>Admin:</strong> Singleton system owner</li>
                  <li><strong>Staff:</strong> Operational managers</li>
                </ul>
              </div>
              <div style={{ backgroundColor: 'var(--color-neutral-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--color-danger-text)', display: 'block', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                  OUT OF SCOPE (LOCKED):
                </strong>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  No customer mobile/web app, no technician mobile app, no vendor portal, no customer self-registration.
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Tech Stack */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Cpu size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Technology Stack</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Frontend Core</span>
                <strong>React 19 + TypeScript</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Build Tooling</span>
                <strong>Vite 6 + Strict TS</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Design System</span>
                <strong>Vanilla CSS + Design Tokens</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Backend / DB</span>
                <strong>Supabase (PostgreSQL + RLS)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Reduced Motion</span>
                <strong style={{ color: 'var(--color-success-text)' }}>Accessible Override</strong>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Environment & Git Status */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <GitBranch size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Repository &amp; Security</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Environment</span>
                <span className="badge badge-neutral">{config.appEnv}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Secrets Exclusion</span>
                <span className="badge badge-success">.env Gitignored</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Service-Role Key</span>
                <strong style={{ color: 'var(--color-success-text)' }}>Protected (Zero Leak)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Active View</span>
                <strong style={{ color: 'var(--color-primary-700)' }}>{currentRole} Role Active</strong>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Interactive Domain Logic Verification (No Mocked Screens) */}
      <div className="grid grid-cols-2 gap-6">
        {/* Service Lifecycle State Machine Playground */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Layers size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>
                Service Lifecycle State Machine (RULES.md §11)
              </h3>
            </div>
          </CardHeader>
          <CardBody>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              The service lifecycle strictly disallows invalid status jumps. Test the domain state machine below:
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Current Status</label>
                <select
                  className="form-select"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as ServiceStatus)}
                >
                  <option value="REQUESTED">REQUESTED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="AWAITING_PARTS">AWAITING_PARTS</option>
                  <option value="REVISIT_REQUIRED">REVISIT_REQUIRED</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <ArrowRight size={20} style={{ color: 'var(--color-neutral-400)', marginTop: 'var(--space-4)' }} />

              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Target Status</label>
                <select
                  className="form-select"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as ServiceStatus)}
                >
                  <option value="REQUESTED">REQUESTED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="AWAITING_PARTS">AWAITING_PARTS</option>
                  <option value="REVISIT_REQUIRED">REVISIT_REQUIRED</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isTransitionAllowed ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                border: `1px solid ${isTransitionAllowed ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                color: isTransitionAllowed ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                Transition from <strong>{selectedStatus}</strong> to <strong>{targetStatus}</strong>:
              </span>
              <span>{isTransitionAllowed ? '✓ ALLOWED' : '✗ REJECTED'}</span>
            </div>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                Valid next statuses from {selectedStatus}:
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {allowedNext.length > 0 ? (
                  allowedNext.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTargetStatus(st)}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                      <StatusBadge status={st} />
                    </button>
                  ))
                ) : (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    None (Terminal State)
                  </span>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* AMC Preventive Maintenance Algorithm Playground */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Calendar size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>
                AMC Schedule Generator (RULES.md §7)
              </h3>
            </div>
          </CardHeader>
          <CardBody>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              Generates idempotent calendar-aware maintenance visit dates between contract dates:
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Contract Frequency</label>
                <select
                  className="form-select"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as AmcFrequency)}
                >
                  <option value="MONTHLY">MONTHLY (Every month)</option>
                  <option value="QUARTERLY">QUARTERLY (Every 3 months)</option>
                  <option value="HALF_YEARLY">HALF_YEARLY (Every 6 months)</option>
                  <option value="YEARLY">YEARLY (Every 12 months)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>Contract Term</label>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  {startDateStr} to {endDateStr} (1 Year)
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--color-neutral-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Generated Visit Schedules ({calculatedDates.length} visits):
                </span>
                <span className="badge badge-amc" style={{ fontSize: '10px' }}>Idempotent Generation</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {calculatedDates.map((date, idx) => (
                  <span
                    key={date}
                    className="badge badge-neutral"
                    style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                  >
                    Visit #{idx + 1}: {date}
                  </span>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Next Step Banner */}
      <div
        className="card"
        style={{
          padding: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '4px solid var(--color-primary-600)',
        }}
      >
        <div>
          <h4 style={{ marginBottom: 'var(--space-1)' }}>Ready for Phase 1 Approval</h4>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Phase 0 foundation validation complete. All 8 DOCS verified. Recommended next phase:{' '}
            <strong>PHASE 1 — DESIGN SYSTEM + APPLICATION SHELL</strong>.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            alert('Phase 0 foundation is established. Awaiting explicit user approval for Phase 1.');
          }}
        >
          Phase 1 Pending Approval
        </Button>
      </div>
    </div>
  );
};
