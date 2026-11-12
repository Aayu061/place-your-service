import React, { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/useToast';
import { ResendDiagnosticsPanel } from '@/components/email/ResendDiagnosticsPanel';
import { dateOnly, formGridStyle, labelStyle, sectionStyle } from './workspaceShared';

export const SettingsWorkspace: React.FC = () => {
  const { showToast } = useToast();
  const [health, setHealth] = useState<{
    service: string;
    status: string;
    environment: string;
    timestamp: string;
    database?: { connected: boolean; latencyMs?: number };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await apiClient.get('/health/ready'));
    } catch (error) {
      setHealth(null);
      showToast({
        type: 'error',
        title: 'Readiness check failed',
        message: error instanceof ApiError ? error.message : 'The server did not return a readiness state.',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section style={sectionStyle}>
      <div>
        <h1 style={{ margin: 0 }}>System status &amp; Email Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Live API readiness, Resend delivery diagnostics, and customer reply inbox.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Service readiness</CardTitle>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div role="status">Checking service…</div>
          ) : health ? (
            <dl style={formGridStyle}>
              <div>
                <dt style={labelStyle}>API</dt>
                <dd>
                  {health.service} · {health.status}
                </dd>
              </div>
              <div>
                <dt style={labelStyle}>Environment</dt>
                <dd>{health.environment}</dd>
              </div>
              <div>
                <dt style={labelStyle}>Database</dt>
                <dd>{health.database?.connected ? `Connected · ${health.database.latencyMs} ms` : 'Not connected'}</dd>
              </div>
              <div>
                <dt style={labelStyle}>Checked</dt>
                <dd>{dateOnly(health.timestamp)}</dd>
              </div>
            </dl>
          ) : (
            <p>Service readiness could not be loaded.</p>
          )}
          <Button variant="secondary" onClick={() => void refresh()} isLoading={loading}>
            Refresh status
          </Button>
        </CardBody>
      </Card>
      <ResendDiagnosticsPanel />
    </section>
  );
};

