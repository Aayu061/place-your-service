import React, { useMemo } from 'react';
import { Activity, Bell, Boxes, ClipboardList, Package, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { sectionStyle, toolbarStyle, WorkspaceProps } from './operations/workspaceShared';
import { PartCatalog } from './operations/PartCatalogPanel';
import { InventoryLedger } from './operations/InventoryLedgerPanel';
import { PaymentsWorkspace } from './operations/PaymentsWorkspacePanel';
import { NotificationsWorkspace } from './operations/NotificationsWorkspacePanel';
import { ActivityLogWorkspace } from './operations/ActivityLogWorkspacePanel';
export { SettingsWorkspace } from './operations/SettingsWorkspacePanel';

export const OperationalWorkspace: React.FC<WorkspaceProps> = ({ moduleId, role, onNavigate }) => {
  const content = useMemo(() => {
    switch (moduleId) {
      case 'parts':
        return <PartCatalog />;
      case 'inventory':
        return <InventoryLedger />;
      case 'payments':
        return <PaymentsWorkspace onNavigate={onNavigate} />;
      case 'notifications':
        return <NotificationsWorkspace moduleId={moduleId} role={role} onNavigate={onNavigate} />;
      case 'activity-logs':
        return <ActivityLogWorkspace />;
      default:
        return null;
    }
  }, [moduleId, role, onNavigate]);

  const title: Record<string, string> = {
    parts: 'Parts Catalog',
    inventory: 'Inventory Ledger',
    payments: 'Payment Records',
    notifications: 'Notifications & Operational Alerts',
    'activity-logs': 'Activity Log',
  };

  const icon =
    moduleId === 'parts' ? (
      <Package size={20} />
    ) : moduleId === 'inventory' ? (
      <Boxes size={20} />
    ) : moduleId === 'payments' ? (
      <Wallet size={20} />
    ) : moduleId === 'notifications' ? (
      <Bell size={20} />
    ) : (
      <Activity size={20} />
    );

  return (
    <section style={sectionStyle} aria-labelledby="operational-workspace-title">
      <div style={toolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--color-brand)' }}>{icon}</span>
          <div>
            <h1 id="operational-workspace-title" style={{ margin: 0, fontSize: 'var(--text-xl)' }}>
              {title[moduleId] || 'Operations'}
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Connected to the authenticated PYS operations API.
            </p>
          </div>
        </div>
        {moduleId === 'inventory' && (
          <Button size="sm" variant="ghost" leftIcon={<ClipboardList size={14} />} onClick={() => onNavigate('parts')}>
            Part catalog
          </Button>
        )}
        {moduleId === 'parts' && (
          <Button size="sm" variant="ghost" leftIcon={<Boxes size={14} />} onClick={() => onNavigate('inventory')}>
            Inventory ledger
          </Button>
        )}
      </div>
      {content}
    </section>
  );
};
