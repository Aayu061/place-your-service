import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Boxes, CheckCheck, CheckCircle, ClipboardList, Copy, Check, CreditCard, Edit2, Link2, Package, Plus, RefreshCw, RotateCcw, Wallet } from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import { operationsApi, PageResult, PartRecord, PaymentRecord, NotificationRecord, InventoryTransactionRecord, PaymentTransactionRecord, ActivityLogRecord } from '@/services/operationsApi';
import { UserRole } from '@/domain/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';

interface WorkspaceProps { moduleId: string; role: UserRole; onNavigate: (item: string, params?: Record<string, string>) => void }
type CustomerOption = { id: string; name: string; customerCode: string };
type ReportOption = { id: string; reportNumber: string; serviceDate: string; primaryOutcome: string; status: string };
type CustomerServiceRequestOption = { id: string; requestNumber: string; requestType: string; status: string };
type CustomerAmcOption = { id: string; contractNumber: string; status: string };

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' };
const toolbarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' };
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', alignItems: 'end' };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' };
const selectStyle: React.CSSProperties = { width: '100%', minHeight: '42px' };
const hintStyle: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)' };

function dateOnly(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function useWorkspaceFilters() {
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const url = new URL(window.location.href);
    const pairs: Array<[string, string]> = [['search', search], ['status', status], ['from', from], ['to', to]];
    for (const [key, value] of pairs) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [search, status, from, to]);

  return { search, setSearch, debouncedSearch, status, setStatus, from, setFrom, to, setTo };
}

