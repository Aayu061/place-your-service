// src/pages/integrations/ExtremeSalesManagementWorkspace.tsx
// ═══════════════════════════════════════════════════════════════════════════
// EXTREME SALES & SERVICES (ESS) CENTRALIZED MANAGEMENT HUB
// Manage approved ESS bookings, storefront products & live AMC prices inside PYS
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store,
  Package,
  Wrench,
  RefreshCw,
  ExternalLink,
  Plus,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/useToast';
import { apiClient } from '@/services/api/client';
import { ServiceRequest, ServiceStatus } from '@/domain/types';
import { CatalogAmcPlansPanel } from './CatalogAmcPlansPanel';

interface EssProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  price_display?: string;
  stock: number;
  in_stock: boolean;
  brand?: string;
  model_number?: string;
  tonnage?: string;
  condition?: string;
  image_url?: string;
}

/** Request statuses where a technician can still be (re)assigned. */
const ASSIGNABLE_STATUSES = new Set<ServiceStatus>(['REQUESTED', 'PENDING', 'SCHEDULED', 'ASSIGNED', 'REVISIT_REQUIRED', 'ON_HOLD']);

function statusBadgeVariant(status: ServiceStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'COMPLETED' || status === 'CLOSED') return 'success';
  if (status === 'CANCELLED') return 'neutral';
  return 'warning';
}

