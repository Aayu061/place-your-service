import React, { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { NAV_STRUCTURE } from './navStructure';
import { TopBar } from './TopBar';
import { UserRole } from '@/domain/types';

interface AppShellProps {
  role?: UserRole;
  children: (props: {
    currentRole: UserRole;
    activeItem: string;
    onNavigate: (item: string, params?: Record<string, string>) => void;
    activeSubTab: 'overview' | 'activity';
    onSubTabChange: (tab: 'overview' | 'activity') => void;
  }) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ role, children }) => {
  const currentRole: UserRole = role || 'ADMIN';
  const canVisit = useCallback((item: string) => NAV_STRUCTURE.some((group) => group.items.some((entry) =>
    entry.id === item && (!entry.adminOnly || currentRole === 'ADMIN') && (!group.adminOnly || currentRole === 'ADMIN')
  )), [currentRole]);
  const readWorkspaceFromUrl = useCallback(() => {
    const candidate = new URLSearchParams(window.location.search).get('workspace') || 'dashboard';
    return canVisit(candidate) ? candidate : 'dashboard';
  }, [canVisit]);
  const [activeItem, setActiveItem] = useState<string>(readWorkspaceFromUrl);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'activity'>('overview');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    const syncFromHistory = () => {
      setActiveItem(readWorkspaceFromUrl());
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'activity' || tab === 'overview') setActiveSubTab(tab);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, [readWorkspaceFromUrl]);

  const navigate = useCallback((item: string, params?: Record<string, string>) => {
    if (!canVisit(item)) return;
    setActiveItem(item);
    if (item === 'dashboard') setActiveSubTab('overview');
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', item);
    url.searchParams.delete('tab');
    for (const key of ['recordId', 'recordType', 'search', 'status', 'from', 'to', 'customerId', 'action']) url.searchParams.delete(key);
    if (params) for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    window.history.pushState({ workspace: item }, '', `${url.pathname}${url.search}${url.hash}`);
  }, [canVisit]);

  const changeSubTab = useCallback((tab: 'overview' | 'activity') => {
    setActiveSubTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', 'dashboard');
    url.searchParams.set('tab', tab);
    window.history.replaceState({ workspace: 'dashboard', tab }, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // Compute active item title
  const getActiveItemTitle = () => {
    for (const group of NAV_STRUCTURE) {
      for (const item of group.items) {
        if (item.id === activeItem) return item.label;
      }
    }
    return 'Dashboard';
  };

  return (
    <div className="app-shell">
      <Sidebar
        currentRole={currentRole}
        activeItem={activeItem}
        onItemSelect={(item) => navigate(item)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className="main-wrapper">
        <TopBar
          currentRole={currentRole}
          activeItemTitle={getActiveItemTitle()}
          activeItem={activeItem}
          activeSubTab={activeSubTab}
          onSubTabChange={changeSubTab}
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
          onNavigate={navigate}
          onSearchClick={() => {}}
          onNewServiceClick={() => {
            navigate('service-requests', { action: 'new' });
          }}
        />

        {/* NOTE: Do not apply CSS animations (e.g. animate-fade-in) or CSS transforms to <main>.
            Any animation/transform on <main> establishes an isolated CSS stacking context,
            which traps fixed overlay children (Drawers, Modals) below the sibling <TopBar> (z-index: 200). */}
        <main className="content-container">
          {children({
            currentRole,
            activeItem,
            onNavigate: navigate,
            activeSubTab,
            onSubTabChange: setActiveSubTab,
          })}
        </main>
      </div>
    </div>
  );
};
