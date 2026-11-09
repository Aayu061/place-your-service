import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { operationsApi, SearchRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';

interface GlobalSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (item: string, params?: Record<string, string>) => void;
}

const ROUTE_BY_TYPE: Record<string, string> = {
  customer: 'customers',
  site: 'customers',
  asset: 'customers',
  service_request: 'service-requests',
  schedule: 'service-schedule',
  service_report: 'service-reports',
  amc: 'amc',
};

export const GlobalSearchDialog: React.FC<GlobalSearchDialogProps> = ({ open, onClose, onNavigate }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const openResult = useCallback((record: SearchRecord) => {
    const route = ROUTE_BY_TYPE[record.record_type];
    if (!route) return;
    onNavigate(route, {
      recordId: record.record_id,
      recordType: record.record_type,
      search: record.title,
      ...(record.context_id ? { customerId: record.context_id } : {}),
    });
    onClose();
  }, [onNavigate, onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
      if (event.key === 'Enter' && results[activeIndex]) {
        event.preventDefault();
        openResult(results[activeIndex]);
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, results, activeIndex, openResult]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]); setError(null); setLoading(false); setActiveIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      operationsApi.search(query.trim(), 50)
        .then((response) => { if (!cancelled) { setResults(response.results || []); setError(null); setActiveIndex(0); } })
        .catch((reason) => { if (!cancelled) { setResults([]); setError(reason instanceof Error ? reason.message : 'Search is unavailable.'); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [open, query]);

  if (!open) return null;
  return <div
    role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    style={{ position: 'fixed', inset: 0, zIndex: 1000, padding: '8vh 16px 24px', background: 'rgba(15, 23, 42, 0.56)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}
  >
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="global-search-title" style={{ width: 'min(680px, 100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-default)' }}>
        <Search size={20} aria-hidden="true" />
        <label id="global-search-title" htmlFor="global-search-query" className="sr-only">Search authorized PYS records</label>
        <input
          ref={inputRef}
          id="global-search-query"
          type="search"
          autoComplete="off"
          placeholder="Search customers, assets, requests, schedules, reports…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-controls="global-search-results"
          aria-activedescendant={results[activeIndex] ? `global-search-result-${activeIndex}` : undefined}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}
        />
        <Button isIconOnly variant="ghost" aria-label="Close search" onClick={onClose}><X size={17} /></Button>
      </div>
      <div id="global-search-results" role="listbox" aria-label="Search results" style={{ maxHeight: '62vh', overflowY: 'auto', padding: 'var(--space-2)' }}>
        {loading && <p role="status" style={{ padding: 14, color: 'var(--text-secondary)' }}>Searching authorized records…</p>}
        {error && <p role="alert" style={{ padding: 14, color: 'var(--color-error-solid)' }}>{error}</p>}
        {!loading && !error && query.trim().length < 2 && <p style={{ padding: 14, color: 'var(--text-muted)' }}>Enter at least two characters.</p>}
        {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p style={{ padding: 14, color: 'var(--text-muted)' }}>No matching records found.</p>}
        {results.map((record, index) => <button
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          id={`global-search-result-${index}`}
          key={`${record.record_type}:${record.record_id}`}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => openResult(record)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '12px 14px', border: 0, borderRadius: 'var(--radius-md)', background: index === activeIndex ? 'var(--bg-surface-subtle)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block' }}>{record.title}</strong><span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{record.record_type.replace('_', ' ')} · {record.subtitle || record.status || ''}</span></span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>)}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        Use ↑ and ↓ to move, Enter to open, Esc to close.
      </div>
    </section>
  </div>;
};