export const ExtremeSalesManagementWorkspace: React.FC<{ onNavigate?: (item: string, params?: Record<string, string>) => void }> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'bookings' | 'products' | 'amc'>('bookings');
  const [loading, setLoading] = useState<boolean>(true);

  // Data states
  const [bookings, setBookings] = useState<ServiceRequest[]>([]);
  const [products, setProducts] = useState<EssProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Product Add/Edit Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<EssProduct | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('new_ac');
  const [formPrice, setFormPrice] = useState<string>('0');
  const [formStock, setFormStock] = useState<string>('10');
  const [formBrand, setFormBrand] = useState<string>('');
  const [formModel, setFormModel] = useState<string>('');
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load ESS bookings from Service Requests
      const srRes = await apiClient.get<{ data?: { requests: ServiceRequest[] }; requests?: ServiceRequest[] }>(
        '/service-requests?sourceChannel=EXTREME_SALES_SERVICES&pageSize=50'
      );
      const reqList = srRes?.data?.requests || srRes?.requests || [];
      setBookings(reqList);

      // 2. Load Storefront Products from PYS or Supabase
      const prodRes = await apiClient
        .get<{ products?: EssProduct[]; data?: { products?: EssProduct[] } }>('/ess-products')
        .catch(() => ({ products: [] as EssProduct[], data: undefined }));
      const prodList = prodRes?.products || prodRes?.data?.products || [];
      setProducts(prodList);
    } catch (err: unknown) {
      // Non-fatal fallback for UI development
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Failed loading ESS data:', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('new_ac');
    setFormPrice('0');
    setFormStock('10');
    setFormBrand('');
    setFormModel('');
    setFormImageUrl('https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=600&q=80');
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: EssProduct) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategory(prod.category);
    setFormPrice(String(prod.price));
    setFormStock(String(prod.stock));
    setFormBrand(prod.brand || '');
    setFormModel(prod.model_number || '');
    setFormImageUrl(prod.image_url || '');
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast({ type: 'error', title: 'Name Required', message: 'Please enter a product name.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: editingProduct?.id || `prod-${Date.now()}`,
        name: formName.trim(),
        category: formCategory,
        price: parseFloat(formPrice) || 0,
        price_display: `₹${(parseFloat(formPrice) || 0).toLocaleString('en-IN')}`,
        stock: parseInt(formStock, 10) || 0,
        in_stock: (parseInt(formStock, 10) || 0) > 0,
        brand: formBrand.trim() || undefined,
        model_number: formModel.trim() || undefined,
        image_url: formImageUrl.trim() || undefined,
      };

      await apiClient.post('/ess-products', payload);
      showToast({
        type: 'success',
        title: editingProduct ? 'Product Updated' : 'Product Created',
        message: `${payload.name} has been published to Extreme Sales & Services storefront.`,
      });
      setIsProductModalOpen(false);
      void loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast({ type: 'error', title: 'Save Failed', message: msg || 'Unable to save product.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBookings = bookings.filter(
    (b) =>
      b.requestNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-brand)' }}><Store size={26} /></span>
            <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>Extreme Sales &amp; Services Portal</h1>
            <Badge variant="brand">Storefront Hub</Badge>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            ESS bookings that were approved into service requests, the storefront product catalog and AMC prices.
            New website requests wait in the Approval Inbox first.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ExternalLink size={14} />}
            onClick={() => {
              const url = (import.meta.env.VITE_ESS_STOREFRONT_URL as string | undefined) ||
                (import.meta.env.PROD ? 'https://extreme-sales-services-gh7s.onrender.com' : 'http://localhost:5002');
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            Open Storefront
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void loadData()}
            isLoading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
        <Button
          variant={activeTab === 'bookings' ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={<Wrench size={14} />}
          onClick={() => setActiveTab('bookings')}
        >
          Storefront Bookings ({bookings.length})
        </Button>
        <Button
          variant={activeTab === 'products' ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={<Package size={14} />}
          onClick={() => setActiveTab('products')}
        >
          Product Catalog ({products.length})
        </Button>
        <Button
          variant={activeTab === 'amc' ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={<ShieldCheck size={14} />}
          onClick={() => setActiveTab('amc')}
        >
          AMC Plan Prices
        </Button>
      </div>

      {/* TAB 1: STOREFRONT BOOKINGS */}
      {activeTab === 'bookings' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <CardTitle>Storefront Bookings</CardTitle>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                Service requests that came from the ESS website. New ones appear here after approval in the{' '}
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('approval-inbox')}
                    style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-brand)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                  >
                    Approval Inbox
                  </button>
                ) : (
                  'Approval Inbox'
                )}
                .
              </p>
            </div>
            <div style={{ width: 240 }}>
              <Input
                placeholder="Search ticket # or issue..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardBody>
            {filteredBookings.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 8px', color: 'var(--color-success)' }} />
                <div style={{ fontWeight: 600 }}>All Storefront Requests Triaged</div>
                <div style={{ fontSize: 'var(--text-xs)' }}>New customer bookings from ESS will appear here in real time.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 'var(--text-xs)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Request #</th>
                      <th style={{ padding: '8px' }}>Type</th>
                      <th style={{ padding: '8px' }}>Description</th>
                      <th style={{ padding: '8px' }}>Priority</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px' }}>Date</th>
                      <th style={{ padding: '8px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-brand)' }}>
                          {b.requestNumber}
                        </td>
                        <td style={{ padding: '8px' }}><Badge>{b.requestType}</Badge></td>
                        <td style={{ padding: '8px', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.description}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Badge variant={(b.priority as string) === 'CRITICAL' || b.priority === 'HIGH' ? 'error' : 'neutral'}>
                            {b.priority}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Badge variant={statusBadgeVariant(b.status)}>{b.status}</Badge>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{b.createdAt.split('T')[0]}</td>
                        <td style={{ padding: '8px' }}>
                          {ASSIGNABLE_STATUSES.has(b.status) ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onNavigate?.('service-schedule', { requestId: b.id })}
                            >
                              Assign Tech
                            </Button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }} aria-label="No action">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* TAB 2: PRODUCT CATALOG */}
      {activeTab === 'products' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <CardTitle>Storefront AC Product Catalog</CardTitle>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                Products displayed on <code>extreme-sales-services.vercel.app/products.html</code>. Managed directly in Supabase.
              </p>
            </div>
            <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={handleOpenAddProduct}>
              Add Product
            </Button>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              {products.map((prod) => (
                <div
                  key={prod.id}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ height: 140, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
                    <img
                      src={prod.image_url || 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=600&q=80'}
                      alt={prod.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                      <Badge variant={prod.in_stock ? 'success' : 'error'}>
                        {prod.in_stock ? `In Stock (${prod.stock})` : 'Out of Stock'}
                      </Badge>
                    </div>
                  </div>
                  <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                      {prod.brand || 'Brand'} · {prod.category}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', lineHeight: 1.3 }}>{prod.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--color-brand)' }}>
                        {prod.price_display || `₹${prod.price.toLocaleString('en-IN')}`}
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => handleOpenEditProduct(prod)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* TAB 4: AMC PLAN PRICES — live from the shared catalog */}
      {activeTab === 'amc' && (
        <CatalogAmcPlansPanel onOpenInbox={onNavigate ? () => onNavigate('approval-inbox') : undefined} />
      )}

      {/* PRODUCT ADD/EDIT MODAL */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? 'Edit Storefront Product' : 'Add Storefront Product'}
      >
        <form onSubmit={handleSaveProduct} style={{ padding: 'var(--space-4)', minWidth: 380, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>
            {editingProduct ? 'Edit Storefront Product' : 'Add Storefront Product'}
          </h2>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Product Name</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="e.g. Daikin 1.5 TR Split AC" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Price (₹)</label>
              <Input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Stock Units</label>
              <Input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Brand</label>
              <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="e.g. Daikin" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Model #</label>
              <Input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder="e.g. FTKM50" />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 4 }}>Image URL</label>
            <Input value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setIsProductModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>Save to Storefront</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
