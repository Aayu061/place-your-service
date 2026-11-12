import React, { useEffect, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { UserRole } from '@/domain/types';

export interface WorkspaceProps {
  moduleId: string;
  role: UserRole;
  onNavigate: (item: string, params?: Record<string, string>) => void;
}

export type CustomerOption = { id: string; name: string; customerCode: string };
export type ReportOption = { id: string; reportNumber: string; serviceDate: string; primaryOutcome: string; status: string };
export type CustomerServiceRequestOption = { id: string; requestNumber: string; requestType: string; status: string };
export type CustomerAmcOption = { id: string; contractNumber: string; status: string };

export const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' };
export const toolbarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' };
export const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' };
export const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' };
export const labelStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' };
export const selectStyle: React.CSSProperties = { width: '100%', minHeight: '42px' };
export const hintStyle: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)' };

export function dateOnly(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useWorkspaceFilters() {
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const url = new URL(window.location.href);
    const pairs: Array<[string, string]> = [
      ['search', search],
      ['status', status],
      ['from', from],
      ['to', to],
    ];
    for (const [key, value] of pairs) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [search, status, from, to]);

  return { search, setSearch, debouncedSearch, status, setStatus, from, setFrom, to, setTo };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  useEffect(() => {
    void apiClient
      .get<{ customers: CustomerOption[] }>('/customers', { params: { page: 1, pageSize: 100, status: 'ACTIVE' } })
      .then((response) => setCustomers(response.customers || []))
      .catch(() => setCustomers([]));
  }, []);
  return customers;
}

