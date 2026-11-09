import React, { useCallback, useState, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  Shield,
  LogOut,
  Plus,
  Clock,
  Download,
  Sun,
  Moon,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Dropdown, DropdownItem, DropdownDivider, DropdownHeader } from '@/components/ui/Dropdown';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { operationsApi } from '@/services/operationsApi';
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog';
import { useToast } from '@/components/ui/useToast';

interface TopBarProps {
  currentRole: UserRole;
  onRoleChange?: (role: UserRole) => void;
  activeItemTitle: string;
  activeItem?: string;
  activeSubTab?: 'overview' | 'activity';
  onSubTabChange?: (tab: 'overview' | 'activity') => void;
  onOpenMobileSidebar: () => void;
  onSearchClick?: () => void;
  onNewServiceClick?: () => void;
  onNavigate?: (item: string, params?: Record<string, string>) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRole,
  activeItemTitle,
  activeItem = 'dashboard',
  activeSubTab = 'overview',
  onSubTabChange,
  onOpenMobileSidebar,
  onSearchClick,
  onNewServiceClick,
  onNavigate,
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  const displayName = user?.fullName || (currentRole === 'ADMIN' ? 'Admin User' : 'Staff Member');
  const displayEmail = user?.email || 'authenticated-session@pys.internal';
  const operatorInitial = displayName.charAt(0).toUpperCase();

  // Real-time live digital clock in Island TopBar
  const [timeString, setTimeString] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).replace(/,/g, ' ·')
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    onSearchClick?.();
  }, [onSearchClick]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [openSearch]);

  useEffect(() => {
    let current = true;
    operationsApi.listNotifications({ unreadOnly: 'true', page: 1, pageSize: 1 })
      .then((result) => { if (current) setUnreadCount(result.total); })
      .catch(() => { if (current) setUnreadCount(0); });
    return () => { current = false; };
  }, [activeItem]);

  const exportKinds: Record<string, 'customers' | 'schedules' | 'service-reports' | 'amc-expiry'> = {
    customers: 'customers', 'service-schedule': 'schedules', 'service-reports': 'service-reports', amc: 'amc-expiry',
  };
  const exportKind = exportKinds[activeItem];
  const downloadExport = async () => {
    if (!exportKind) return;
    const params = new URLSearchParams(window.location.search);
    const filters = Object.fromEntries(['from', 'to', 'status', 'customerId', 'search'].map((key) => [key, params.get(key) || undefined]));
    setExporting(true);
    try {
      const blob = await operationsApi.exportXlsx(exportKind, filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pys-${exportKind}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      showToast({ type: 'success', title: 'Export downloaded', message: 'The workbook reflects the filters in this view.' });
    } catch (error) {
      showToast({ type: 'error', title: 'Export failed', message: error instanceof Error ? error.message : 'Could not create the workbook.' });
    } finally { setExporting(false); }
  };

  return (
    <>
      <header className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
          {/* Left: Mobile Toggle + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label="Open sidebar navigation"
              className="mobile-menu-trigger"
              style={{
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Menu size={20} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeItemTitle}
              </h1>
            </div>
          </div>

          {/* Center: Live Digital Clock & Search Bar (Desktop) */}
          <div className="search-container-desktop" style={{ display: 'none', flex: 1, maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--bg-surface-muted, rgba(20, 36, 28, 0.04))',
                  border: '1px solid var(--border-default, var(--border-card-hairline))',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px rgba(168, 72, 28, 0.6)',
                  }}
                />
                <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                <span>{timeString || 'Live'}</span>
              </div>

              <button
                type="button"
                onClick={openSearch}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 14px',
                  backgroundColor: 'var(--bg-surface-muted, rgba(20, 36, 28, 0.04))',
                  border: '1px solid var(--border-default, var(--border-card-hairline))',
                  borderRadius: '9999px',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={14} />
                  <span>Search records...</span>
                </div>
                <kbd
                  style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-card-hairline)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  ⌘K
                </kbd>
              </button>
            </div>
          </div>

          {/* Right Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Mobile search icon */}
            <button
              type="button"
              className="pys-icon-circle-btn mobile-search-trigger"
              aria-label="Search records"
              onClick={openSearch}
            >
              <Search size={17} />
            </button>

            {/* Notifications Bell */}
            <button
              type="button"
              className="pys-icon-circle-btn"
              aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              onClick={() => onNavigate?.('notifications')}
              style={{ position: 'relative' }}
              title="Notifications & Operational Alerts"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: 2,
                    top: 2,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 999,
                    background: 'var(--color-error-solid)',
                    color: 'white',
                    fontSize: 9,
                    lineHeight: '15px',
                    textAlign: 'center',
                    padding: '0 3px',
                    fontWeight: 700,
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              className="pys-icon-circle-btn"
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            {/* Excel Export */}
            {exportKind && (
              <button
                type="button"
                className="pys-icon-circle-btn"
                aria-label="Download Excel export"
                title="Download Excel export"
                onClick={() => void downloadExport()}
                disabled={exporting}
              >
                {exporting ? <span className="animate-spin" aria-label="Preparing export" /> : <Download size={17} />}
              </button>
            )}

            {/* Quick Action + New Service */}
            <button
              type="button"
              onClick={onNewServiceClick}
              className="pys-btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.8rem', gap: '6px' }}
              title="Create new service request"
            >
              <Plus size={14} />
              <span className="cta-label-desktop">New Service</span>
            </button>

            <Badge variant={currentRole === 'ADMIN' ? 'brand' : 'neutral'}>
              <Shield size={12} />
              <span>{currentRole}</span>
            </Badge>

            {/* Profile Avatar Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  aria-label="User Profile"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {operatorInitial}
                </button>
              }
            >
              <DropdownHeader>Active Session</DropdownHeader>
              <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {displayEmail}
                </div>
              </div>
              <DropdownDivider />
              <DropdownItem icon={<LogOut size={14} />} onClick={() => logout()}>
                Sign Out
              </DropdownItem>
            </Dropdown>
          </div>
        </div>

        {/* Row 2: Segmented Pill Tabs (When activeItem is dashboard) */}
        {activeItem === 'dashboard' && (
          <div
            className="pys-pill-tabs-track"
            role="tablist"
            aria-label="Dashboard View Modes"
            style={{ maxWidth: 320, margin: '10px 0 2px' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'overview'}
              className={`pys-pill-tab ${activeSubTab === 'overview' ? 'active' : ''}`}
              onClick={() => onSubTabChange?.('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'activity'}
              className={`pys-pill-tab ${activeSubTab === 'activity' ? 'active' : ''}`}
              onClick={() => onSubTabChange?.('activity')}
            >
              Service Activity
            </button>
          </div>
        )}
      </header>
      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={(item, params) => onNavigate?.(item, params)} />
    </>
  );
};


