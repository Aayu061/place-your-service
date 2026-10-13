import React, { useEffect, useState, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode | ((helpers: { requestClose: () => void; isDirty: boolean }) => React.ReactNode);
  footer?: React.ReactNode | ((helpers: { requestClose: () => void; isDirty: boolean }) => React.ReactNode);
  width?: string;
  /**
   * Whether clicking the backdrop dismisses the drawer.
   * Default is FALSE globally across all Admin and Staff forms
   * to protect against accidental data loss.
   */
  closeOnBackdropClick?: boolean;
  /**
   * If true, attempting to close (via X button or Escape)
   * triggers an unsaved changes confirmation dialog.
   */
  isDirty?: boolean;
  /**
   * Optional custom discard callback invoked when the user confirms discarding changes.
   */
  onConfirmDiscard?: () => void;
  discardTitle?: string;
  discardMessage?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = '440px',
  closeOnBackdropClick = false,
  isDirty = false,
  onConfirmDiscard,
  discardTitle,
  discardMessage,
}) => {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    if (onConfirmDiscard) {
      onConfirmDiscard();
    }
    onClose();
  }, [onConfirmDiscard, onClose]);

  const handleCancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          requestClose();
        }
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
      setShowDiscardConfirm(false);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, showDiscardConfirm, requestClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="drawer-backdrop animate-fade-in"
        onClick={() => {
          // Accidental backdrop click protection:
          // Clicking anywhere in the background does not discard or dismiss the drawer
          // unless explicitly allowed via closeOnBackdropClick
          if (closeOnBackdropClick) {
            requestClose();
          }
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        aria-describedby={description ? 'drawer-desc' : undefined}
        className="drawer-container animate-slide-right"
        style={{ maxWidth: width }}
        onClick={(e) => {
          // Prevent clicks inside drawer from bubbling to backdrop
          e.stopPropagation();
        }}
      >
        <div className="drawer-header">
          <div>
            <h2 id="drawer-title" className="drawer-title">
              {title}
            </h2>
            {description && (
              <p id="drawer-desc" className="text-caption" style={{ marginTop: '2px' }}>
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onClick={requestClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="drawer-body">
          {typeof children === 'function' ? children({ requestClose, isDirty }) : children}
        </div>

        {footer && (
          <div className="drawer-footer">
            {typeof footer === 'function' ? footer({ requestClose, isDirty }) : footer}
          </div>
        )}
      </div>

      {/* Unsaved changes confirmation dialog */}
      {showDiscardConfirm && (
        <div
          className="discard-confirm-overlay animate-fade-in"
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4, 16px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="drawer-discard-confirm-title"
            aria-describedby="drawer-discard-confirm-desc"
            className="discard-confirm-card animate-scale-in"
            style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border-default, #e2e8f0)',
              boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.2))',
              maxWidth: '440px',
              width: '100%',
              padding: 'var(--space-5, 20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3, 12px)',
                marginBottom: 'var(--space-3, 12px)',
              }}
            >
              <div
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'var(--color-warning-subtle, #fef3c7)',
                  color: 'var(--color-warning, #d97706)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3
                  id="drawer-discard-confirm-title"
                  style={{
                    fontSize: 'var(--text-lg, 1.125rem)',
                    fontWeight: 600,
                    color: 'var(--text-primary, #0f172a)',
                    margin: 0,
                  }}
                >
                  {discardTitle || 'Unsaved Changes'}
                </h3>
                <p
                  id="drawer-discard-confirm-desc"
                  style={{
                    fontSize: 'var(--text-sm, 0.875rem)',
                    color: 'var(--text-secondary, #475569)',
                    marginTop: '6px',
                    marginBottom: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {discardMessage || 'You have unsaved changes. Discard them?'}
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-2, 8px)',
                marginTop: 'var(--space-4, 16px)',
              }}
            >
              <Button
                id="drawer-continue-editing-btn"
                variant="outline"
                onClick={handleCancelDiscard}
                autoFocus
              >
                Continue Editing
              </Button>
              <Button
                id="drawer-discard-changes-btn"
                variant="danger"
                onClick={handleConfirmDiscard}
              >
                Discard Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
