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
        {/* Branding Area */}
        <div
          style={{
            height: 'var(--header-height)',
            padding: isCollapsed ? '0 var(--space-3)' : '0 var(--space-5)',
            borderBottom: '1px solid var(--bg-sidebar-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', overflow: 'hidden' }}>
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
              }}
            >
              PYS
            </div>
            {!isCollapsed && (
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 'var(--text-sm)',
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Place Your Service
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-neutral-400)' }}>
                  AC Management Portal
                </div>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          {isMobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              style={{
                color: 'var(--color-neutral-400)',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
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

        {/* Sidebar Footer with Collapse Toggle (Desktop) */}
        <div
          style={{
            padding: isCollapsed ? 'var(--space-3)' : 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--bg-sidebar-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {!isCollapsed && (
            <div style={{ fontSize: '11px', color: 'var(--color-neutral-400)' }}>
              <div>Phase 1 Shell</div>
              <div style={{ color: 'var(--color-neutral-500)', fontSize: '10px' }}>
                Role: {currentRole}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
};