function PartCatalog() {
  const { showToast } = useToast();
  const [partsPage, setPartsPage] = useState<PageResult<PartRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [form, setForm] = useState({ partCode: '', name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5' });

  // Edit Part Modal State
  const [editingPart, setEditingPart] = useState<PartRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5', isActive: true });
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPartsPage(await operationsApi.listParts({ search: debouncedSearch.trim() || undefined, page: 1, pageSize: 100 })); }
    catch (error) { showToast({ type: 'error', title: 'Parts unavailable', message: error instanceof Error ? error.message : 'Could not load parts.' }); }
    finally { setLoading(false); }
  }, [debouncedSearch, showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await operationsApi.createPart({ ...form, unitCost: Number(form.unitCost), unitPrice: Number(form.unitPrice), lowStockThreshold: Number(form.lowStockThreshold) });
      showToast({ type: 'success', title: 'Part added', message: 'Opening stock can now be recorded in Inventory.' });
      setForm({ partCode: '', name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5' });
      setShowCreate(false); await refresh();
    } catch (error) { showToast({ type: 'error', title: 'Could not add part', message: error instanceof Error ? error.message : 'Please check the part details.' }); }
    finally { setSaving(false); }
  };

  const openEditModal = (part: PartRecord) => {
    setEditingPart(part);
    setEditForm({
      name: part.name,
      category: part.category || '',
      unitOfMeasure: part.unit_of_measure,
      unitCost: String(part.unit_cost),
      unitPrice: String(part.unit_price),
      lowStockThreshold: String(part.low_stock_threshold),
      isActive: part.is_active,
    });
  };

  const handleUpdatePart = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPart) return;
    setIsUpdating(true);
    try {
      await operationsApi.updatePart(editingPart.id, {
        name: editForm.name.trim(),
        category: editForm.category.trim() || null,
        unitOfMeasure: editForm.unitOfMeasure.trim(),
        unitCost: Number(editForm.unitCost),
        unitPrice: Number(editForm.unitPrice),
        lowStockThreshold: Number(editForm.lowStockThreshold),
        isActive: editForm.isActive,
      });
      showToast({ type: 'success', title: 'Part updated', message: `${editingPart.part_code} details updated.` });
      setEditingPart(null);
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Update failed', message: error instanceof Error ? error.message : 'Could not update part details.' });
    } finally {
      setIsUpdating(false);
    }
  };

  const togglePartStatus = async (part: PartRecord) => {
    try {
      await operationsApi.updatePart(part.id, { isActive: !part.is_active });
      showToast({ type: 'success', title: part.is_active ? 'Part deactivated' : 'Part activated', message: `${part.part_code} status updated.` });
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Status change failed', message: error instanceof Error ? error.message : 'Could not update part status.' });
    }
  };

  return <div style={sectionStyle}>
    <div style={toolbarStyle}>
      <Input label="Search parts" value={search} onChange={(event) => setSearch(event.target.value)} isSearch placeholder="Part code or name" style={{ maxWidth: 320 }} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={15} />} onClick={() => void refresh()}>Refresh</Button>
        <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate((open) => !open)}>{showCreate ? 'Close form' : 'Add part'}</Button>
      </div>
    </div>
    {showCreate && <Card><CardHeader><CardTitle>New part</CardTitle></CardHeader><CardBody>
      <form onSubmit={create} style={formGridStyle}>
        <Input label="Part code" required value={form.partCode} onChange={(e) => setForm({ ...form, partCode: e.target.value })} />
        <Input label="Part name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <Input label="Unit" required value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} />
        <Input label="Unit cost (₹)" required type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
        <Input label="Unit price (₹)" required type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
        <Input label="Low stock threshold" required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
        <Button type="submit" isLoading={saving}>Save part</Button>
      </form>
    </CardBody></Card>}
    {loading ? <div role="status">Loading parts…</div> : partsPage?.items.length ? <div className="table-container"><table className="table">
      <thead><tr><th>Part</th><th>Category</th><th>On hand</th><th>Low stock at</th><th>Cost</th><th>Price</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
      <tbody>{partsPage.items.map((part) => <tr key={part.id}>
        <td><strong>{part.part_code}</strong><div style={hintStyle}>{part.name}</div></td><td>{part.category || '—'}</td>
        <td>{part.current_stock} {part.unit_of_measure}</td><td>{part.low_stock_threshold}</td><td>{money(part.unit_cost)}</td><td>{money(part.unit_price)}</td>
        <td>{!part.is_active ? <span style={{ color: 'var(--text-muted)' }}>Inactive</span> : part.current_stock <= part.low_stock_threshold ? <span style={{ color: 'var(--color-warning-text)' }}>Low stock</span> : 'Available'}</td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Button size="sm" variant="ghost" leftIcon={<Edit2 size={13} />} onClick={() => openEditModal(part)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => void togglePartStatus(part)} style={{ fontSize: 'var(--text-xs)', color: part.is_active ? 'var(--text-muted)' : 'var(--color-brand)' }}>
              {part.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </td>
      </tr>)}</tbody>
    </table></div> : <EmptyState title="No parts found" description="Add parts to establish the catalog. Stock changes are recorded separately in the inventory ledger." />}

    {/* Edit Part Modal */}
    <Modal
      isOpen={Boolean(editingPart)}
      onClose={() => setEditingPart(null)}
      title={`Edit Part · ${editingPart?.part_code}`}
      description="Update pricing, thresholds, or status for this spare part."
      maxWidth="560px"
    >
      {editingPart && (
        <form onSubmit={handleUpdatePart} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Part name" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input label="Category" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input label="Unit" required value={editForm.unitOfMeasure} onChange={(e) => setEditForm({ ...editForm, unitOfMeasure: e.target.value })} />
            <Input label="Low stock threshold" required type="number" min="0" step="1" value={editForm.lowStockThreshold} onChange={(e) => setEditForm({ ...editForm, lowStockThreshold: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input label="Unit cost (₹)" required type="number" min="0" step="0.01" value={editForm.unitCost} onChange={(e) => setEditForm({ ...editForm, unitCost: e.target.value })} />
            <Input label="Unit price (₹)" required type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Part is active and available for service consumption
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => setEditingPart(null)}>Cancel</Button>
            <Button type="submit" isLoading={isUpdating}>Save changes</Button>
          </div>
        </form>
      )}
    </Modal>
  </div>;
}

function InventoryLedger() {
  const { showToast } = useToast();
  const [parts, setParts] = useState<PartRecord[]>([]);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [history, setHistory] = useState<InventoryTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ partId: '', transactionType: 'PURCHASE', quantity: '', reason: '', serviceReportId: '', unitPrice: '' });
  const [adjustmentDirection, setAdjustmentDirection] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [partResult, ledgerResult, reportResult] = await Promise.all([
        operationsApi.listParts({ page: 1, pageSize: 100 }),
        operationsApi.listInventoryTransactions({ page, pageSize: 25 }),
        apiClient.get<{ reports: ReportOption[] }>('/service-reports', { params: { page: 1, pageSize: 100 } }),
      ]);
      setParts(partResult.items); setHistory(ledgerResult.items); setTotalPages(ledgerResult.totalPages); setReports(reportResult.reports || []);
      if (!form.partId && partResult.items[0]) setForm((current) => ({ ...current, partId: partResult.items[0].id }));
    } catch (error) { showToast({ type: 'error', title: 'Inventory unavailable', message: error instanceof Error ? error.message : 'Could not load inventory data.' }); }
    finally { setLoading(false); }
  }, [form.partId, page, showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const rawQuantity = Math.abs(Number(form.quantity));
      const signedQuantity = form.transactionType === 'ADJUSTMENT' && adjustmentDirection === 'DEDUCT' ? -rawQuantity : rawQuantity;

      const movement = {
        partId: form.partId,
        transactionType: form.transactionType,
        quantity: signedQuantity,
        reason: form.reason.trim(),
        ...(form.transactionType === 'SERVICE_USAGE'
          ? { serviceReportId: form.serviceReportId, unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined }
          : {}),
      };
      await operationsApi.recordInventoryTransaction(movement);
      showToast({ type: 'success', title: 'Stock updated', message: 'The ledger movement and balance were saved together.' });
      setForm((current) => ({ ...current, quantity: '', reason: '', serviceReportId: '', unitPrice: '' }));
      await refresh();
    } catch (error) { showToast({ type: 'error', title: 'Stock movement rejected', message: error instanceof Error ? error.message : 'Could not update stock.' }); }
    finally { setSaving(false); }
  };

  return <div style={sectionStyle}>
    <Card><CardHeader><CardTitle>Record stock movement</CardTitle></CardHeader><CardBody>
      {parts.length === 0 ? <p>No parts exist yet. Add a part in the Parts workspace before recording stock.</p> : <form onSubmit={submit} style={formGridStyle}>
        <div style={fieldStyle}><label style={labelStyle} htmlFor="inventory-part">Part</label><select id="inventory-part" className="form-select" style={selectStyle} value={form.partId} onChange={(e) => setForm({ ...form, partId: e.target.value })} required>
          <option value="">Choose a part</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.part_code} · {part.name} ({part.current_stock} on hand)</option>)}
        </select></div>
        <div style={fieldStyle}><label style={labelStyle} htmlFor="inventory-type">Movement</label><select id="inventory-type" className="form-select" style={selectStyle} value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })}>
          <option value="OPENING">Opening stock</option><option value="PURCHASE">Purchase receipt</option><option value="RETURN">Return</option><option value="SERVICE_USAGE">Service consumption</option><option value="ADJUSTMENT">Adjustment</option>
        </select></div>

        {form.transactionType === 'ADJUSTMENT' && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Adjustment Direction</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button type="button" size="sm" variant={adjustmentDirection === 'ADD' ? 'primary' : 'secondary'} onClick={() => setAdjustmentDirection('ADD')}>+ Add stock</Button>
              <Button type="button" size="sm" variant={adjustmentDirection === 'DEDUCT' ? 'primary' : 'secondary'} onClick={() => setAdjustmentDirection('DEDUCT')}>− Deduct stock</Button>
            </div>
          </div>
        )}

        <Input
          label={form.transactionType === 'ADJUSTMENT' ? `Quantity to ${adjustmentDirection === 'ADD' ? 'add' : 'deduct'}` : 'Quantity'}
          type="number"
          step="1"
          min="1"
          required
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        />

        {form.transactionType === 'SERVICE_USAGE' && <div style={fieldStyle}><label style={labelStyle} htmlFor="inventory-report">Service report</label><select id="inventory-report" className="form-select" style={selectStyle} value={form.serviceReportId} onChange={(e) => setForm({ ...form, serviceReportId: e.target.value })} required>
          <option value="">Choose an issued report</option>{reports.filter((report) => ['SUBMITTED', 'VERIFIED'].includes(report.status)).map((report) => <option key={report.id} value={report.id}>{report.reportNumber} · {dateOnly(report.serviceDate)}</option>)}
        </select></div>}
        {form.transactionType === 'SERVICE_USAGE' && <Input label="Price per unit (₹)" type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />}
        <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <Button type="submit" isLoading={saving}>Save movement</Button>
      </form>}
    </CardBody></Card>
    <div style={toolbarStyle}><div><h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Inventory ledger</h2><span style={hintStyle}>Every balance change is recorded with a reason.</span></div><Button variant="secondary" size="sm" leftIcon={<RefreshCw size={15} />} onClick={() => void refresh()}>Refresh</Button></div>
    {loading ? <div role="status">Loading stock history…</div> : history.length ? <div className="table-container"><table className="table">
      <thead><tr><th>Recorded</th><th>Part</th><th>Type</th><th>Quantity</th><th>Reason</th><th>Reference</th></tr></thead>
      <tbody>{history.map((row) => <tr key={row.id}><td>{dateOnly(row.created_at)}</td><td>{row.parts?.part_code || row.part_id}</td><td>{row.transaction_type}</td><td style={{ color: row.quantity < 0 ? 'var(--color-error-solid)' : 'var(--color-success-solid)' }}>{row.quantity > 0 ? '+' : ''}{row.quantity}</td><td>{row.reason}</td><td>{row.reference_type ? `${row.reference_type} · ${row.reference_id}` : '—'}</td></tr>)}</tbody>
    </table><div className="table-pagination"><span>Page {page} of {Math.max(totalPages, 1)}</span><div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div></div> : <EmptyState title="No stock movements yet" description="Record opening stock, purchases, returns, service use, or adjustments to start the ledger." />}
  </div>;
}

