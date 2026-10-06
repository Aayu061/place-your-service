import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { NAV_STRUCTURE } from './navStructure';
import { TopBar } from './TopBar';
import { UserRole } from '@/domain/types';

interface AppShellProps {
  children: (props: {
    currentRole: UserRole;
    activeItem: string;
    onNavigate: (item: string) => void;
  }) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [activeItem, setActiveItem] = useState<string>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

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
          onRoleChange={setCurrentRole}
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
