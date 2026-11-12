import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface AsyncSearchOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface AsyncSearchSelectProps {
  id?: string;
  label?: string;
  value: string;
  selectedLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string, option?: AsyncSearchOption) => void;
  fetchOptions: (query: string) => Promise<AsyncSearchOption[]>;
  emptyText?: string;
}

export const AsyncSearchSelect: React.FC<AsyncSearchSelectProps> = ({
  id,
  label,
  value,
  selectedLabel,
  placeholder = 'Search and select...',
  disabled = false,
  required = false,
  onChange,
  fetchOptions,
  emptyText = 'No matching options found',
}) => {
  const autoId = useId();
  const inputId = id || autoId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<AsyncSearchOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchOptions(query.trim());
        if (active) setOptions(res);
      } catch {
        if (active) setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [open, query, fetchOptions]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const currentOption = options.find((opt) => opt.value === value);
  const displayValue = currentOption?.label || selectedLabel || '';

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: '6px',
          }}
        >
          {label}
          {required && <span style={{ color: 'var(--color-error-solid)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <button
        id={inputId}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        style={{
          width: '100%',
          minHeight: '38px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          color: displayValue ? 'var(--text-primary)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          fontSize: 'var(--text-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayValue || placeholder}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              style={{ color: 'var(--text-muted)', display: 'inline-flex', padding: 2 }}
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 80,
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface-subtle)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search..."
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-xs)',
              }}
            />
          </div>
          <div role="listbox" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Searching...
              </div>
            ) : options.length === 0 ? (
              <div style={{ padding: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {emptyText}
              </div>
            ) : (
              options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => {
                    onChange(opt.value, opt);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: opt.value === value ? 'var(--color-brand-soft)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{opt.label}</span>
                  {opt.sublabel && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{opt.sublabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