function useCustomers() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  useEffect(() => {
    void apiClient.get<{ customers: CustomerOption[] }>('/customers', { params: { page: 1, pageSize: 100, status: 'ACTIVE' } })
      .then((response) => setCustomers(response.customers || [])).catch(() => setCustomers([]));
  }, []);
  return customers;
}

function PaymentsWorkspace({ onNavigate }: { onNavigate?: (item: string, params?: Record<string, string>) => void }) {
  const { showToast } = useToast();
  const customers = useCustomers();
  const { search, setSearch, debouncedSearch, status, setStatus } = useWorkspaceFilters();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Payment form with optional SR or AMC link
  const [paymentForm, setPaymentForm] = useState({ customerId: '', totalAmountDue: '', linkType: 'NONE' as 'NONE' | 'SERVICE_REQUEST' | 'AMC', serviceRequestId: '', amcId: '' });
  const [customerServiceRequests, setCustomerServiceRequests] = useState<CustomerServiceRequestOption[]>([]);
  const [customerAmcs, setCustomerAmcs] = useState<CustomerAmcOption[]>([]);

  const [receiptForm, setReceiptForm] = useState({ paymentMethod: 'CASH', amount: '', externalPaymentReference: '', notes: '' });
  const [reversalTarget, setReversalTarget] = useState<string | null>(null);
  const [reversalForm, setReversalForm] = useState({ amount: '', reason: '' });

  const metrics = useMemo(() => {
    const totalInvoiced = records.reduce((acc, r) => acc + Number(r.total_amount_due || 0), 0);
    const totalCollected = records.reduce((acc, r) => acc + Number(r.total_amount_paid || 0), 0);
    const totalOutstanding = records.reduce((acc, r) => {
      if (r.status === 'PAID') return acc;
      return acc + Math.max(0, Number(r.total_amount_due || 0) - Number(r.total_amount_paid || 0));
    }, 0);
    const rate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;
    const pendingCount = records.filter((r) => r.status === 'PENDING' || r.status === 'PARTIALLY_PAID').length;
    return { totalInvoiced, totalCollected, totalOutstanding, rate, pendingCount };
  }, [records]);

  const selectedRecord = useMemo(() => records.find((r) => r.id === selected) || null, [records, selected]);
  const balanceDue = useMemo(() => {
    if (!selectedRecord) return 0;
    if (selectedRecord.status === 'PAID') return 0;
    return Math.max(0, Number(selectedRecord.total_amount_due || 0) - Number(selectedRecord.total_amount_paid || 0));
  }, [selectedRecord]);
  const isFullyPaid = selectedRecord ? selectedRecord.status === 'PAID' || balanceDue <= 0 : false;

  // Auto-fill amount to balance due when selecting a payment record
  useEffect(() => {
    if (selectedRecord) {
      const bal = selectedRecord.status === 'PAID' ? 0 : Math.max(0, Number(selectedRecord.total_amount_due || 0) - Number(selectedRecord.total_amount_paid || 0));
      setReceiptForm({
        paymentMethod: 'CASH',
        amount: bal > 0 ? String(bal) : '',
        externalPaymentReference: '',
        notes: '',
      });
    }
  }, [selectedRecord]);

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await operationsApi.listPayments({ page: 1, pageSize: 100, status: status || undefined, search: debouncedSearch.trim() || undefined });
      setRecords(page.items);
    } catch (error) { showToast({ type: 'error', title: 'Payments unavailable', message: error instanceof Error ? error.message : 'Could not load payment records.' }); }
    finally { setLoading(false); }
  }, [debouncedSearch, status, showToast]);

  const loadTransactions = useCallback(async (paymentId: string) => {
    try { const page = await operationsApi.listPaymentTransactions(paymentId, { page: 1, pageSize: 100 }); setTransactions(page.items); }
    catch (error) { showToast({ type: 'error', title: 'Payment history unavailable', message: error instanceof Error ? error.message : 'Could not load payment entries.' }); }
  }, [showToast]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (selected) void loadTransactions(selected); else setTransactions([]); }, [selected, loadTransactions]);

  // Load customer's open SRs and active AMCs when selected customer changes
  useEffect(() => {
    if (!paymentForm.customerId) {
      setCustomerServiceRequests([]);
      setCustomerAmcs([]);
      return;
    }
    void apiClient.get<{ requests?: CustomerServiceRequestOption[] }>('/service-requests', { params: { customerId: paymentForm.customerId } })
      .then((res) => setCustomerServiceRequests(res.requests || [])).catch(() => setCustomerServiceRequests([]));

    void apiClient.get<{ contracts?: CustomerAmcOption[] }>('/amc-contracts', { params: { customerId: paymentForm.customerId, status: 'ACTIVE' } })
      .then((res) => setCustomerAmcs(res.contracts || [])).catch(() => setCustomerAmcs([]));
  }, [paymentForm.customerId]);

  const createPayment = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        customerId: paymentForm.customerId,
        totalAmountDue: Number(paymentForm.totalAmountDue),
      };
      if (paymentForm.linkType === 'SERVICE_REQUEST' && paymentForm.serviceRequestId) {
        payload.serviceRequestId = paymentForm.serviceRequestId;
      } else if (paymentForm.linkType === 'AMC' && paymentForm.amcId) {
        payload.amcId = paymentForm.amcId;
      }
      await operationsApi.createPayment(payload);
      showToast({ type: 'success', title: 'Payment record created', message: 'The outstanding amount is ready for attributed entries.' });
      setPaymentForm({ customerId: '', totalAmountDue: '', linkType: 'NONE', serviceRequestId: '', amcId: '' });
      setShowCreate(false);
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Could not create payment record', message: error instanceof Error ? error.message : 'Please check the customer and amount.' });
    } finally { setSaving(false); }
  };

  const collect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !selectedRecord) return;
    const amt = Number(receiptForm.amount);
    if (isNaN(amt) || amt <= 0) {
      showToast({ type: 'error', title: 'Invalid amount', message: 'Please enter a positive payment amount.' });
      return;
    }
    if (amt > balanceDue) {
      showToast({
        type: 'error',
        title: 'Amount exceeds balance',
        message: `Payment of ${money(amt)} would exceed the outstanding balance of ${money(balanceDue)}.`,
      });
      return;
    }
    if (receiptForm.paymentMethod === 'ONLINE' && (!receiptForm.externalPaymentReference || receiptForm.externalPaymentReference.trim().length < 2)) {
      showToast({
        type: 'error',
        title: 'Reference required',
        message: 'External payment reference (UPI UTR / transaction ID) is required for online payments.',
      });
      return;
    }

    setSaving(true);
    try {
      await operationsApi.recordPayment(selected, {
        ...receiptForm,
        amount: amt,
        externalPaymentReference: receiptForm.paymentMethod === 'ONLINE' ? receiptForm.externalPaymentReference.trim() : undefined,
      });
      showToast({ type: 'success', title: 'Payment recorded', message: 'The entry is attributed to your staff account.' });
      setReceiptForm({ paymentMethod: 'CASH', amount: '', externalPaymentReference: '', notes: '' });
      await Promise.all([refresh(), loadTransactions(selected)]);
    } catch (error) {
      const errorMsg = error instanceof ApiError && Array.isArray(error.details)
        ? (error.details as Array<{ field?: string; message: string }>).map((d) => `${d.field ? `${d.field}: ` : ''}${d.message}`).join('; ')
        : error instanceof Error ? error.message : 'Could not record this payment.';
      showToast({
        type: 'error',
        title: 'Payment entry rejected',
        message: errorMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (event: React.FormEvent) => {
    event.preventDefault(); if (!reversalTarget) return; setSaving(true);
    try {
      await operationsApi.reversePayment(reversalTarget, { amount: Number(reversalForm.amount), reason: reversalForm.reason });
      showToast({ type: 'success', title: 'Reversal recorded', message: 'A linked reversal entry was added; the original payment remains unchanged.' });
      setReversalTarget(null);
      setReversalForm({ amount: '', reason: '' });
      if (selected) await Promise.all([refresh(), loadTransactions(selected)]);
    } catch (error) {
      showToast({ type: 'error', title: 'Reversal rejected', message: error instanceof Error ? error.message : 'Could not record this reversal.' });
    } finally {
      setSaving(false);
    }
  };

  return <div style={sectionStyle}>
    {/* Financial KPI Summary Cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
      <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
        <div style={hintStyle}>TOTAL INVOICED</div>
        <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0' }}>{money(metrics.totalInvoiced)}</strong>
        <span style={hintStyle}>{records.length} total payment accounts</span>
      </div>
      <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
        <div style={hintStyle}>TOTAL COLLECTED</div>
        <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0', color: 'var(--color-success-dark, #065f46)' }}>{money(metrics.totalCollected)}</strong>
        <span style={hintStyle}>{metrics.rate}% realized collection rate</span>
      </div>
      <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
        <div style={hintStyle}>OUTSTANDING BALANCE</div>
        <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0', color: metrics.totalOutstanding > 0 ? 'var(--color-warning-dark, #b45309)' : 'var(--text-muted)' }}>{money(metrics.totalOutstanding)}</strong>
        <span style={hintStyle}>{metrics.pendingCount} accounts with balance due</span>
      </div>
      <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
        <div style={hintStyle}>COLLECTION REALIZATION</div>
        <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0', color: 'var(--color-brand)' }}>{metrics.rate}%</strong>
        <div style={{ height: 6, background: 'var(--bg-surface-subtle)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
          <div style={{ height: '100%', width: `${metrics.rate}%`, background: 'var(--color-success-solid, #10b981)', transition: 'width 0.3s ease' }} />
        </div>
      </div>
    </div>

    <div style={toolbarStyle}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Input label="Search payment number" value={search} onChange={(e) => setSearch(e.target.value)} isSearch placeholder="Payment number" style={{ maxWidth: 290 }} />
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="payment-status">Status</label>
          <select id="payment-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>PENDING</option>
            <option>PARTIALLY_PAID</option>
            <option>PAID</option>
            <option>FAILED</option>
            <option>REFUNDED</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? 'Close form' : 'New payment record'}
        </Button>
      </div>
    </div>

    {showCreate && <Card><CardHeader><CardTitle>Create payment record</CardTitle></CardHeader><CardBody><form onSubmit={createPayment} style={formGridStyle}>
      <div style={fieldStyle}><label style={labelStyle} htmlFor="payment-customer">Customer</label><select id="payment-customer" className="form-select" style={selectStyle} required value={paymentForm.customerId} onChange={(e) => setPaymentForm({ ...paymentForm, customerId: e.target.value, serviceRequestId: '', amcId: '' })}><option value="">Choose a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.customerCode}</option>)}</select></div>

      {paymentForm.customerId && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="payment-link-type">Link Target</label>
          <select id="payment-link-type" className="form-select" style={selectStyle} value={paymentForm.linkType} onChange={(e) => setPaymentForm({ ...paymentForm, linkType: e.target.value as 'NONE' | 'SERVICE_REQUEST' | 'AMC', serviceRequestId: '', amcId: '' })}>
            <option value="NONE">General Payment (No link)</option>
            <option value="SERVICE_REQUEST">Link to Service Request</option>
            <option value="AMC">Link to AMC Contract</option>
          </select>
        </div>
      )}

      {paymentForm.customerId && paymentForm.linkType === 'SERVICE_REQUEST' && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="payment-sr">Service Request</label>
          <select id="payment-sr" className="form-select" style={selectStyle} required value={paymentForm.serviceRequestId} onChange={(e) => setPaymentForm({ ...paymentForm, serviceRequestId: e.target.value })}>
            <option value="">Choose a service request</option>
            {customerServiceRequests.map((sr) => <option key={sr.id} value={sr.id}>{sr.requestNumber} · {sr.requestType} ({sr.status})</option>)}
          </select>
        </div>
      )}

      {paymentForm.customerId && paymentForm.linkType === 'AMC' && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="payment-amc">AMC Contract</label>
          <select id="payment-amc" className="form-select" style={selectStyle} required value={paymentForm.amcId} onChange={(e) => setPaymentForm({ ...paymentForm, amcId: e.target.value })}>
            <option value="">Choose an active contract</option>
            {customerAmcs.map((amc) => <option key={amc.id} value={amc.id}>{amc.contractNumber} ({amc.status})</option>)}
          </select>
        </div>
      )}

      <Input label="Amount due (₹)" type="number" min="0.01" step="0.01" required value={paymentForm.totalAmountDue} onChange={(e) => setPaymentForm({ ...paymentForm, totalAmountDue: e.target.value })} />
      <Button type="submit" isLoading={saving}>Create record</Button>
    </form></CardBody></Card>}

    {loading ? <div role="status">Loading payment records…</div> : records.length ? <div className="table-container"><table className="table">
      <thead><tr><th>Payment</th><th>Customer</th><th>Target</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>{records.map((record) => {
        const rowBalance = record.status === 'PAID' ? 0 : Math.max(0, Number(record.total_amount_due) - Number(record.total_amount_paid));
        return (
          <tr key={record.id} onClick={() => setSelected(record.id)} style={{ cursor: 'pointer', background: selected === record.id ? 'var(--bg-surface-subtle)' : undefined }}>
            <td><strong>{record.payment_number}</strong></td>
            <td>{record.customers?.name || record.customer_id}</td>
            <td>
              {record.service_requests?.request_number ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.('service-requests', { recordId: record.service_request_id || '', recordType: 'service_request' });
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-brand)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontWeight: 600 }}
                  title="Open Service Request"
                >
                  <Link2 size={13} /> {record.service_requests.request_number}
                </button>
              ) : record.amc_contracts?.contract_number ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate?.('amc', { recordId: record.amc_id || '', recordType: 'amc' });
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-success-dark, #065f46)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontWeight: 600 }}
                  title="Open AMC Contract"
                >
                  <Link2 size={13} /> {record.amc_contracts.contract_number}
                </button>
              ) : (
                <span style={hintStyle}>General</span>
              )}
            </td>
            <td>{money(record.total_amount_due)}</td>
            <td>{money(record.total_amount_paid)}</td>
            <td>
              <strong style={{ color: rowBalance > 0 ? 'var(--color-warning-dark, #b45309)' : 'var(--color-success-dark, #065f46)' }}>
                {money(rowBalance)}
              </strong>
            </td>
            <td>
              <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: '11px',
                fontWeight: 600,
                background: record.status === 'PAID' ? 'rgba(16, 185, 129, 0.1)' : record.status === 'PARTIALLY_PAID' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(2, 132, 199, 0.1)',
                color: record.status === 'PAID' ? 'var(--color-success-dark, #065f46)' : record.status === 'PARTIALLY_PAID' ? 'var(--color-warning-dark, #b45309)' : 'var(--color-brand)',
              }}>
                {record.status.replace('_', ' ')}
              </span>
            </td>
            <td>{dateOnly(record.created_at)}</td>
          </tr>
        );
      })}</tbody>
    </table></div> : <EmptyState title="No payment records" description="Create a payment record for a customer to start tracking cash or trusted external payment references." />}

    {selected && selectedRecord && (
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <CardTitle>Entries · {selectedRecord.payment_number}</CardTitle>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Customer: <strong>{selectedRecord.customers?.name || selectedRecord.customer_id}</strong></span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: isFullyPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                color: isFullyPaid ? 'var(--color-success-dark, #065f46)' : 'var(--color-warning-dark, #b45309)',
              }}>
                {isFullyPaid ? 'FULLY SETTLED' : `BALANCE DUE: ${money(balanceDue)}`}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {isFullyPaid ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 20px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-success-dark, #065f46)',
            }}>
              <CheckCircle size={22} style={{ color: 'var(--color-success-solid, #10b981)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '15px' }}>Payment Fully Settled</strong>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 2 }}>
                  All {money(selectedRecord.total_amount_due)} has been received and verified. Balance outstanding is {money(0)}. No further payment entries can be recorded.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Payment Entry Form */}
              <form onSubmit={collect} style={formGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="payment-method">Payment Method</label>
                  <select
                    id="payment-method"
                    className="form-select"
                    style={selectStyle}
                    value={receiptForm.paymentMethod}
                    onChange={(e) => setReceiptForm({ ...receiptForm, paymentMethod: e.target.value })}
                  >
                    <option value="CASH">Cash Payment</option>
                    <option value="ONLINE">External online / UPI / Bank transfer</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={labelStyle} htmlFor="payment-amount">Amount received (₹) *</label>
                    <button
                      type="button"
                      onClick={() => setReceiptForm((f) => ({ ...f, amount: String(balanceDue) }))}
                      style={{ background: 'transparent', border: 0, color: 'var(--color-brand)', fontSize: '11px', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Fill balance ({money(balanceDue)})
                    </button>
                  </div>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0.01"
                    max={balanceDue}
                    step="0.01"
                    required
                    value={receiptForm.amount}
                    onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
                  />
                </div>

                {receiptForm.paymentMethod === 'ONLINE' && (
                  <Input
                    label="External reference / UPI UTR *"
                    placeholder="12-digit UTR or transaction ID"
                    required
                    value={receiptForm.externalPaymentReference}
                    onChange={(e) => setReceiptForm({ ...receiptForm, externalPaymentReference: e.target.value })}
                  />
                )}

                <Input
                  label="Notes"
                  placeholder="Optional operational remarks"
                  value={receiptForm.notes}
                  onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                />

                <Button type="submit" isLoading={saving}>Record payment</Button>
              </form>

              {/* Dynamic UPI QR Code & Demo Bank Details for ONLINE Method */}
              {receiptForm.paymentMethod === 'ONLINE' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 16,
                  padding: 16,
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  alignItems: 'center',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <UpiQrCode
                      amount={Number(receiptForm.amount) || balanceDue}
                      note={`Payment ${selectedRecord.payment_number}`}
                      size={120}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                      Scan to pay {money(Number(receiptForm.amount) || balanceDue)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '13px' }}>
                    <strong style={{ color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={15} /> Company Bank Particulars (Demo)
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '4px 10px', alignItems: 'center' }}>
                      <span style={hintStyle}>Bank Name:</span>
                      <strong>{COMPANY_BANK_DETAILS.bankName}</strong>
                      <span />

                      <span style={hintStyle}>Account Name:</span>
                      <strong>{COMPANY_BANK_DETAILS.accountHolderName}</strong>
                      <span />

                      <span style={hintStyle}>Account Number:</span>
                      <strong style={{ fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.accountNumber}</strong>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(COMPANY_BANK_DETAILS.accountNumber, 'ac')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-brand)' }}
                        title="Copy account number"
                      >
                        {copiedKey === 'ac' ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      <span style={hintStyle}>IFSC Code:</span>
                      <strong style={{ fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.ifscCode}</strong>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(COMPANY_BANK_DETAILS.ifscCode, 'ifsc')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-brand)' }}
                        title="Copy IFSC code"
                      >
                        {copiedKey === 'ifsc' ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      <span style={hintStyle}>UPI ID:</span>
                      <strong style={{ color: 'var(--color-brand)', fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.upiId}</strong>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(COMPANY_BANK_DETAILS.upiId, 'upi')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-brand)' }}
                        title="Copy UPI ID"
                      >
                        {copiedKey === 'upi' ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {reversalTarget && <form onSubmit={reverse} style={formGridStyle} aria-label="Record payment reversal">
            <Input label="Reversal amount (₹)" type="number" min="0.01" step="0.01" required value={reversalForm.amount} onChange={(e) => setReversalForm({ ...reversalForm, amount: e.target.value })} />
            <Input label="Reason" required value={reversalForm.reason} onChange={(e) => setReversalForm({ ...reversalForm, reason: e.target.value })} />
            <Button type="submit" variant="danger" isLoading={saving}>Save reversal</Button><Button variant="ghost" onClick={() => setReversalTarget(null)}>Cancel</Button>
          </form>}

          {transactions.length ? <div className="table-container"><table className="table"><thead><tr><th>Reference</th><th>Type</th><th>Method</th><th>Amount</th><th>Recorded by</th><th>Date</th><th>Action</th></tr></thead><tbody>
            {transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.external_payment_reference || transaction.transaction_reference}<div style={hintStyle}>{transaction.notes || ''}</div></td><td>{transaction.entry_type || 'PAYMENT'}</td><td>{transaction.payment_method}</td><td>{transaction.entry_type === 'REVERSAL' ? '−' : ''}{money(transaction.amount)}</td><td>{transaction.profiles?.full_name || transaction.recorded_by}</td><td>{dateOnly(transaction.created_at)}</td><td>{transaction.entry_type !== 'REVERSAL' && transaction.payment_status === 'SUCCESS' && <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={() => setReversalTarget(transaction.id)}>Reverse</Button>}</td></tr>)}
          </tbody></table></div> : <p>No payment entries yet.</p>}
        </CardBody>
      </Card>
    )}
  </div>;
}

function NotificationsWorkspace({ role, onNavigate }: WorkspaceProps) {
  const { showToast } = useToast();
  const [page, setPage] = useState<PageResult<NotificationRecord> | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPage(await operationsApi.listNotifications({ page: 1, pageSize: 100, unreadOnly: String(unreadOnly) })); }
    catch (error) { showToast({ type: 'error', title: 'Notifications unavailable', message: error instanceof Error ? error.message : 'Could not load notifications.' }); }
    finally { setLoading(false); }
  }, [showToast, unreadOnly]);

  useEffect(() => { void refresh(); }, [refresh]);

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await operationsApi.generateNotifications();
      showToast({ type: 'success', title: 'Alerts checked', message: `${result.created} new notification${result.created === 1 ? '' : 's'} added.` });
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Alert generation failed', message: error instanceof Error ? error.message : 'Could not check operational alerts.' });
    } finally {
      setGenerating(false);
    }
  };

  const markRead = async (notification: NotificationRecord) => {
    try {
      await operationsApi.markNotificationRead(notification.id, !notification.is_read);
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Update failed', message: error instanceof Error ? error.message : 'Could not update this notification.' });
    }
  };

  const markAllRead = async () => {
    const unreadItems = page?.items.filter((item) => !item.is_read) || [];
    if (!unreadItems.length) return;
    setMarkingAll(true);
    try {
      await Promise.all(unreadItems.map((item) => operationsApi.markNotificationRead(item.id, true)));
      showToast({ type: 'success', title: 'All alerts marked as read', message: `${unreadItems.length} alerts updated.` });
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Update failed', message: error instanceof Error ? error.message : 'Could not mark all alerts as read.' });
    } finally {
      setMarkingAll(false);
    }
  };

  const navigateToEntity = (notification: NotificationRecord) => {
    const route: Record<string, string> = {
      customer: 'customers',
      service_request: 'service-requests',
      service_schedule: 'service-schedule',
      service_report: 'service-reports',
      amc_contract: 'amc',
      part: 'inventory',
      payment: 'payments',
    };
    if (notification.entity_type && route[notification.entity_type]) onNavigate(route[notification.entity_type]);
  };

  const hasUnread = page?.items.some((item) => !item.is_read);

  return <div style={sectionStyle}>
    <div style={toolbarStyle}>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
        Centralized operational alerts for scheduled service visits, contract renewals, inventory thresholds, and payments.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} isLoading={loading} onClick={() => void refresh()}>
          Refresh
        </Button>
        {hasUnread && (
          <Button size="sm" variant="ghost" leftIcon={<CheckCheck size={14} />} isLoading={markingAll} onClick={markAllRead}>
            Mark all read
          </Button>
        )}
        {role === 'ADMIN' && (
          <Button size="sm" leftIcon={<Bell size={14} />} isLoading={generating} onClick={generate}>
            Check alerts now
          </Button>
        )}
      </div>
    </div>
    {loading ? <div role="status">Loading notifications & alerts…</div> : page?.items.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {page.items.map((notification) => <Card key={notification.id} style={{ borderLeft: `4px solid ${notification.is_read ? 'var(--border-default)' : notification.type === 'ALERT' ? 'var(--color-error-solid)' : 'var(--color-warning-solid)'}` }}>
        <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{notification.title}</strong>
              {!notification.is_read && <span className="badge badge-brand">New</span>}
            </div>
            <p style={{ margin: '6px 0' }}>{notification.message}</p>
            <span style={hintStyle}>{notification.category.replace(/_/g, ' ')} · {dateOnly(notification.created_at)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <Button size="sm" variant="ghost" onClick={() => void markRead(notification)}>
              {notification.is_read ? 'Mark unread' : 'Mark read'}
            </Button>
            {notification.entity_id && (
              <Button size="sm" variant="secondary" onClick={() => navigateToEntity(notification)}>
                Open record
              </Button>
            )}
          </div>
        </CardBody>
      </Card>)}
    </div> : <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="When operational work needs attention, generated alerts will appear here." />}
  </div>;
}

