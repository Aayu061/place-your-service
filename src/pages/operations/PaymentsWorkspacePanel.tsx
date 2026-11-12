import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle, ChevronDown, ChevronUp, Copy, CreditCard, FileText, Link2, Plus, Printer, RotateCcw, Wallet } from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import { operationsApi, PaymentRecord, PaymentTransactionRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { PaymentInvoiceModal } from '@/components/payments/PaymentInvoiceModal';
import {
  CustomerAmcOption,
  CustomerServiceRequestOption,
  dateOnly,
  fieldStyle,
  formGridStyle,
  hintStyle,
  labelStyle,
  money,
  sectionStyle,
  selectStyle,
  toolbarStyle,
  useCustomers,
  useWorkspaceFilters,
} from './workspaceShared';

export const PaymentsWorkspace: React.FC<{ onNavigate?: (item: string, params?: Record<string, string>) => void }> = ({ onNavigate }) => {
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
  const [invoiceModalRecord, setInvoiceModalRecord] = useState<PaymentRecord | null>(null);
  const [invoiceTransactions, setInvoiceTransactions] = useState<PaymentTransactionRecord[]>([]);

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
    if (!selectedRecord || selectedRecord.status === 'PAID') return 0;
    return Math.max(0, Number(selectedRecord.total_amount_due || 0) - Number(selectedRecord.total_amount_paid || 0));
  }, [selectedRecord]);

  useEffect(() => {
    if (selectedRecord) {
      const bal = selectedRecord.status === 'PAID' ? 0 : Math.max(0, Number(selectedRecord.total_amount_due || 0) - Number(selectedRecord.total_amount_paid || 0));
      setReceiptForm({ paymentMethod: 'CASH', amount: bal > 0 ? String(bal) : '', externalPaymentReference: '', notes: '' });
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
    } catch (error) {
      showToast({ type: 'error', title: 'Payments unavailable', message: error instanceof Error ? error.message : 'Could not load payment records.' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, showToast]);

  const loadTransactions = useCallback(async (paymentId: string) => {
    try {
      const page = await operationsApi.listPaymentTransactions(paymentId, { page: 1, pageSize: 100 });
      setTransactions(page.items);
    } catch (error) {
      showToast({ type: 'error', title: 'Payment history unavailable', message: error instanceof Error ? error.message : 'Could not load payment entries.' });
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) void loadTransactions(selected);
    else setTransactions([]);
  }, [selected, loadTransactions]);

  useEffect(() => {
    if (invoiceModalRecord) {
      if (invoiceModalRecord.id === selected) {
        setInvoiceTransactions(transactions);
      } else {
        void operationsApi
          .listPaymentTransactions(invoiceModalRecord.id, { page: 1, pageSize: 100 })
          .then((res) => setInvoiceTransactions(res.items))
          .catch(() => setInvoiceTransactions([]));
      }
    } else {
      setInvoiceTransactions([]);
    }
  }, [invoiceModalRecord, selected, transactions]);

  useEffect(() => {
    if (!paymentForm.customerId) {
      setCustomerServiceRequests([]);
      setCustomerAmcs([]);
      return;
    }
    void apiClient
      .get<{ requests?: CustomerServiceRequestOption[] }>('/service-requests', { params: { customerId: paymentForm.customerId } })
      .then((res) => setCustomerServiceRequests(res.requests || []))
      .catch(() => setCustomerServiceRequests([]));

    void apiClient
      .get<{ contracts?: CustomerAmcOption[] }>('/amc-contracts', { params: { customerId: paymentForm.customerId, status: 'ACTIVE' } })
      .then((res) => setCustomerAmcs(res.contracts || []))
      .catch(() => setCustomerAmcs([]));
  }, [paymentForm.customerId]);

  const createPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { customerId: paymentForm.customerId, totalAmountDue: Number(paymentForm.totalAmountDue) };
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
    } finally {
      setSaving(false);
    }
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
      showToast({ type: 'error', title: 'Amount exceeds balance', message: `Payment of ${money(amt)} would exceed the outstanding balance of ${money(balanceDue)}.` });
      return;
    }
    if (receiptForm.paymentMethod === 'ONLINE' && (!receiptForm.externalPaymentReference || receiptForm.externalPaymentReference.trim().length < 2)) {
      showToast({ type: 'error', title: 'Reference required', message: 'External payment reference (UPI UTR / transaction ID) is required for online payments.' });
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
      const errorMsg =
        error instanceof ApiError && Array.isArray(error.details)
          ? (error.details as Array<{ field?: string; message: string }>).map((d) => `${d.field ? `${d.field}: ` : ''}${d.message}`).join('; ')
          : error instanceof Error
            ? error.message
            : 'Could not record this payment.';
      showToast({ type: 'error', title: 'Payment entry rejected', message: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversalTarget) return;
    setSaving(true);
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

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
          <div style={hintStyle}>TOTAL INVOICED</div>
          <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0' }}>{money(metrics.totalInvoiced)}</strong>
          <span style={hintStyle}>{records.length} total payment accounts</span>
        </div>
        <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
          <div style={hintStyle}>TOTAL COLLECTED</div>
          <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0', color: 'var(--color-success-text, #10b981)' }}>{money(metrics.totalCollected)}</strong>
          <span style={hintStyle}>{metrics.rate}% realized collection rate</span>
        </div>
        <div className="pys-card-26" style={{ padding: '16px 18px', background: 'var(--bg-surface)' }}>
          <div style={hintStyle}>OUTSTANDING BALANCE</div>
          <strong style={{ fontSize: '1.35rem', display: 'block', margin: '4px 0', color: metrics.totalOutstanding > 0 ? 'var(--color-warning-text, #f59e0b)' : 'var(--text-muted)' }}>
            {money(metrics.totalOutstanding)}
          </strong>
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
            <label style={labelStyle} htmlFor="payment-status">
              Status
            </label>
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

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create payment record</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={createPayment} style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="payment-customer">
                  Customer
                </label>
                <select
                  id="payment-customer"
                  className="form-select"
                  style={selectStyle}
                  required
                  value={paymentForm.customerId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, customerId: e.target.value, serviceRequestId: '', amcId: '' })}
                >
                  <option value="">Choose a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.customerCode}
                    </option>
                  ))}
                </select>
              </div>

              {paymentForm.customerId && (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="payment-link-type">
                    Link Target
                  </label>
                  <select
                    id="payment-link-type"
                    className="form-select"
                    style={selectStyle}
                    value={paymentForm.linkType}
                    onChange={(e) => setPaymentForm({ ...paymentForm, linkType: e.target.value as 'NONE' | 'SERVICE_REQUEST' | 'AMC', serviceRequestId: '', amcId: '' })}
                  >
                    <option value="NONE">General Payment (No link)</option>
                    <option value="SERVICE_REQUEST">Link to Service Request</option>
                    <option value="AMC">Link to AMC Contract</option>
                  </select>
                </div>
              )}

              {paymentForm.customerId && paymentForm.linkType === 'SERVICE_REQUEST' && (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="payment-sr">
                    Service Request
                  </label>
                  <select
                    id="payment-sr"
                    className="form-select"
                    style={selectStyle}
                    required
                    value={paymentForm.serviceRequestId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, serviceRequestId: e.target.value })}
                  >
                    <option value="">Choose a service request</option>
                    {customerServiceRequests.map((sr) => (
                      <option key={sr.id} value={sr.id}>
                        {sr.requestNumber} · {sr.requestType} ({sr.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentForm.customerId && paymentForm.linkType === 'AMC' && (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="payment-amc">
                    AMC Contract
                  </label>
                  <select id="payment-amc" className="form-select" style={selectStyle} required value={paymentForm.amcId} onChange={(e) => setPaymentForm({ ...paymentForm, amcId: e.target.value })}>
                    <option value="">Choose an active contract</option>
                    {customerAmcs.map((amc) => (
                      <option key={amc.id} value={amc.id}>
                        {amc.contractNumber} ({amc.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Input
                label="Amount due (₹)"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={paymentForm.totalAmountDue}
                onChange={(e) => setPaymentForm({ ...paymentForm, totalAmountDue: e.target.value })}
              />
              <Button type="submit" isLoading={saving}>
                Create record
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div role="status">Loading payment records…</div>
      ) : records.length ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Customer</th>
                <th>Target</th>
                <th>Due</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const rowBalance = record.status === 'PAID' ? 0 : Math.max(0, Number(record.total_amount_due) - Number(record.total_amount_paid));
                const isSelected = selected === record.id;
                const rowFullyPaid = record.status === 'PAID' || rowBalance <= 0;
                return (
                  <React.Fragment key={record.id}>
                    <tr
                      onClick={() => setSelected((prev) => (prev === record.id ? null : record.id))}
                      style={{ cursor: 'pointer', background: isSelected ? 'var(--bg-surface-subtle)' : undefined }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isSelected ? <ChevronUp size={15} style={{ color: 'var(--color-brand)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                          <strong>{record.payment_number}</strong>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{record.customers?.name || record.customer_id}</div>
                        {record.customers?.customer_code && <div style={hintStyle}>{record.customers.customer_code}</div>}
                      </td>
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
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-brand)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontWeight: 600 }}
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
                        <strong style={{ color: rowBalance > 0 ? 'var(--color-warning-text, #f59e0b)' : 'var(--color-success-text, #10b981)' }}>
                          {money(rowBalance)}
                        </strong>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: '11px',
                            fontWeight: 600,
                            background: record.status === 'PAID' ? 'var(--color-success-bg, rgba(16, 185, 129, 0.1))' : record.status === 'PARTIALLY_PAID' ? 'var(--color-warning-bg, rgba(245, 158, 11, 0.1))' : 'rgba(2, 132, 199, 0.1)',
                            color: record.status === 'PAID' ? 'var(--color-success-text, #10b981)' : record.status === 'PARTIALLY_PAID' ? 'var(--color-warning-text, #f59e0b)' : 'var(--color-brand)',
                          }}
                        >
                          {record.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{dateOnly(record.created_at)}</td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Button size="sm" variant="secondary" leftIcon={<FileText size={13} />} onClick={() => setInvoiceModalRecord(record)} title="Official Tax Invoice & Receipt">
                            Invoice
                          </Button>
                          <Button size="sm" variant={isSelected ? 'primary' : 'ghost'} onClick={() => setSelected((prev) => (prev === record.id ? null : record.id))}>
                            {isSelected ? 'Close' : 'Entries'}
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {isSelected && (
                      <tr key={`${record.id}-expanded`} className="payment-expanded-row">
                        <td colSpan={9} style={{ padding: '0 0 16px 0', background: 'var(--bg-surface-subtle)' }}>
                          <div
                            style={{
                              margin: '8px 12px 14px',
                              padding: '18px 22px',
                              background: 'var(--bg-surface)',
                              border: '1.5px solid var(--border-moderate, #cbd5e1)',
                              borderRadius: 'var(--radius-lg, 10px)',
                              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 'var(--space-4)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--border-default)', paddingBottom: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-brand-soft, #f6e9e1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-brand)' }}>
                                  <Wallet size={18} />
                                </div>
                                <div>
                                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Payment Entries &amp; Settlement · {record.payment_number}</h3>
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Customer: <strong>{record.customers?.name || record.customer_id}</strong>
                                    {record.customers?.customer_code ? ` (${record.customers.customer_code})` : ''}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: 4,
                                    background: rowFullyPaid ? 'var(--color-success-bg, rgba(16, 185, 129, 0.1))' : 'var(--color-warning-bg, rgba(245, 158, 11, 0.1))',
                                    color: rowFullyPaid ? 'var(--color-success-text, #10b981)' : 'var(--color-warning-text, #f59e0b)',
                                  }}
                                >
                                  {rowFullyPaid ? 'FULLY SETTLED' : `BALANCE DUE: ${money(balanceDue)}`}
                                </span>
                                <Button size="sm" variant="secondary" leftIcon={<Printer size={13} />} onClick={() => setInvoiceModalRecord(record)}>
                                  Print Invoice
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setSelected(null)} title="Collapse this entry row">
                                  <ChevronUp size={15} />
                                </Button>
                              </div>
                            </div>

                            {rowFullyPaid ? (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 14,
                                  padding: '14px 18px',
                                  background: 'var(--color-success-bg, rgba(16, 185, 129, 0.08))',
                                  border: '1px solid var(--color-success-border, rgba(16, 185, 129, 0.25))',
                                  borderRadius: 'var(--radius-md)',
                                  color: 'var(--color-success-text, #10b981)',
                                }}
                              >
                                <CheckCircle size={22} style={{ color: 'var(--color-success-solid, #10b981)', flexShrink: 0 }} />
                                <div>
                                  <strong style={{ fontSize: '14.5px' }}>Payment Fully Settled</strong>
                                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: 2 }}>
                                    All {money(record.total_amount_due)} has been received and verified. Balance outstanding is {money(0)}. No further payment entries can be recorded.
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                <form onSubmit={collect} style={formGridStyle}>
                                  <div style={fieldStyle}>
                                    <label style={labelStyle} htmlFor="payment-method">
                                      Payment Method
                                    </label>
                                    <select id="payment-method" className="form-select" style={selectStyle} value={receiptForm.paymentMethod} onChange={(e) => setReceiptForm({ ...receiptForm, paymentMethod: e.target.value })}>
                                      <option value="CASH">Cash Payment</option>
                                      <option value="ONLINE">External online / UPI / Bank transfer</option>
                                    </select>
                                  </div>

                                  <div style={fieldStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <label style={labelStyle} htmlFor="payment-amount">
                                        Amount received (₹) *
                                      </label>
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

                                  <Input label="Notes" placeholder="Optional operational remarks" value={receiptForm.notes} onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })} />
                                  <Button type="submit" isLoading={saving}>
                                    Record payment
                                  </Button>
                                </form>

                                {receiptForm.paymentMethod === 'ONLINE' && (
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'auto 1fr',
                                      gap: 16,
                                      padding: 14,
                                      background: 'var(--bg-surface-subtle)',
                                      border: '1px solid var(--border-default)',
                                      borderRadius: 'var(--radius-md)',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <div style={{ textAlign: 'center' }}>
                                      <UpiQrCode amount={Number(receiptForm.amount) || balanceDue} note={`Payment ${record.payment_number}`} size={110} />
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                                        Scan to pay {money(Number(receiptForm.amount) || balanceDue)}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12.5px' }}>
                                      <strong style={{ color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <CreditCard size={15} /> Extreme Sales &amp; Services Bank Particulars
                                      </strong>
                                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '3px 8px', alignItems: 'center' }}>
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

                            {reversalTarget && (
                              <form onSubmit={reverse} style={formGridStyle} aria-label="Record payment reversal">
                                <Input label="Reversal amount (₹)" type="number" min="0.01" step="0.01" required value={reversalForm.amount} onChange={(e) => setReversalForm({ ...reversalForm, amount: e.target.value })} />
                                <Input label="Reason" required value={reversalForm.reason} onChange={(e) => setReversalForm({ ...reversalForm, reason: e.target.value })} />
                                <Button type="submit" variant="danger" isLoading={saving}>
                                  Save reversal
                                </Button>
                                <Button variant="ghost" onClick={() => setReversalTarget(null)}>
                                  Cancel
                                </Button>
                              </form>
                            )}

                            {transactions.length ? (
                              <div className="table-container">
                                <table className="table" style={{ fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th>Reference</th>
                                      <th>Type</th>
                                      <th>Method</th>
                                      <th>Amount</th>
                                      <th>Recorded by</th>
                                      <th>Date</th>
                                      <th>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {transactions.map((transaction) => (
                                      <tr key={transaction.id}>
                                        <td>
                                          {transaction.external_payment_reference || transaction.transaction_reference}
                                          <div style={hintStyle}>{transaction.notes || ''}</div>
                                        </td>
                                        <td>{transaction.entry_type || 'PAYMENT'}</td>
                                        <td>{transaction.payment_method}</td>
                                        <td>
                                          {transaction.entry_type === 'REVERSAL' ? '−' : ''}
                                          {money(transaction.amount)}
                                        </td>
                                        <td>{transaction.profiles?.full_name || transaction.recorded_by}</td>
                                        <td>{dateOnly(transaction.created_at)}</td>
                                        <td>
                                          {transaction.entry_type !== 'REVERSAL' && transaction.payment_status === 'SUCCESS' && (
                                            <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={() => setReversalTarget(transaction.id)}>
                                              Reverse
                                            </Button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>No payment entries recorded yet.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No payment records" description="Create a payment record for a customer to start tracking cash or trusted external payment references." />
      )}

      {invoiceModalRecord && (
        <PaymentInvoiceModal
          isOpen={Boolean(invoiceModalRecord)}
          onClose={() => setInvoiceModalRecord(null)}
          payment={invoiceModalRecord}
          transactions={invoiceTransactions}
          onPaymentUpdated={refresh}
        />
      )}
    </div>
  );
};

