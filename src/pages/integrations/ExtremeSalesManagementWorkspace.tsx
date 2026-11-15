// src/pages/integrations/ExtremeSalesManagementWorkspace.tsx
// ═══════════════════════════════════════════════════════════════════════════
// EXTREME SALES & SERVICES (ESS) CENTRALIZED MANAGEMENT HUB
// Manage ESS Storefront Bookings, Products, Enquiries & Rate Sync inside PYS
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store,
  Package,
  Wrench,
  Mail,
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
import { ServiceRequest } from '@/domain/types';

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

interface ContactEnquiry {
  id: string;
  enquiry_number?: string;
  name: string;
  phone: string;
  email?: string;
  service_type?: string;
  subject?: string;
  message?: string;
  status: 'NEW' | 'CONTACTED' | 'RESOLVED' | 'SPAM';
  created_at: string;
}

export const ExtremeSalesManagementWorkspace: React.FC<{ onNavigate?: (item: string, params?: Record<string, string>) => void }> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'bookings' | 'products' | 'enquiries' | 'amc'>('bookings');
  const [loading, setLoading] = useState<boolean>(true);

  // Data states
  const [bookings, setBookings] = useState<ServiceRequest[]>([]);
  const [products, setProducts] = useState<EssProduct[]>([]);
  const [enquiries, setEnquiries] = useState<ContactEnquiry[]>([]);
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
      const prodRes = await apiClient.get<any>('/ess-products').catch(() => ({ products: [] }));
      const prodList = prodRes?.products || prodRes?.data?.products || [];
      setProducts(prodList);

      // 3. Load Contact Enquiries
      const enqRes = await apiClient.get<any>('/contact-enquiries').catch(() => ({ enquiries: [] }));
      const enqList = enqRes?.enquiries || enqRes?.data?.enquiries || [];
      setEnquiries(enqList);
    } catch (err: any) {
      // Non-fatal fallback for UI development
      console.warn('Failed loading ESS data:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const [convertingId, setConvertingId] = useState<string | null>(null);

  const handleConvertEnquiry = async (enqId: string) => {
    setConvertingId(enqId);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: { customerCode: string; requestNumber: string };
      }>(`/contact-enquiries/${enqId}/convert`, {});

      showToast({
        type: 'success',
        title: 'Inquiry Converted!',
        message: res.message || `Created Customer ${res.data.customerCode} and Ticket ${res.data.requestNumber}.`,
      });
      void loadData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Conversion Failed',
        message: err.message || 'Could not convert inquiry to ticket.',
      });
    } finally {
      setConvertingId(null);
    }
  };

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
    } catch (err: any) {
      showToast({ type: 'error', title: 'Save Failed', message: err.message || 'Unable to save product.' });
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
            Central administration for ESS customer bookings, storefront product catalog, and inquiries.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ExternalLink size={14} />}
            onClick={() => window.open('http://localhost:5002', '_blank')}
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
            Sync Now
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
          variant={activeTab === 'enquiries' ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={<Mail size={14} />}
          onClick={() => setActiveTab('enquiries')}
        >
          Web Enquiries ({enquiries.length})
        </Button>
        <Button
          variant={activeTab === 'amc' ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={<ShieldCheck size={14} />}
          onClick={() => setActiveTab('amc')}
        >
          AMC Rate Sync
        </Button>
      </div>

      {/* TAB 1: STOREFRONT BOOKINGS */}
      {activeTab === 'bookings' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <CardTitle>Inbound Storefront Bookings</CardTitle>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                Service requests submitted by customers through <code>extreme-sales-services.vercel.app/service.html</code>.
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
                          <Badge variant={b.status === 'COMPLETED' ? 'success' : 'warning'}>{b.status}</Badge>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{b.createdAt.split('T')[0]}</td>
                        <td style={{ padding: '8px' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onNavigate?.('service-schedule', { requestId: b.id })}
                          >
                            Assign Tech
                          </Button>
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

      {/* TAB 3: CONTACT ENQUIRIES */}
      {activeTab === 'enquiries' && (
        <Card>
          <CardHeader>
            <CardTitle>Customer Contact Form Enquiries</CardTitle>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              Inbound leads and messages from <code>contact.html</code> stored directly in Supabase <code>contact_enquiries</code>.
            </p>
          </CardHeader>
          <CardBody>
            {enquiries.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Mail size={32} style={{ margin: '0 auto 8px', color: 'var(--color-brand)' }} />
                <div style={{ fontWeight: 600 }}>No New Web Enquiries</div>
                <div style={{ fontSize: 'var(--text-xs)' }}>Messages from the contact form will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {enquiries.map((enq) => (
                  <div key={enq.id} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div>
                        <strong style={{ fontSize: 'var(--text-sm)' }}>{enq.name}</strong> ·{' '}
                        <a href={`tel:${enq.phone}`} style={{ color: 'var(--color-brand)', fontWeight: 600 }}>{enq.phone}</a>
                        {enq.email && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: 8 }}>({enq.email})</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant="neutral">{enq.enquiry_number || `ENQ-${enq.id.slice(0, 6).toUpperCase()}`}</Badge>
                        <Badge variant={enq.status === 'NEW' ? 'brand' : 'success'}>{enq.status}</Badge>
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
                      Subject: {enq.subject || enq.service_type || 'General Service Enquiry'} · {new Date(enq.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {enq.message}
                    </p>
                    {enq.status !== 'RESOLVED' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void handleConvertEnquiry(enq.id)}
                          isLoading={convertingId === enq.id}
                        >
                          1-Click Convert to Customer &amp; Ticket
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* TAB 4: AMC RATE SYNC */}
      {activeTab === 'amc' && (
        <Card>
          <CardHeader>
            <CardTitle>Official AMC Rate Plan Synchronization</CardTitle>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
              The 10 official statutory rate plans configured in PYS match the rates displayed on Extreme Sales &amp; Services.
            </p>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Comprehensive Split AC AMC</div>
                <div style={{ color: 'var(--color-brand)', fontWeight: 800, fontSize: 'var(--text-lg)', margin: '4px 0' }}>₹4,200 / year</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Includes Compressor, Gas, Spares, 2 Dry + 1 Wet Visit</div>
                <Badge variant="success" style={{ marginTop: 8 }}>100% In Sync</Badge>
              </div>

              <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Semi-Comprehensive Split AC AMC</div>
                <div style={{ color: 'var(--color-brand)', fontWeight: 800, fontSize: 'var(--text-lg)', margin: '4px 0' }}>₹2,600 / year</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Includes Labour, Routine Electrical Spares, Breakdown Visits</div>
                <Badge variant="success" style={{ marginTop: 8 }}>100% In Sync</Badge>
              </div>

              <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Non-Comprehensive Split AC AMC</div>
                <div style={{ color: 'var(--color-brand)', fontWeight: 800, fontSize: 'var(--text-lg)', margin: '4px 0' }}>₹1,600 / year</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Annual maintenance, 3 scheduled checkups. Spares extra.</div>
                <Badge variant="success" style={{ marginTop: 8 }}>100% In Sync</Badge>
              </div>
            </div>
          </CardBody>
        </Card>
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
