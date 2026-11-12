import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Mail, RefreshCw, RotateCcw, Send } from 'lucide-react';
import {
  emailApi,
  EmailConfigStatus,
  InboundEmailRecord,
  UnifiedEmailDeliveryRecord,
} from '@/services/emailApi';
import { getApiErrorMessage } from '@/services/api/client';
import { useToast } from '@/components/ui/useToast';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export const ResendDiagnosticsPanel: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<EmailConfigStatus | null>(null);
  const [deliveries, setDeliveries] = useState<UnifiedEmailDeliveryRecord[]>([]);
  const [inbound, setInbound] = useState<InboundEmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, inboundRes] = await Promise.all([
        emailApi.getAdminStatus(),
        emailApi.listInboundEmails({ limit: 20 }),
      ]);
      setConfig(statusRes.config);
      setDeliveries(statusRes.recentDeliveries || []);
      setInbound(inboundRes.emails || []);
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Email diagnostics unavailable',
        message: getApiErrorMessage(err, 'Could not fetch Resend configuration status.'),
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setSendingTest(true);
    try {
      const res = await emailApi.sendTestEmail(testEmail.trim());
      showToast({
        type: 'success',
        title: 'Diagnostic email dispatched',
        message: res.sandboxRedirected
          ? `Sandbox override active — delivered to ${res.effectiveRecipient}`
          : `Sent to ${res.effectiveRecipient} (Message ID: ${res.delivery.provider_message_id || 'pending'})`,
      });
      await loadAll();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Test email failed',
        message: getApiErrorMessage(err, 'Resend rejected test email.'),
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await emailApi.retryDelivery(id);
      showToast({ type: 'success', title: 'Delivery re-queued', message: 'Retried email dispatch.' });
      await loadAll();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Retry failed',
        message: getApiErrorMessage(err, 'Could not retry email delivery.'),
      });
    }
  };

  const handleInboundStatus = async (id: string, status: 'READ' | 'ARCHIVED') => {
    try {
      await emailApi.updateInboundStatus(id, status);
      await loadAll();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not update message',
        message: getApiErrorMessage(err, 'Failed to update inbound email status.'),
      });
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <CardTitle>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Mail size={18} /> Email &amp; Resend Health
              </span>
            </CardTitle>
            <Button size="sm" variant="secondary" isLoading={loading} onClick={() => void loadAll()}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {config ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {config.sandboxMode && (
                <div
                  role="note"
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--color-warning-bg)',
                    color: 'var(--color-warning-text)',
                    fontSize: 13,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Resend Sandbox Active ({config.fromEmail}):</strong> Resend sandbox mode can only deliver to your verified Resend account email unless you verify a custom sending domain and update <code>RESEND_FROM_EMAIL</code> on Render. Customer replies arrive at <code>{config.replyTo}</code> via Reply-To.
                  </div>
                </div>
              )}

              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  margin: 0,
                }}
              >
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Resend API Key</dt>
                  <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>
                    {config.configured ? 'Configured' : 'Missing (dev-log fallback in dev)'}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Sender Address</dt>
                  <dd style={{ margin: '4px 0 0' }}><code>{config.fromEmail}</code></dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Reply-To Inbox</dt>
                  <dd style={{ margin: '4px 0 0' }}><code>{config.replyTo}</code></dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Webhook Verification</dt>
                  <dd style={{ margin: '4px 0 0' }}>
                    {config.webhookConfigured ? 'Enabled (Svix signed)' : 'Secret not set'}
                  </dd>
                </div>
              </dl>

              <form
                onSubmit={(e) => void handleSendTest(e)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  paddingTop: 12,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <Input
                    label="Send Diagnostic Test Email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" isLoading={sendingTest} leftIcon={<Send size={14} />}>
                  Send Test Email
                </Button>
              </form>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              {loading ? 'Loading Resend diagnostics…' : 'Diagnostics unavailable.'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Email Deliveries ({deliveries.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {deliveries.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              No outbox records yet. Send a test email, report, quotation, or invoice to track live statuses here.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {deliveries.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700 }}>{d.entity_type}</span>
                      <span>·</span>
                      <strong>{d.recipient_email}</strong>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            d.status === 'DELIVERED' || d.status === 'SENT'
                              ? 'var(--color-success-bg)'
                              : d.status === 'FAILED' || d.status === 'BOUNCED' || d.status === 'COMPLAINED'
                              ? 'var(--color-error-bg)'
                              : 'var(--bg-surface-subtle)',
                          color:
                            d.status === 'DELIVERED' || d.status === 'SENT'
                              ? 'var(--color-success-text)'
                              : d.status === 'FAILED' || d.status === 'BOUNCED' || d.status === 'COMPLAINED'
                              ? 'var(--color-error-text)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {d.status}
                      </span>
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {d.subject} · {new Date(d.created_at).toLocaleString('en-IN')}
                    </span>
                    {d.last_error && (
                      <span style={{ color: 'var(--color-error-text)' }}>{d.last_error}</span>
                    )}
                  </div>
                  {['FAILED', 'BOUNCED', 'DELAYED'].includes(d.status) && (
                    <Button size="sm" variant="secondary" onClick={() => void handleRetry(d.id)}>
                      <RotateCcw size={13} /> Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Inbox size={18} /> Customer Inbound Replies ({inbound.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {inbound.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              No inbound webhook replies captured yet. Currently Mode A routes replies directly to <code>{config?.replyTo || 'extremess0121@gmail.com'}</code>; when you enable Resend Inbound MX on a custom domain, replies also appear here.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {inbound.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    display: 'grid',
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{msg.customers?.name ? `${msg.customers.name} (${msg.from_email})` : msg.from_email}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {new Date(msg.received_at).toLocaleString('en-IN')} · {msg.status}
                      </span>
                    </div>
                    {msg.status === 'UNREAD' && (
                      <Button size="sm" variant="ghost" onClick={() => void handleInboundStatus(msg.id, 'READ')}>
                        <CheckCircle2 size={13} /> Mark Read
                      </Button>
                    )}
                  </div>
                  <div style={{ fontWeight: 600 }}>{msg.subject || '(No subject)'}</div>
                  {msg.text_body && (
                    <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                      {msg.text_body.slice(0, 400)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
