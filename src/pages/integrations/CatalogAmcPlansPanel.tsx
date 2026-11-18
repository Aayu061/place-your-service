// Live AMC plan prices from the shared service & AMC catalog (GET /api/v1/catalog).
// The same catalog feeds the Extreme Sales & Services website, so what is shown
// here is exactly what customers see — no hard-coded prices.

import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { catalogService, type CatalogAmcPlan, type CatalogPrice } from '@/services/intakeService';
import { getApiErrorMessage } from '@/services/api/client';
import { formatCurrency } from '@/utils/formatters';

const RATE_ROWS: { key: keyof CatalogAmcPlan['rates']; label: string }[] = [
  { key: 'splitSmall', label: 'Split, up to 1 ton' },
  { key: 'splitLarge', label: 'Split, 1.5 – 2.2 ton' },
  { key: 'windowSmall', label: 'Window, up to 1 ton' },
  { key: 'windowLarge', label: 'Window, 1.5 ton +' },
  { key: 'flat', label: 'Flat rate' },
];

const RateLine: React.FC<{ label: string; price: CatalogPrice }> = ({ label, price }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-xs)' }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span>
      <strong style={{ color: 'var(--color-brand)' }}>{formatCurrency(price.total)}</strong>
      <span style={{ color: 'var(--text-muted)' }}> incl. GST</span>
    </span>
  </div>
);

export const CatalogAmcPlansPanel: React.FC<{ onOpenInbox?: () => void }> = ({ onOpenInbox }) => {
  const [plans, setPlans] = useState<CatalogAmcPlan[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await catalogService.getPublic();
      setPlans(catalog.amcPlans);
      setVersion(catalog.version);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load the AMC catalog.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <CardTitle>AMC plan prices (live catalog)</CardTitle>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            Read from the shared PYS catalog that also feeds the ESS website{version !== null ? ` · catalog version ${version}` : ''}.
            AMC requests from the website arrive in the Approval Inbox.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onOpenInbox && (
            <Button variant="secondary" size="sm" leftIcon={<Inbox size={14} />} onClick={onOpenInbox}>
              Open Approval Inbox
            </Button>
          )}
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => void load()} isLoading={loading}>
            Reload
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {loading && !plans ? (
          <div role="status" aria-label="Loading AMC plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height="120px" borderRadius="var(--radius-lg)" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {error}
          </div>
        ) : !plans || plans.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No public AMC plans in the catalog yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            {plans.map((plan) => {
              const rows = RATE_ROWS.filter((r) => plan.rates?.[r.key]);
              return (
                <div
                  key={plan.code}
                  data-testid="catalog-amc-plan"
                  style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{plan.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{plan.planCode || plan.code}</div>
                  {plan.coverageSummary && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{plan.coverageSummary}</div>}
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Price on request</div>
                  ) : (
                    rows.map((r) => <RateLine key={r.key} label={r.label} price={plan.rates[r.key] as CatalogPrice} />)
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
