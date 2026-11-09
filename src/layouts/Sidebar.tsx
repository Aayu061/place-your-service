import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  X,
  Sun,
  Moon,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { LegalTermsModal } from '@/components/legal/LegalTermsModal';
import { NAV_STRUCTURE } from './navStructure';

interface SidebarProps {
  currentRole: UserRole;
  activeItem: string;
  onItemSelect: (item: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  activeItem,
  onItemSelect,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);

  // Keyboard shortcut listener: Toggle sidebar with Ctrl+B or Cmd+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleCollapse]);

  const operatorInitial = user?.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : currentRole === 'ADMIN'
      ? 'A'
      : 'S';

  const operatorName = user?.fullName || (currentRole === 'ADMIN' ? 'Admin Console' : 'Operations Staff');

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`sidebar-overlay ${isMobileOpen ? 'visible' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Main Navigation"
      >
        {/* Branding & Top Controls Area (Top Side) */}
        <div
          style={{
            height: 'var(--header-height)',
            padding: isCollapsed ? '0 var(--space-2)' : '0 var(--space-4)',
            borderBottom: '1px solid var(--bg-sidebar-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: 'var(--space-2)',
            flexShrink: 0,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {isCollapsed ? (
            <Tooltip content={`Place Your Service • Click to expand (Ctrl+B)`} position="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--bg-surface-subtle)',
                  padding: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                }}
              >
                <img
                  src={COMPANY_BANK_DETAILS.pysLogoUrl}
                  alt="Place Your Service Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </button>
            </Tooltip>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  overflow: 'hidden',
                  minWidth: 0,
                  cursor: 'pointer',
                }}
                onClick={() => onItemSelect('dashboard')}
                title="Go to Operations Dashboard"
              >
                {/* 3D Glowing Brand Badge */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'var(--bg-surface-subtle)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid var(--border-default)',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <img
                    src={COMPANY_BANK_DETAILS.pysLogoUrl}
                    alt="Place Your Service Logo"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '13.5px',
                      color: 'var(--text-sidebar-title, #293B32)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                    }}
                  >
                    Place Your Service
                  </div>
                  <div
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--text-sidebar-muted, #8EB69B)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginTop: '2px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ color: 'var(--text-sidebar, #8EB69B)', fontWeight: 500 }}>
                      Role: {currentRole}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {/* Desktop Collapse Toggle on Top Side */}
                <Tooltip content="Collapse sidebar (Ctrl+B)" position="bottom">
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label="Collapse sidebar"
                    className="sidebar-collapse-btn-desktop"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-sidebar, #8EB69B)',
                      backgroundColor: 'var(--bg-sidebar-btn, rgba(255, 255, 255, 0.04))',
                      border: '1px solid var(--border-sidebar-card, rgba(255, 255, 255, 0.06))',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover, rgba(255, 255, 255, 0.12))';
                      e.currentTarget.style.color = 'var(--text-sidebar-title, #ffffff)';
                      e.currentTarget.style.borderColor = 'var(--border-moderate, rgba(255, 255, 255, 0.2))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-btn, rgba(255, 255, 255, 0.04))';
                      e.currentTarget.style.color = 'var(--text-sidebar, #8EB69B)';
                      e.currentTarget.style.borderColor = 'var(--border-sidebar-card, rgba(255, 255, 255, 0.06))';
                    }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                </Tooltip>

                {/* Mobile Close Button */}
                {isMobileOpen && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    style={{
                      color: 'var(--text-sidebar, #8EB69B)',
                      padding: '6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Close sidebar"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Navigation Groups with Sleek Custom Scrollbar */}
        <nav className="sidebar-nav">
          {NAV_STRUCTURE.map((group) => {
            if (group.adminOnly && currentRole !== 'ADMIN') return null;

            return (
              <div
                key={group.group}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  marginBottom: isCollapsed ? 'var(--space-1)' : 'var(--space-2)',
                }}
              >
                {!isCollapsed ? (
                  <div
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      color: 'var(--text-sidebar-heading, #8EB69B)',
                      padding: 'var(--space-1) var(--space-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      opacity: 0.9,
                    }}
                  >
                    {group.group}
                  </div>
                ) : (
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--bg-sidebar-border, rgba(255, 255, 255, 0.06))',
                      margin: '4px 8px',
                    }}
                  />
                )}

                {group.items.map((item) => {
                  if (item.adminOnly && currentRole !== 'ADMIN') return null;
                  const Icon = item.icon;
                  const isActive = activeItem === item.id;

                  const navButton = (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onItemSelect(item.id);
                        if (isMobileOpen) onCloseMobile();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: 'var(--space-3)',
                        padding: isCollapsed ? '9px 0' : '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: isActive
                          ? 'var(--bg-sidebar-active, #DCE9DE)'
                          : 'transparent',
                        borderLeft: isActive
                          ? '3px solid var(--border-focus, #3F765D)'
                          : '3px solid transparent',
                        color: isActive ? 'var(--text-sidebar-active, #293B32)' : 'var(--text-sidebar, #64756A)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: isActive ? 600 : 500,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                        borderTop: 'none',
                        borderRight: 'none',
                        borderBottom: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover, rgba(35, 83, 71, 0.4))';
                          e.currentTarget.style.color = 'var(--text-sidebar-active, #293B32)';
                          if (!isCollapsed) {
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-sidebar, #64756A)';
                          if (!isCollapsed) {
                            e.currentTarget.style.transform = 'translateX(0)';
                          }
                        }
                      }}
                    >
                      <Icon
                        size={18}
                        style={{
                          color: isActive ? 'var(--text-sidebar-active, #293B32)' : 'var(--text-sidebar-icon, #64756A)',
                          filter: isActive ? 'drop-shadow(0 0 6px rgba(63, 118, 93, 0.25))' : 'none',
                          flexShrink: 0,
                          transition: 'color 0.15s ease',
                        }}
                      />
                      {!isCollapsed && (
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </button>
                  );

                  return isCollapsed ? (
                    <Tooltip
                      key={item.id}
                      content={`${item.label} • ${group.group}`}
                      position="right"
                    >
                      {navButton}
                    </Tooltip>
                  ) : (
                    navButton
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Enterprise Bottom Operator / Workspace Card */}
        <div
          style={{
            padding: isCollapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-3) var(--space-3)',
            borderTop: '1px solid var(--bg-sidebar-border)',
            backgroundColor: 'var(--bg-sidebar-footer, rgba(0, 0, 0, 0.25))',
            flexShrink: 0,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Tooltip content={`${operatorName} (${currentRole}) • Click to expand (Ctrl+B)`} position="right">
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Expand sidebar"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-brand)';
                    e.currentTarget.style.transform = 'scale(1.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {operatorInitial}
                </button>
              </Tooltip>
              <Tooltip content={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`} position="right">
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  aria-label="Toggle Theme"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--bg-sidebar-btn, rgba(255, 255, 255, 0.05))',
                    border: '1px solid var(--border-sidebar-card, rgba(255, 255, 255, 0.1))',
                    color: 'var(--text-sidebar, #8EB69B)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                </button>
              </Tooltip>
              <Tooltip content="Legal, Privacy & Security Framework" position="right">
                <button
                  type="button"
                  onClick={() => setIsLegalModalOpen(true)}
                  aria-label="Legal, Privacy & Security"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--bg-sidebar-btn, rgba(255, 255, 255, 0.05))',
                    border: '1px solid var(--border-sidebar-card, rgba(255, 255, 255, 0.1))',
                    color: 'var(--text-sidebar, #8EB69B)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ShieldCheck size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Sign Out" position="right">
                <button
                  type="button"
                  onClick={() => logout()}
                  aria-label="Sign Out"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--bg-sidebar-btn, rgba(255, 255, 255, 0.05))',
                    border: '1px solid var(--border-sidebar-card, rgba(255, 255, 255, 0.1))',
                    color: 'var(--text-sidebar, #8EB69B)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <LogOut size={15} />
                </button>
              </Tooltip>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                padding: '6px 8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-sidebar-card, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-sidebar-card, rgba(255, 255, 255, 0.06))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '11px',
                    flexShrink: 0,
                  }}
                >
                  {operatorInitial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-sidebar-title, var(--text-primary))',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {operatorName}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-sidebar-muted, #8EB69B)', whiteSpace: 'nowrap' }}>
                    {currentRole} Session • Online
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <Tooltip content="Legal & Privacy Framework" position="top">
                  <button
                    type="button"
                    onClick={() => setIsLegalModalOpen(true)}
                    aria-label="Legal, Privacy & Security"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-sidebar-muted, #8EB69B)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-sidebar-active, #293B32)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover, rgba(255, 255, 255, 0.1))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-sidebar-muted, #8EB69B)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <ShieldCheck size={15} />
                  </button>
                </Tooltip>

                <Tooltip content={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`} position="top">
                  <button
                    type="button"
                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                    aria-label="Toggle Theme"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-sidebar-muted, #8EB69B)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-sidebar-active, #293B32)';
                      e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover, rgba(255, 255, 255, 0.1))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-sidebar-muted, #8EB69B)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                  </button>
                </Tooltip>

                <Tooltip content="Sign Out" position="top">
                  <button
                    type="button"
                    onClick={() => logout()}
                    aria-label="Sign Out"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-sidebar-muted, #8EB69B)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-sidebar-muted, #8EB69B)';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <LogOut size={15} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </aside>

      <LegalTermsModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />
    </>
  );
};

export default Sidebar;
