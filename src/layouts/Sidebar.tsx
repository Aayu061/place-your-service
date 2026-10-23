import {
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Tooltip } from '@/components/ui/Tooltip';
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
          }}
        >
          {isCollapsed ? (
            <Tooltip content={`Place Your Service (Role: ${currentRole}) — Click to expand`} position="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary-600)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  letterSpacing: '-0.02em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                PYS
              </button>
            </Tooltip>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', overflow: 'hidden', minWidth: 0 }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary-600)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    flexShrink: 0,
                    letterSpacing: '-0.02em',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                >
                  PYS
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      color: '#ffffff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Place Your Service
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-neutral-400)', lineHeight: 1.2 }}>
                    Role: <span style={{ color: 'var(--color-brand-light, #38bdf8)', fontWeight: 500 }}>{currentRole}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {/* Desktop Collapse Toggle (Top Side) */}
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Collapse sidebar"
                  className="sidebar-collapse-btn-desktop"
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-neutral-300)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = 'var(--color-neutral-300)';
                  }}
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Mobile Close Button */}
                {isMobileOpen && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    style={{
                      color: 'var(--color-neutral-400)',
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

        {/* Navigation Groups */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isCollapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-4) var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {NAV_STRUCTURE.map((group) => {
            // Check if group is restricted to Admin
            if (group.adminOnly && currentRole !== 'ADMIN') return null;

            return (
              <div key={group.group} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {!isCollapsed ? (
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--color-neutral-400)',
                      padding: 'var(--space-1) var(--space-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {group.group}
                  </div>
                ) : (
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--bg-sidebar-border)',
                      margin: 'var(--space-2) var(--space-2)',
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
                        padding: isCollapsed ? '0.6rem 0' : '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isActive ? 'var(--color-primary-600)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--color-neutral-300)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: isActive ? 600 : 400,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all var(--duration-hover) var(--ease-standard)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Icon
                        size={18}
                        style={{
                          color: isActive ? '#ffffff' : 'var(--color-neutral-400)',
                          flexShrink: 0,
                        }}
                      />
                      {!isCollapsed && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                      )}
                    </button>
                  );

                  return isCollapsed ? (
                    <Tooltip key={item.id} content={item.label} position="right">
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

        {/* Sidebar Bottom (Only show expand toggle when collapsed on desktop) */}
        {isCollapsed && (
          <div
            style={{
              padding: 'var(--space-3)',
              borderTop: '1px solid var(--bg-sidebar-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <Tooltip content="Expand sidebar" position="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-neutral-300)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </Tooltip>
          </div>
        )}
      </aside>
    </>
  );
};
