// Approval Inbox — website requests (ESS bookings, AMC requests, enquiries) wait
// here until staff approve them (→ service request) or reject them.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, RefreshCw, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/useToast';
import { getApiErrorMessage } from '@/services/api/client';
import {
  catalogService,
  intakeService,
  type ApproveIntakePayload,
  type IntakeDetailDto,
  type IntakeDto,
  type IntakeKind,
  type IntakeStats,
  type IntakeStatus,
  type PublicCatalog,
  type RejectIntakePayload,
} from '@/services/intakeService';
import { IntakeList } from './IntakeList';
import { IntakeDetail } from './IntakeDetail';
import { ApproveIntakeDialog } from './ApproveIntakeDialog';
import { RejectIntakeDialog } from './RejectIntakeDialog';
import { KIND_LABELS, NEW_CUSTOMER, defaultRequestType, formatWaitingFor, isTypingTarget } from './intakeFormat';
import { notifyIntakesChanged } from './intakeEvents';

const INTAKE_REFRESH_MS = 30_000;
const PAGE_SIZE = 25;

type TabId = 'pending' | 'approved' | 'rejected' | 'spam' | 'all';

const TABS: { id: TabId; label: string; status?: IntakeStatus }[] = [
  { id: 'pending', label: 'Pending', status: 'PENDING_REVIEW' },
  { id: 'approved', label: 'Approved', status: 'APPROVED' },
  { id: 'rejected', label: 'Rejected', status: 'REJECTED' },
  { id: 'spam', label: 'Spam', status: 'SPAM' },
  { id: 'all', label: 'All' },
];

const EMPTY_MESSAGES: Record<TabId, string> = {
  pending: 'No website requests are waiting. New ones appear here automatically.',
  approved: 'No approved requests match these filters.',
  rejected: 'No rejected requests match these filters.',
  spam: 'No spam. Nice.',
  all: 'No requests match these filters.',
};

function tabCount(tab: TabId, stats: IntakeStats | null): string {
  if (!stats) return '';
  switch (tab) {
    case 'pending':
      return String(stats.pending);
    case 'approved':
      return `${stats.approvedToday} today`;
    case 'rejected':
      return `${stats.rejectedToday} today`;
    case 'spam':
      return String(stats.spam);
    default:
      return '';
  }
}

