import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { UserRole } from '@/domain/types';

interface AppShellProps {
  children: (props: { currentRole: UserRole }) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('ADMIN');
  const [activeItem, setActiveItem] = useState<string>('dashboard');

  return (
    <div className="app-shell">
      <Sidebar
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        activeItem={activeItem}
        onItemSelect={setActiveItem}
      />
      <div className="main-wrapper">
        <TopBar currentRole={currentRole} />
        <main className="content-container animate-fade-in">
          {children({ currentRole })}
        </main>
      </div>
    </div>
  );
};
