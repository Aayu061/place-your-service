import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { operationsApi, PageResult, NotificationRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { dateOnly, hintStyle, sectionStyle, toolbarStyle, WorkspaceProps } from './workspaceShared';

export const NotificationsWorkspace: React.FC<WorkspaceProps> = ({ role, onNavigate }) => {
  const { showToast } = useToast();
  const [page, setPage] = useState<PageResult<NotificationRecord> | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await operationsApi.listNotifications({ page: 1, pageSize: 100, unreadOnly: String(unreadOnly) }));
    } catch (error) {
      showToast({ type: 'error', title: 'Notifications unavailable', message: error instanceof Error ? error.message : 'Could not load notifications.' });
    } finally {
      setLoading(false);
    }
  }, [showToast, unreadOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await operationsApi.generateNotifications();
      showToast({ type: 'success', title: 'Alerts checked', message: `${result.created} new notification${result.created === 1 ? '' : 's'} added.` });
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Alert generation failed', message: error instanceof Error ? error.message : 'Could not check operational alerts.' });
    } finally {
      setGenerating(false);
    }
  };

  const markRead = async (notification: NotificationRecord) => {
    try {
      await operationsApi.markNotificationRead(notification.id, !notification.is_read);
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Update failed', message: error instanceof Error ? error.message : 'Could not update this notification.' });
    }
  };

  const markAllRead = async () => {
    const unreadItems = page?.items.filter((item) => !item.is_read) || [];
    if (!unreadItems.length) return;
    setMarkingAll(true);
    try {
      await Promise.all(unreadItems.map((item) => operationsApi.markNotificationRead(item.id, true)));
      showToast({ type: 'success', title: 'All alerts marked as read', message: `${unreadItems.length} alerts updated.` });
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Update failed', message: error instanceof Error ? error.message : 'Could not mark all alerts as read.' });
    } finally {
      setMarkingAll(false);
    }
  };

  const navigateToEntity = (notification: NotificationRecord) => {
    const route: Record<string, string> = {
      customer: 'customers',
      service_request: 'service-requests',
      service_schedule: 'service-schedule',
      service_report: 'service-reports',
      amc_contract: 'amc',
      part: 'inventory',
      payment: 'payments',
    };
    if (notification.entity_type && route[notification.entity_type]) {
      onNavigate(route[notification.entity_type]);
    }
  };

  const hasUnread = page?.items.some((item) => !item.is_read);

  return (
    <div style={sectionStyle}>
      <div style={toolbarStyle}>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Centralized operational alerts for scheduled service visits, contract renewals, inventory thresholds, and payments.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} isLoading={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
          {hasUnread && (
            <Button size="sm" variant="ghost" leftIcon={<CheckCheck size={14} />} isLoading={markingAll} onClick={markAllRead}>
              Mark all read
            </Button>
          )}
          {role === 'ADMIN' && (
            <Button size="sm" leftIcon={<Bell size={14} />} isLoading={generating} onClick={generate}>
              Check alerts now
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div role="status">Loading notifications & alerts…</div>
      ) : page?.items.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {page.items.map((notification) => (
            <Card
              key={notification.id}
              style={{ borderLeft: `4px solid ${notification.is_read ? 'var(--border-default)' : notification.type === 'ALERT' ? 'var(--color-error-solid)' : 'var(--color-warning-solid)'}` }}
            >
              <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>{notification.title}</strong>
                    {!notification.is_read && <span className="badge badge-brand">New</span>}
                  </div>
                  <p style={{ margin: '6px 0' }}>{notification.message}</p>
                  <span style={hintStyle}>
                    {notification.category.replace(/_/g, ' ')} · {dateOnly(notification.created_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <Button size="sm" variant="ghost" onClick={() => void markRead(notification)}>
                    {notification.is_read ? 'Mark unread' : 'Mark read'}
                  </Button>
                  {notification.entity_id && (
                    <Button size="sm" variant="secondary" onClick={() => navigateToEntity(notification)}>
                      Open record
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="When operational work needs attention, generated alerts will appear here." />
      )}
    </div>
  );
};