function renderDetails(details: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) return <span style={hintStyle}>No details</span>;
  const entries = Object.entries(details);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {entries.slice(0, 4).map(([key, value]) => (
          <span key={key} style={{ display: 'inline-flex', gap: 4, padding: '2px 6px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{key}:</span>
            <strong>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</strong>
          </span>
        ))}
      </div>
      {entries.length > 4 && (
        <details style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <summary style={{ cursor: 'pointer', padding: '2px 0' }}>Show all {entries.length} fields</summary>
          <pre style={{ margin: '4px 0 0', padding: 6, background: 'var(--bg-surface-subtle)', borderRadius: 4, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ActivityLogWorkspace() {
  const { showToast } = useToast();
  const { search, setSearch, debouncedSearch, from, setFrom, to, setTo } = useWorkspaceFilters();
  const [rows, setRows] = useState<ActivityLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const result = await operationsApi.listActivityLogs({ page, pageSize: 50, entityType: debouncedSearch.trim() || undefined, from: from || undefined, to: to || undefined }); setRows(result.items); setTotalPages(result.totalPages); }
    catch (error) { showToast({ type: 'error', title: 'Activity log unavailable', message: error instanceof Error ? error.message : 'Could not load activity records.' }); }
    finally { setLoading(false); }
  }, [showToast, page, debouncedSearch, from, to]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <div style={sectionStyle}>
    <div style={toolbarStyle}><div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <Input label="Filter entity type" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="customer, schedule…" style={{ maxWidth: 280 }} />
      <Input label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
      <Input label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
    </div><Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={() => void refresh()}>Refresh</Button></div>
    {loading ? <div role="status">Loading immutable activity records…</div> : rows.length ? <div className="table-container"><table className="table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}>
        <td>{new Date(row.created_at).toLocaleString()}</td>
        <td>{row.profiles?.full_name || row.actor_profile_id || 'System'}</td>
        <td><strong>{row.action}</strong></td>
        <td>{row.entity_type}{row.entity_id ? <div style={hintStyle}>{row.entity_id}</div> : null}</td>
        <td>{renderDetails(row.details)}</td>
      </tr>)}
    </tbody></table><div className="table-pagination"><span>Page {page} of {Math.max(totalPages, 1)}</span><div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div></div> : <EmptyState title="No activity matches these filters" description="Activity events are written by the server as operational changes occur." />}
  </div>;
}

export const OperationalWorkspace: React.FC<WorkspaceProps> = ({ moduleId, role, onNavigate }) => {
  const content = useMemo(() => {
    switch (moduleId) {
      case 'parts': return <PartCatalog />;
      case 'inventory': return <InventoryLedger />;
      case 'payments': return <PaymentsWorkspace onNavigate={onNavigate} />;
      case 'notifications': return <NotificationsWorkspace moduleId={moduleId} role={role} onNavigate={onNavigate} />;
      case 'activity-logs': return <ActivityLogWorkspace />;
      default: return null;
    }
  }, [moduleId, role, onNavigate]);
  const title: Record<string, string> = { parts: 'Parts Catalog', inventory: 'Inventory Ledger', payments: 'Payment Records', notifications: 'Notifications & Operational Alerts', 'activity-logs': 'Activity Log' };
  const icon = moduleId === 'parts' ? <Package size={20} /> : moduleId === 'inventory' ? <Boxes size={20} /> : moduleId === 'payments' ? <Wallet size={20} /> : moduleId === 'notifications' ? <Bell size={20} /> : <Activity size={20} />;
  return <section style={sectionStyle} aria-labelledby="operational-workspace-title">
    <div style={toolbarStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: 'var(--color-brand)' }}>{icon}</span><div><h1 id="operational-workspace-title" style={{ margin: 0, fontSize: 'var(--text-xl)' }}>{title[moduleId] || 'Operations'}</h1><p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Connected to the authenticated PYS operations API.</p></div></div>{moduleId === 'inventory' && <Button size="sm" variant="ghost" leftIcon={<ClipboardList size={14} />} onClick={() => onNavigate('parts')}>Part catalog</Button>}{moduleId === 'parts' && <Button size="sm" variant="ghost" leftIcon={<Boxes size={14} />} onClick={() => onNavigate('inventory')}>Inventory ledger</Button>}</div>
    {content}
  </section>;
};

export const SettingsWorkspace: React.FC = () => {
  const { showToast } = useToast();
  const [health, setHealth] = useState<{
    service: string;
    status: string;
    environment: string;
    timestamp: string;
    database?: { connected: boolean; latencyMs?: number };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setHealth(await apiClient.get('/health/ready')); }
    catch (error) { setHealth(null); showToast({ type: 'error', title: 'Readiness check failed', message: error instanceof ApiError ? error.message : 'The server did not return a readiness state.' }); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <section style={sectionStyle}><div><h1 style={{ margin: 0 }}>System status</h1><p style={{ color: 'var(--text-secondary)' }}>Live API and database readiness information.</p></div><Card><CardHeader><CardTitle>Service readiness</CardTitle></CardHeader><CardBody>{loading ? <div role="status">Checking service…</div> : health ? <dl style={formGridStyle}><div><dt style={labelStyle}>API</dt><dd>{health.service} · {health.status}</dd></div><div><dt style={labelStyle}>Environment</dt><dd>{health.environment}</dd></div><div><dt style={labelStyle}>Database</dt><dd>{health.database?.connected ? `Connected · ${health.database.latencyMs} ms` : 'Not connected'}</dd></div><div><dt style={labelStyle}>Checked</dt><dd>{dateOnly(health.timestamp)}</dd></div></dl> : <p>Service readiness could not be loaded.</p>}<Button variant="secondary" onClick={() => void refresh()} isLoading={loading}>Refresh status</Button></CardBody></Card></section>;
};