interface ApprovalInboxProps {
  onNavigate?: (item: string, params?: Record<string, string>) => void;
}

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({ onNavigate }) => {
  const { showToast } = useToast();

  const [tab, setTab] = useState<TabId>('pending');
  const [kind, setKind] = useState<IntakeKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<IntakeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [stats, setStats] = useState<IntakeStats | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntakeDetailDto | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);

  const [customerChoices, setCustomerChoices] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastApproved, setLastApproved] = useState<{ intakeNumber: string; srId: string; srNumber: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const listSeq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const activeStatus = TABS.find((t) => t.id === tab)?.status;

  /* ---------------- data loading ---------------- */

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await intakeService.stats());
    } catch {
      // Counts are a nice-to-have; the list shows its own error.
    }
  }, []);

  const loadList = useCallback(
    async (silent = false) => {
      const seq = ++listSeq.current;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const res = await intakeService.list({
          status: activeStatus,
          kind: kind || undefined,
          search: search || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (seq !== listSeq.current) return;
        const sorted = [...res.items].sort((a, b) => {
          const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          // Pending: oldest first (first come, first served). Everything else: newest first.
          return activeStatus === 'PENDING_REVIEW' ? diff : -diff;
        });
        setItems(sorted);
        setTotal(res.total);
        setListError(null);
        setNow(Date.now());
        setSelectedId((current) => (current && sorted.some((i) => i.id === current) ? current : sorted[0]?.id ?? null));
      } catch (err) {
        if (seq !== listSeq.current) return;
        setListError(getApiErrorMessage(err, 'Could not load website requests.'));
      } finally {
        if (seq === listSeq.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [activeStatus, kind, search, page]
  );

  const refreshAll = useCallback(
    (silent = true) => {
      void loadList(silent);
      void loadStats();
    },
    [loadList, loadStats]
  );

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Auto-refresh every 30 s (silently, keeping the current selection).
  useEffect(() => {
    const id = setInterval(() => refreshAll(true), INTAKE_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  // Catalog (prices) — once.
  useEffect(() => {
    let cancelled = false;
    catalogService
      .getPublic()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        if (!cancelled) setCatalogError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detail (+ customer candidates) for the selected item.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setIsDetailLoading(true);
    intakeService
      .get(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        // The list row already holds everything except candidates; keep going.
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  /* ---------------- derived ---------------- */

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const selectedFull: IntakeDto | null = detail && selected && detail.id === selected.id ? detail : selected;

  const customerChoice = selected
    ? customerChoices[selected.id] ?? selected.matchedCustomer?.id ?? NEW_CUSTOMER
    : NEW_CUSTOMER;

  const customerLabel = useMemo(() => {
    if (!selectedFull) return '';
    if (customerChoice === NEW_CUSTOMER) {
      return `New temporary customer — ${selectedFull.contact.name} (${selectedFull.contact.phone})`;
    }
    const pool = [
      ...(selectedFull.matchedCustomer ? [selectedFull.matchedCustomer] : []),
      ...(detail && detail.id === selectedFull.id ? detail.candidates : []),
    ];
    const hit = pool.find((c) => c.id === customerChoice);
    return hit ? `${hit.name} (${hit.customerCode})` : 'Existing customer';
  }, [selectedFull, customerChoice, detail]);

  /* ---------------- actions ---------------- */

  const moveSelection = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const index = items.findIndex((i) => i.id === selectedId);
      const nextIndex = index === -1 ? 0 : Math.min(items.length - 1, Math.max(0, index + delta));
      const nextId = items[nextIndex].id;
      setSelectedId(nextId);
      const el = listRef.current?.querySelector<HTMLElement>(`[data-intake-id="${nextId}"]`);
      el?.scrollIntoView?.({ block: 'nearest' });
    },
    [items, selectedId]
  );

  /** After a decision: drop the item from status-filtered views and select its neighbour. */
  const applyDecision = useCallback(
    (updated: IntakeDto) => {
      const index = items.findIndex((i) => i.id === updated.id);
      const keep = !activeStatus || activeStatus === updated.status;
      if (keep) {
        setItems(items.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
      } else {
        const next = items.filter((i) => i.id !== updated.id);
        setItems(next);
        setTotal((t) => Math.max(0, t - 1));
        const neighbour = next[Math.min(Math.max(index, 0), next.length - 1)];
        setSelectedId(neighbour ? neighbour.id : null);
      }
      setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
      notifyIntakesChanged();
      refreshAll(true);
    },
    [items, activeStatus, refreshAll]
  );

  const openServiceRequest = useCallback(
    (id: string) => onNavigate?.('service-requests', { recordType: 'service_request', recordId: id }),
    [onNavigate]
  );

  const handleApprove = async (payload: ApproveIntakePayload) => {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      const res = await intakeService.approve(selected.id, payload);
      setDialog(null);
      const sr = res.serviceRequest;
      showToast({
        type: 'success',
        title: 'Request approved',
        message: sr
          ? `Service request ${sr.requestNumber} created${res.schedule ? ` and visit ${res.schedule.scheduleNumber} booked` : ''}.`
          : `${selected.intakeNumber} approved.`,
      });
      if (res.warning) showToast({ type: 'warning', title: 'Approved with a warning', message: res.warning, durationMs: 8000 });
      if (sr) setLastApproved({ intakeNumber: selected.intakeNumber, srId: sr.id, srNumber: sr.requestNumber });
      applyDecision(res.intake ?? { ...selected, status: 'APPROVED', serviceRequest: sr });
    } catch (err) {
      showToast({ type: 'error', title: 'Could not approve', message: getApiErrorMessage(err, 'Approval failed. Please try again.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (payload: RejectIntakePayload) => {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      const res = await intakeService.reject(selected.id, payload);
      setDialog(null);
      const verb = payload.status === 'SPAM' ? 'marked as spam' : payload.status === 'DUPLICATE' ? 'marked as duplicate' : 'rejected';
      showToast({ type: 'success', title: `Request ${verb}`, message: `${selected.intakeNumber} ${verb}.` });
      applyDecision(
        res.intake ?? {
          ...selected,
          status: payload.status,
          review: { ...selected.review, rejectionReason: payload.reason || null },
        }
      );
    } catch (err) {
      showToast({ type: 'error', title: 'Could not reject', message: getApiErrorMessage(err, 'Rejection failed. Please try again.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------- keyboard: J/K move, A approve, R reject ---------------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (dialog || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // Ignore while any other modal/drawer is open on the page.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'j') {
        e.preventDefault();
        moveSelection(1);
      } else if (key === 'k') {
        e.preventDefault();
        moveSelection(-1);
      } else if ((key === 'a' || key === 'r') && selected?.status === 'PENDING_REVIEW') {
        e.preventDefault();
        setDialog(key === 'a' ? 'approve' : 'reject');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, moveSelection, selected]);

  /* ---------------- render ---------------- */

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const oldestPending = stats?.oldestPendingAt ? formatWaitingFor(stats.oldestPendingAt, now) : null;

  return (
    <div className="page-container" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Inbox size={24} style={{ color: 'var(--color-brand)' }} aria-hidden="true" /> Approval Inbox
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Website requests wait here until you approve them into service requests.
            {stats && stats.pending > 0 && oldestPending ? ` Oldest has been waiting ${oldestPending}.` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          onClick={() => refreshAll(true)}
          aria-label="Refresh requests"
        >
          Refresh
        </Button>
      </div>

      {lastApproved && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-success)',
            background: 'var(--bg-surface)',
            fontSize: 'var(--text-sm)',
            flexWrap: 'wrap',
          }}
        >
          <span>
            {lastApproved.intakeNumber} approved → service request <strong style={{ fontFamily: 'monospace' }}>{lastApproved.srNumber}</strong>
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <Button variant="secondary" size="sm" rightIcon={<ExternalLink size={14} />} onClick={() => openServiceRequest(lastApproved.srId)}>
              Open {lastApproved.srNumber}
            </Button>
            <Button variant="ghost" size="sm" isIconOnly aria-label="Dismiss" onClick={() => setLastApproved(null)}>
              <X size={14} />
            </Button>
          </span>
        </div>
      )}

      {/* Status tabs */}
      <div role="tablist" aria-label="Request status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
        {TABS.map((t) => {
          const count = tabCount(t.id, stats);
          const isActive = tab === t.id;
          return (
            <Button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              variant={isActive ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => {
                if (tab === t.id) return;
                setTab(t.id);
                setPage(1);
                setSelectedId(null);
                setItems([]);
              }}
            >
              {t.label}
              {count ? ` (${count})` : ''}
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <Input
            id="intake-search"
            label="Search"
            isSearch
            placeholder="Name, phone, request number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div style={{ flex: '0 1 220px' }}>
          <Select
            id="intake-kind"
            label="Type"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as IntakeKind | '');
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {(Object.keys(KIND_LABELS) as IntakeKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {listError && items.length > 0 && (
        <div role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}>
          Auto-refresh failed: {listError}. Showing the last loaded list.
        </div>
      )}

      {/* Split view */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          ref={listRef}
          className="card"
          style={{ flex: '1 1 300px', maxWidth: 440, minWidth: 0, maxHeight: '70vh', overflowY: 'auto', padding: 0 }}
        >
          <IntakeList
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isLoading={isLoading}
            error={listError}
            onRetry={() => void loadList(false)}
            now={now}
            emptyMessage={EMPTY_MESSAGES[tab]}
          />
          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)' }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span>
                Page {page} of {totalPages} · {total} total
              </span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>

        <div className="card" style={{ flex: '2 1 420px', minWidth: 0, padding: 0 }} aria-live="polite">
          <IntakeDetail
            intake={selected}
            detail={detail}
            isDetailLoading={isDetailLoading}
            catalog={catalog}
            catalogError={catalogError}
            customerChoice={customerChoice}
            onCustomerChoiceChange={(value) => selected && setCustomerChoices((prev) => ({ ...prev, [selected.id]: value }))}
            onApprove={() => setDialog('approve')}
            onReject={() => setDialog('reject')}
            onOpenServiceRequest={openServiceRequest}
            now={now}
          />
        </div>
      </div>

      {dialog === 'approve' && selectedFull && (
        <ApproveIntakeDialog
          key={`approve-${selectedFull.id}`}
          intake={selectedFull}
          defaultRequestType={defaultRequestType(selectedFull, catalog)}
          customerId={customerChoice === NEW_CUSTOMER ? null : customerChoice}
          customerLabel={customerLabel}
          isSubmitting={isSubmitting}
          onClose={() => setDialog(null)}
          onSubmit={(payload) => void handleApprove(payload)}
        />
      )}

      {dialog === 'reject' && selectedFull && (
        <RejectIntakeDialog
          key={`reject-${selectedFull.id}`}
          intake={selectedFull}
          isSubmitting={isSubmitting}
          onClose={() => setDialog(null)}
          onSubmit={(payload) => void handleReject(payload)}
        />
      )}
    </div>
  );
};

export default ApprovalInbox;
