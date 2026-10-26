import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { NAV_STRUCTURE } from './navStructure';
import { TopBar } from './TopBar';
import { UserRole } from '@/domain/types';

interface AppShellProps {
  role?: UserRole;
  children: (props: {
    currentRole: UserRole;
    activeItem: string;
    onNavigate: (item: string) => void;
    activeSubTab: 'overview' | 'activity' | 'alerts';
    onSubTabChange: (tab: 'overview' | 'activity' | 'alerts') => void;
  }) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ role, children }) => {
  const [activeItem, setActiveItem] = useState<string>('dashboard');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'activity' | 'alerts'>('overview');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  const currentRole: UserRole = role || 'ADMIN';

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
        onItemSelect={(item) => {
          setActiveItem(item);
          if (item === 'dashboard') {
            setActiveSubTab('overview');
          }
        }}
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
          onSubTabChange={setActiveSubTab}
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
          onSearchClick={() => {
            // Can be expanded to command palette
          }}
          onNewServiceClick={() => {
            setActiveItem('service-requests');
          }}
        />

        {/* NOTE: Do not apply CSS animations (e.g. animate-fade-in) or CSS transforms to <main>.
            Any animation/transform on <main> establishes an isolated CSS stacking context,
            which traps fixed overlay children (Drawers, Modals) below the sibling <TopBar> (z-index: 200). */}
        <main className="content-container">
          {children({
            currentRole,
            activeItem,
            onNavigate: setActiveItem,
            activeSubTab,
            onSubTabChange: setActiveSubTab,
          })}
        </main>
      </div>
    </div>
  );
};
