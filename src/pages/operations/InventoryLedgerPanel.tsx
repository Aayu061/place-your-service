import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '@/services/api/client';
import { operationsApi, PartRecord, InventoryTransactionRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TablePagination } from '@/components/ui/TablePagination';
import { useToast } from '@/components/ui/useToast';
import {
  dateOnly,
  fieldStyle,
  formGridStyle,
  hintStyle,
  labelStyle,
  ReportOption,
  sectionStyle,
  selectStyle,
  toolbarStyle,
} from './workspaceShared';

export const InventoryLedger: React.FC = () => {
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
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [partResult, ledgerResult, reportResult] = await Promise.all([
        operationsApi.listParts({ page: 1, pageSize: 100 }),
        operationsApi.listInventoryTransactions({ page, pageSize: 25 }),
        apiClient.get<{ reports: ReportOption[] }>('/service-reports', { params: { page: 1, pageSize: 100 } }),
      ]);
      setParts(partResult.items);
      setHistory(ledgerResult.items);
      setTotalPages(ledgerResult.totalPages);
      setTotal(ledgerResult.total);
      setReports(reportResult.reports || []);
      if (!form.partId && partResult.items[0]) {
        setForm((current) => ({ ...current, partId: partResult.items[0].id }));
      }
    } catch (error) {
      showToast({ type: 'error', title: 'Inventory unavailable', message: error instanceof Error ? error.message : 'Could not load inventory data.' });
    } finally {
      setLoading(false);
    }
  }, [form.partId, page, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
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
    } catch (error) {
      showToast({ type: 'error', title: 'Stock movement rejected', message: error instanceof Error ? error.message : 'Could not update stock.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={sectionStyle}>
      <Card>
        <CardHeader>
          <CardTitle>Record stock movement</CardTitle>
        </CardHeader>
        <CardBody>
          {parts.length === 0 ? (
            <p>No parts exist yet. Add a part in the Parts workspace before recording stock.</p>
          ) : (
            <form onSubmit={submit} style={formGridStyle}>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="inventory-part">
                  Part
                </label>
                <select id="inventory-part" className="form-select" style={selectStyle} value={form.partId} onChange={(e) => setForm({ ...form, partId: e.target.value })} required>
                  <option value="">Choose a part</option>
                  {parts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.part_code} · {part.name} ({part.current_stock} on hand)
                    </option>
                  ))}
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle} htmlFor="inventory-type">
                  Movement
                </label>
                <select id="inventory-type" className="form-select" style={selectStyle} value={form.transactionType} onChange={(e) => setForm({ ...form, transactionType: e.target.value })}>
                  <option value="OPENING">Opening stock</option>
                  <option value="PURCHASE">Purchase receipt</option>
                  <option value="RETURN">Return</option>
                  <option value="SERVICE_USAGE">Service consumption</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>

              {form.transactionType === 'ADJUSTMENT' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Adjustment Direction</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button type="button" size="sm" variant={adjustmentDirection === 'ADD' ? 'primary' : 'secondary'} onClick={() => setAdjustmentDirection('ADD')}>
                      + Add stock
                    </Button>
                    <Button type="button" size="sm" variant={adjustmentDirection === 'DEDUCT' ? 'primary' : 'secondary'} onClick={() => setAdjustmentDirection('DEDUCT')}>
                      − Deduct stock
                    </Button>
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

              {form.transactionType === 'SERVICE_USAGE' && (
                <div style={fieldStyle}>
                  <label style={labelStyle} htmlFor="inventory-report">
                    Service report
                  </label>
                  <select id="inventory-report" className="form-select" style={selectStyle} value={form.serviceReportId} onChange={(e) => setForm({ ...form, serviceReportId: e.target.value })} required>
                    <option value="">Choose an issued report</option>
                    {reports
                      .filter((report) => ['SUBMITTED', 'VERIFIED'].includes(report.status))
                      .map((report) => (
                        <option key={report.id} value={report.id}>
                          {report.reportNumber} · {dateOnly(report.serviceDate)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {form.transactionType === 'SERVICE_USAGE' && (
                <Input label="Price per unit (₹)" type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              )}
              <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button type="submit" isLoading={saving}>
                Save movement
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Inventory ledger</h2>
          <span style={hintStyle}>Every balance change is recorded with a reason.</span>
        </div>
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={15} />} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div role="status">Loading stock history…</div>
      ) : history.length ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Part</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{dateOnly(row.created_at)}</td>
                  <td>{row.parts?.part_code || row.part_id}</td>
                  <td>{row.transaction_type}</td>
                  <td style={{ color: row.quantity < 0 ? 'var(--color-error-solid)' : 'var(--color-success-solid)' }}>
                    {row.quantity > 0 ? '+' : ''}
                    {row.quantity}
                  </td>
                  <td>{row.reason}</td>
                  <td>{row.reference_type ? `${row.reference_type} · ${row.reference_id}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination page={page} pageSize={25} total={total} totalPages={totalPages} onPageChange={setPage} itemLabel="movements" />
        </div>
      ) : (
        <EmptyState title="No stock movements yet" description="Record opening stock, purchases, returns, service use, or adjustments to start the ledger." />
      )}
    </div>
  );
};
