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
  }) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ role, children }) => {
  const [activeItem, setActiveItem] = useState<string>('dashboard');
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
        onItemSelect={setActiveItem}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      <div className="main-wrapper">
        <TopBar
          currentRole={currentRole}
          activeItemTitle={getActiveItemTitle()}
          onOpenMobileSidebar={() => setIsMobileOpen(true)}
          onSearchClick={() => {
            // Can be expanded to command palette in future phases
          }}
        />

        <main className="content-container animate-fade-in">
          {children({
            currentRole,
            activeItem,
            onNavigate: setActiveItem,
          })}
        </main>
      </div>
    </div>
  );
};
