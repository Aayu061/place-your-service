import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, RefreshCw } from 'lucide-react';
import { operationsApi, PageResult, PartRecord } from '@/services/operationsApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';
import {
  formGridStyle,
  hintStyle,
  money,
  sectionStyle,
  toolbarStyle,
  useDebounce,
} from './workspaceShared';

export const PartCatalog: React.FC = () => {
  const { showToast } = useToast();
  const [partsPage, setPartsPage] = useState<PageResult<PartRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [form, setForm] = useState({ partCode: '', name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5' });

  const [editingPart, setEditingPart] = useState<PartRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5', isActive: true });
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPartsPage(await operationsApi.listParts({ search: debouncedSearch.trim() || undefined, page: 1, pageSize: 100 }));
    } catch (error) {
      showToast({ type: 'error', title: 'Parts unavailable', message: error instanceof Error ? error.message : 'Could not load parts.' });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await operationsApi.createPart({ ...form, unitCost: Number(form.unitCost), unitPrice: Number(form.unitPrice), lowStockThreshold: Number(form.lowStockThreshold) });
      showToast({ type: 'success', title: 'Part added', message: 'Opening stock can now be recorded in Inventory.' });
      setForm({ partCode: '', name: '', category: '', unitOfMeasure: 'PIECE', unitCost: '', unitPrice: '', lowStockThreshold: '5' });
      setShowCreate(false);
      await refresh();
    } catch (error) {
      showToast({ type: 'error', title: 'Could not add part', message: error instanceof Error ? error.message : 'Please check the part details.' });
    } finally {
      setSaving(false);
    }
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

  return (
    <div style={sectionStyle}>
      <div style={toolbarStyle}>
        <Input label="Search parts" value={search} onChange={(event) => setSearch(event.target.value)} isSearch placeholder="Part code or name" style={{ maxWidth: 320 }} />
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={15} />} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowCreate((open) => !open)}>
            {showCreate ? 'Close form' : 'Add part'}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>New part</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={create} style={formGridStyle}>
              <Input label="Part code" required value={form.partCode} onChange={(e) => setForm({ ...form, partCode: e.target.value })} />
              <Input label="Part name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input label="Unit" required value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} />
              <Input label="Unit cost (₹)" required type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
              <Input label="Unit price (₹)" required type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              <Input label="Low stock threshold" required type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
              <Button type="submit" isLoading={saving}>
                Save part
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div role="status">Loading parts…</div>
      ) : partsPage?.items.length ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Category</th>
                <th>On hand</th>
                <th>Low stock at</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {partsPage.items.map((part) => (
                <tr key={part.id}>
                  <td>
                    <strong>{part.part_code}</strong>
                    <div style={hintStyle}>{part.name}</div>
                  </td>
                  <td>{part.category || '—'}</td>
                  <td>
                    {part.current_stock} {part.unit_of_measure}
                  </td>
                  <td>{part.low_stock_threshold}</td>
                  <td>{money(part.unit_cost)}</td>
                  <td>{money(part.unit_price)}</td>
                  <td>
                    {!part.is_active ? (
                      <span style={{ color: 'var(--text-muted)' }}>Inactive</span>
                    ) : part.current_stock <= part.low_stock_threshold ? (
                      <span style={{ color: 'var(--color-warning-text)' }}>Low stock</span>
                    ) : (
                      'Available'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Button size="sm" variant="ghost" leftIcon={<Edit2 size={13} />} onClick={() => openEditModal(part)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void togglePartStatus(part)}
                        style={{ fontSize: 'var(--text-xs)', color: part.is_active ? 'var(--text-muted)' : 'var(--color-brand)' }}
                      >
                        {part.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No parts found" description="Add parts to establish the catalog. Stock changes are recorded separately in the inventory ledger." />
      )}

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
            <div className="form-grid-2">
              <Input label="Unit" required value={editForm.unitOfMeasure} onChange={(e) => setEditForm({ ...editForm, unitOfMeasure: e.target.value })} />
              <Input label="Low stock threshold" required type="number" min="0" step="1" value={editForm.lowStockThreshold} onChange={(e) => setEditForm({ ...editForm, lowStockThreshold: e.target.value })} />
            </div>
            <div className="form-grid-2">
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
              <Button variant="ghost" onClick={() => setEditingPart(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isUpdating}>
                Save changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

