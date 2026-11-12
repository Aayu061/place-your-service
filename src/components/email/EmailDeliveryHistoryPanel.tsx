import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Mail, RefreshCw, RotateCcw } from 'lucide-react';
import {
  emailApi,
  EmailConfigStatus,
  EmailDeliveryStatus,
  EmailEntityType,
  UnifiedEmailDeliveryRecord,
} from '@/services/emailApi';
import { getApiErrorMessage } from '@/services/api/client';
import { Button } from '@/components/ui/Button';

interface EmailDeliveryHistoryPanelProps {
  entityType: EmailEntityType;
  entityId: string;
  refreshSignal?: number;
}

const STATUS_STYLE: Record<EmailDeliveryStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Queued', bg: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)' },
  SENDING: { label: 'Sending', bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  SENT: { label: 'Sent', bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  DELIVERED: { label: 'Delivered', bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  DELAYED: { label: 'Delayed', bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  BOUNCED: { label: 'Bounced', bg: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
  COMPLAINED: { label: 'Spam Complaint', bg: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
  FAILED: { label: 'Failed', bg: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
};

export const EmailDeliveryHistoryPanel: React.FC<EmailDeliveryHistoryPanelProps> = ({
  entityType,
  entityId,
  refreshSignal = 0,
}) => {
  const [deliveries, setDeliveries] = useState<UnifiedEmailDeliveryRecord[]>([]);
  const [config, setConfig] = useState<EmailConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await emailApi.listDeliveries({ entityType, entityId, limit: 15 });
      setDeliveries(res.deliveries || []);
      setConfig(res.config || null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load email delivery log.'));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setError(null);
    try {
      await emailApi.retryDelivery(id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Retry dispatch failed.'));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface-subtle)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}>
          <Mail size={14} />
          <span>Email Delivery Log ({deliveries.length})</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} isLoading={loading}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      {config?.sandboxMode && (
        <div
          role="note"
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '8px 10px',
            borderRadius: 6,
            background: 'var(--color-warning-bg)',
            color: 'var(--color-warning-text)',
            fontSize: 12,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Resend Sandbox Active ({config.fromEmail}):</strong> External customer addresses require a verified domain in Resend.
            {config.sandboxOverrideTo
              ? ` Test sends are currently redirected to ${config.sandboxOverrideTo}.`
              : ' Only your verified Resend owner email will accept sandbox sends.'}
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--color-error-text)' }} role="alert">
          {error}
        </div>
      )}

      {deliveries.length === 0 && !loading ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          No Resend delivery attempts recorded for this record yet.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {deliveries.map((d) => {
            const st = STATUS_STYLE[d.status] || STATUS_STYLE.PENDING;
            const canRetry = ['FAILED', 'BOUNCED', 'DELAYED'].includes(d.status);
            return (
              <div
                key={d.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'grid', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: st.bg,
                        color: st.color,
                      }}
                    >
                      {st.label}
                    </span>
                    <strong>{d.recipient_email}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                      · {new Date(d.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {d.last_error && (
                    <span style={{ color: 'var(--color-error-text)' }}>{d.last_error}</span>
                  )}
                  {d.delivered_at && (
                    <span style={{ color: 'var(--color-success-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Delivered at {new Date(d.delivered_at).toLocaleString('en-IN')}
                    </span>
                  )}
                  {!d.delivered_at && d.sent_at && (
                    <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> Dispatched via {d.transport || 'resend'} ({d.provider_message_id || 'pending id'})
                    </span>
                  )}
                </div>
                {canRetry && (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={retryingId === d.id}
                    onClick={() => void handleRetry(d.id)}
                  >
                    <RotateCcw size={12} /> Retry
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

