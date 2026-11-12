import React, { useState } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Zap,
  Wrench,
  Percent,
  Calendar,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/useToast';
import { apiClient, ApiError } from '@/services/api/client';
import { AmcPlan, AmcFrequency } from '@/domain/types';

export interface AmcPlanRateCardsProps {
  plans: AmcPlan[];
  onPlansUpdated: () => void;
}

interface PlanFormData {
  planCode: string;
  name: string;
  category: 'SPECIAL_COMPREHENSIVE' | 'SEMI_COMPREHENSIVE' | 'ORDINARY' | 'PREMIUM_JACKET' | 'STANDALONE';
  description: string;
  coverageSummary: string;
  defaultFrequency: AmcFrequency;
  defaultVisitsPerYear: number;
  pricingModel: 'TIERED_TONNAGE' | 'FLAT_PER_UNIT' | 'PER_SERVICE';
  rateSplitSmall: number;
  rateSplitLarge: number;
  rateWindowSmall: number;
  rateWindowLarge: number;
  rateFlat: number;
  gstRatePercent: number;
  maxEquipmentAgeYears: number | '';
  hasGasCharging: boolean;
  hasSpareParts: boolean;
  hasUnlimitedComplaints: boolean;
  isActive: boolean;
}

const DEFAULT_FORM: PlanFormData = {
  planCode: '',
  name: '',
  category: 'ORDINARY',
  description: '',
  coverageSummary: '',
  defaultFrequency: 'QUARTERLY',
  defaultVisitsPerYear: 4,
  pricingModel: 'TIERED_TONNAGE',
  rateSplitSmall: 1000,
  rateSplitLarge: 1200,
  rateWindowSmall: 800,
  rateWindowLarge: 1000,
  rateFlat: 0,
  gstRatePercent: 18,
  maxEquipmentAgeYears: '',
  hasGasCharging: false,
  hasSpareParts: false,
  hasUnlimitedComplaints: true,
  isActive: true,
};

export const AmcPlanRateCards: React.FC<AmcPlanRateCardsProps> = ({
  plans,
  onPlansUpdated,
}) => {
  const { showToast } = useToast();
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AmcPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(DEFAULT_FORM);

  const filteredPlans = plans.filter((plan) => {
    if (!showArchived && plan.isActive === false) return false;
    if (filterCategory !== 'ALL' && plan.category !== filterCategory) return false;
    return true;
  });

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (plan: AmcPlan) => {
    setSelectedPlan(plan);
    setFormData({
      planCode: plan.planCode,
      name: plan.name,
      category: plan.category || 'ORDINARY',
      description: plan.description || '',
      coverageSummary: plan.coverageSummary || '',
      defaultFrequency: plan.defaultFrequency || 'QUARTERLY',
      defaultVisitsPerYear: plan.defaultVisitsPerYear || 4,
      pricingModel: plan.pricingModel || 'TIERED_TONNAGE',
      rateSplitSmall: plan.rateSplitSmall ?? 0,
      rateSplitLarge: plan.rateSplitLarge ?? 0,
      rateWindowSmall: plan.rateWindowSmall ?? 0,
      rateWindowLarge: plan.rateWindowLarge ?? 0,
      rateFlat: plan.rateFlat ?? 0,
      gstRatePercent: plan.gstRatePercent ?? 18,
      maxEquipmentAgeYears: plan.maxEquipmentAgeYears ?? '',
      hasGasCharging: Boolean(plan.hasGasCharging),
      hasSpareParts: Boolean(plan.hasSpareParts),
      hasUnlimitedComplaints: plan.hasUnlimitedComplaints !== false,
      isActive: plan.isActive !== false,
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (plan: AmcPlan) => {
    setSelectedPlan(plan);
    setIsDeleteModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.planCode.trim() || !formData.name.trim()) {
      showToast({ title: 'Validation Error', message: 'Plan Code and Name are required.', type: 'warning' });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/amc-contracts/plans', {
        ...formData,
        planCode: formData.planCode.trim().toUpperCase(),
        name: formData.name.trim(),
        maxEquipmentAgeYears: formData.maxEquipmentAgeYears === '' ? null : Number(formData.maxEquipmentAgeYears),
        description: formData.description.trim() || null,
        coverageSummary: formData.coverageSummary.trim() || null,
      });

      showToast({
        title: 'Plan Created',
        message: `Plan ${formData.planCode} added to rate chart successfully.`,
        type: 'success',
      });
      setIsCreateModalOpen(false);
      onPlansUpdated();
    } catch (err) {
      showToast({
        title: 'Plan Creation Failed',
        message: err instanceof ApiError ? err.message : 'Error creating plan',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await apiClient.put(`/amc-contracts/plans/${selectedPlan.id}`, {
        ...formData,
        planCode: formData.planCode.trim().toUpperCase(),
        name: formData.name.trim(),
        maxEquipmentAgeYears: formData.maxEquipmentAgeYears === '' ? null : Number(formData.maxEquipmentAgeYears),
        description: formData.description.trim() || null,
        coverageSummary: formData.coverageSummary.trim() || null,
      });

      showToast({
        title: 'Plan Updated',
        message: `Plan ${formData.planCode} has been updated.`,
        type: 'success',
      });
      setIsEditModalOpen(false);
      onPlansUpdated();
    } catch (err) {
      showToast({
        title: 'Update Failed',
        message: err instanceof ApiError ? err.message : 'Error updating plan',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedPlan || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.delete<{ action?: string; message?: string }>(`/amc-contracts/plans/${selectedPlan.id}`);
      showToast({
        title: res?.action === 'archived' ? 'Plan Archived' : 'Plan Deleted',
        message: res?.message || `Plan ${selectedPlan.planCode} was processed.`,
        type: res?.action === 'archived' ? 'info' : 'warning',
      });
      setIsDeleteModalOpen(false);
      onPlansUpdated();
    } catch (err) {
      showToast({
        title: 'Action Failed',
        message: err instanceof ApiError ? err.message : 'Could not delete or archive plan',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'SPECIAL_COMPREHENSIVE':
        return <Badge variant="warning">SPECIAL COMPREHENSIVE</Badge>;
      case 'SEMI_COMPREHENSIVE':
        return <Badge variant="info">SEMI COMPREHENSIVE</Badge>;
      case 'ORDINARY':
        return <Badge variant="neutral">ORDINARY</Badge>;
      case 'PREMIUM_JACKET':
        return <Badge variant="success">JACKET CLEANING</Badge>;
      case 'STANDALONE':
        return <Badge variant="neutral">STANDALONE SERVICE</Badge>;
      default:
        return <Badge variant="neutral">{cat || 'GENERAL'}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Top Banner / Actions Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          backgroundColor: 'var(--bg-surface)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: '0 0 4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Shield size={20} color="var(--color-primary-500)" />
              Extreme Sales &amp; Services — Official AMC Rate Chart
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              Authorized maintenance tiers with tonnage capacity splits (0.8–1.0 TR vs 1.5–2.2 TR), statutory GST rates (28% SAMC, 18% Others), and spare parts eligibility rules.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={onPlansUpdated}>
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              <Plus size={14} />
              Add Custom Plan
            </Button>
          </div>
        </div>

        {/* Filter Pill Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['ALL', 'SPECIAL_COMPREHENSIVE', 'SEMI_COMPREHENSIVE', 'ORDINARY', 'PREMIUM_JACKET', 'STANDALONE'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterCategory === cat ? '1px solid var(--color-primary-600)' : '1px solid var(--border-default)',
                  backgroundColor: filterCategory === cat ? 'var(--color-primary-50)' : 'var(--bg-surface)',
                  color: filterCategory === cat ? 'var(--color-primary-700)' : 'var(--text-secondary)',
                }}
              >
                {cat === 'ALL' ? 'All Plans' : cat.replace('_', ' ')}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show Inactive / Archived Plans
          </label>
        </div>
      </div>

      {/* Plans Grid */}
      {filteredPlans.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--text-secondary)',
          }}
        >
          <Shield size={36} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
          <p style={{ fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' }}>No Matching AMC Rate Plans</p>
          <p style={{ fontSize: 'var(--text-xs)', margin: '0 0 var(--space-4)' }}>
            {filterCategory !== 'ALL'
              ? `No active plans found in the "${filterCategory.replace('_', ' ')}" category.`
              : 'No plans currently in this view.'}
          </p>
          {filterCategory !== 'ALL' && (
            <Button size="sm" variant="secondary" onClick={() => setFilterCategory('ALL')}>
              Show All Plans ({plans.length})
            </Button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {filteredPlans.map((plan) => {
            const isTiered = plan.pricingModel === 'TIERED_TONNAGE';
          return (
            <div
              key={plan.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: plan.isActive ? '1px solid var(--border-default)' : '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                opacity: plan.isActive ? 1 : 0.7,
              }}
            >
              {/* Header */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--color-primary-600)',
                        backgroundColor: 'var(--bg-surface-subtle)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      {plan.planCode}
                    </span>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 2px 0' }}>
                      {plan.name}
                    </h3>
                  </div>
                  <div>{renderCategoryBadge(plan.category)}</div>
                </div>

                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                  {plan.coverageSummary || plan.description || 'Routine scheduled maintenance and servicing.'}
                </p>
              </div>

              {/* Pricing Box */}
              <div
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Rate Card &amp; Capacity Tiers:
                </div>

                {(() => {
                  if (!isTiered) {
                    return (
                      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {plan.pricingModel === 'PER_SERVICE' ? 'Flat Per Service' : 'Flat Per Unit / Year'}:
                        </span>
                        <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          ₹{(plan.rateFlat || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    );
                  }

                  const hasSplit = (plan.rateSplitSmall != null && plan.rateSplitSmall > 0) || (plan.rateSplitLarge != null && plan.rateSplitLarge > 0);
                  const hasWindow = (plan.rateWindowSmall != null && plan.rateWindowSmall > 0) || (plan.rateWindowLarge != null && plan.rateWindowLarge > 0);
                  const isUniform =
                    hasSplit &&
                    hasWindow &&
                    plan.rateSplitSmall === plan.rateSplitLarge &&
                    plan.rateWindowSmall === plan.rateWindowLarge;

                  if (isUniform) {
                    return (
                      <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>All Capacities (0.8 – 2.2 TR)</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Split AC:</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-600, #0284c7)' }}>
                            ₹{(plan.rateSplitSmall || 0).toLocaleString('en-IN')} / Yr
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Window AC:</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-600, #0284c7)' }}>
                            ₹{(plan.rateWindowSmall || 0).toLocaleString('en-IN')} / Yr
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>0.8 – 1.0 TR (Ton)</div>
                          {hasSplit && (
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              Split: ₹{(plan.rateSplitSmall || 0).toLocaleString('en-IN')}
                            </div>
                          )}
                          {hasWindow && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Window: ₹{(plan.rateWindowSmall || 0).toLocaleString('en-IN')}
                            </div>
                          )}
                          {!hasWindow && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Window: Not Offered
                            </div>
                          )}
                          {!hasSplit && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Split: Not Offered
                            </div>
                          )}
                        </div>

                        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>1.5 – 2.2 TR (Ton)</div>
                          {hasSplit && (
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                              Split: ₹{(plan.rateSplitLarge || 0).toLocaleString('en-IN')}
                            </div>
                          )}
                          {hasWindow && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Window: ₹{(plan.rateWindowLarge || 0).toLocaleString('en-IN')}
                            </div>
                          )}
                          {!hasWindow && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Window: Not Offered
                            </div>
                          )}
                          {!hasSplit && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Split: Not Offered
                            </div>
                          )}
                        </div>
                      </div>
                      {hasSplit && !hasWindow && (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                          Exclusively for Split Air Conditioners
                        </div>
                      )}
                      {!hasSplit && hasWindow && (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                          Exclusively for Window Air Conditioners
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Plan Feature Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(2, 132, 199, 0.08)', color: '#0284c7', fontWeight: 600 }}>
                  <Calendar size={12} />
                  {plan.defaultVisitsPerYear} visits / yr ({plan.defaultFrequency.toLowerCase()})
                </span>

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.08)', color: '#059669', fontWeight: 600 }}>
                  <Percent size={12} />
                  {plan.gstRatePercent === 28
                    ? 'GST Extra 28% (SAMC)'
                    : plan.gstRatePercent && plan.gstRatePercent > 0
                    ? `GST ${plan.gstRatePercent}%`
                    : 'Basic Rate (GST 18% as req.)'}
                </span>

                {plan.hasUnlimitedComplaints && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.08)', color: '#4f46e5', fontWeight: 600 }}>
                    <Zap size={12} />
                    Unlimited Complaints
                  </span>
                )}

                {plan.hasGasCharging && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(13, 148, 136, 0.08)', color: '#0d9488', fontWeight: 600 }}>
                    <Wrench size={12} />
                    Gas Included
                  </span>
                )}

                {plan.hasSpareParts && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(217, 119, 6, 0.08)', color: '#d97706', fontWeight: 600 }}>
                    <Layers size={12} />
                    Spares Included
                  </span>
                )}

                {plan.maxEquipmentAgeYears && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#dc2626', fontWeight: 600 }}>
                    <AlertTriangle size={12} />
                    Age Limit: &le; {plan.maxEquipmentAgeYears} Yrs
                  </span>
                )}

                {!plan.isActive && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Archived
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                <Button variant="secondary" size="sm" onClick={() => openEditModal(plan)}>
                  <Edit2 size={13} />
                  Edit Plan
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openDeleteModal(plan)}>
                  <Trash2 size={13} color="var(--color-error-solid)" />
                </Button>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* CREATE PLAN MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add AMC Contract Plan"
        description="Configure commercial rates, service visit cadence, and technical coverage boundaries."
        maxWidth="680px"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-grid-2">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Plan Code *
              </label>
              <Input
                value={formData.planCode}
                onChange={(e) => setFormData({ ...formData, planCode: e.target.value.toUpperCase() })}
                placeholder="e.g. SAMC-PREMIUM"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Plan Display Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Semi Comprehensive 4-Visit"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Category *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as PlanFormData['category'] })}
                required
              >
                <option value="SPECIAL_COMPREHENSIVE">Special Comprehensive (SAMC)</option>
                <option value="SEMI_COMPREHENSIVE">Semi Comprehensive</option>
                <option value="ORDINARY">Ordinary Maintenance</option>
                <option value="PREMIUM_JACKET">Premium Jacket Cleaning</option>
                <option value="STANDALONE">Standalone Service</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Pricing Model *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.pricingModel}
                onChange={(e) => setFormData({ ...formData, pricingModel: e.target.value as PlanFormData['pricingModel'] })}
                required
              >
                <option value="TIERED_TONNAGE">Tiered Capacity Tonnage (0.8-1.0T vs 1.5-2.2T)</option>
                <option value="FLAT_PER_UNIT">Flat Annual Rate Per Unit</option>
                <option value="PER_SERVICE">Flat Per Service</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Service Cadence Frequency *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.defaultFrequency}
                onChange={(e) => setFormData({ ...formData, defaultFrequency: e.target.value as AmcFrequency })}
                required
              >
                <option value="MONTHLY">Monthly (12 visits)</option>
                <option value="BI_MONTHLY">Bi-Monthly (6 visits)</option>
                <option value="QUARTERLY">Quarterly (4 visits)</option>
                <option value="FOUR_MONTHLY">Four-Monthly (3 visits)</option>
                <option value="HALF_YEARLY">Half-Yearly (2 visits)</option>
                <option value="YEARLY">Yearly (1 visit)</option>
                <option value="ON_DEMAND">On Demand</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Default Visits Per Year *
              </label>
              <Input
                type="number"
                min="1"
                max="52"
                value={formData.defaultVisitsPerYear}
                onChange={(e) => setFormData({ ...formData, defaultVisitsPerYear: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Pricing inputs */}
          {formData.pricingModel === 'TIERED_TONNAGE' ? (
            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Tiered Capacity Rates (INR)
              </div>
              <div className="form-grid-2">
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>0.8 – 1.0 TR Split Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateSplitSmall}
                    onChange={(e) => setFormData({ ...formData, rateSplitSmall: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>1.5 – 2.2 TR Split Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateSplitLarge}
                    onChange={(e) => setFormData({ ...formData, rateSplitLarge: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>0.8 – 1.0 TR Window Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateWindowSmall}
                    onChange={(e) => setFormData({ ...formData, rateWindowSmall: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>1.5 – 2.2 TR Window Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateWindowLarge}
                    onChange={(e) => setFormData({ ...formData, rateWindowLarge: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Flat Rate Amount (INR) *
              </label>
              <Input
                type="number"
                min="0"
                value={formData.rateFlat}
                onChange={(e) => setFormData({ ...formData, rateFlat: Number(e.target.value) })}
                required
              />
            </div>
          )}

          {/* Tax & Age limits */}
          <div className="form-grid-2">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                GST Tax Rate (%)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.gstRatePercent}
                onChange={(e) => setFormData({ ...formData, gstRatePercent: Number(e.target.value) })}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>28% for SAMC, 18% for standard plans</span>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Equipment Age Limit (Years)
              </label>
              <Input
                type="number"
                min="1"
                placeholder="Leave blank for no limit"
                value={formData.maxEquipmentAgeYears}
                onChange={(e) => setFormData({ ...formData, maxEquipmentAgeYears: e.target.value === '' ? '' : Number(e.target.value) })}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>e.g. 3 years for SAMC</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Coverage Summary &amp; Scope
            </label>
            <Input
              value={formData.coverageSummary}
              onChange={(e) => setFormData({ ...formData, coverageSummary: e.target.value })}
              placeholder="e.g. Includes compressor, coils, gas charging, and routine jet washes."
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Detailed Description / Customer Terms
            </label>
            <Textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Full technical notes or contract stipulations."
            />
          </div>

          {/* Scope toggles */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasUnlimitedComplaints}
                onChange={(e) => setFormData({ ...formData, hasUnlimitedComplaints: e.target.checked })}
              />
              Unlimited Breakdown Visits
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasGasCharging}
                onChange={(e) => setFormData({ ...formData, hasGasCharging: e.target.checked })}
              />
              Refrigerant / Gas Charging Included
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasSpareParts}
                onChange={(e) => setFormData({ ...formData, hasSpareParts: e.target.checked })}
              />
              Spare Parts Included
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Plan to Rate Chart'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT PLAN MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={selectedPlan ? `Edit Plan: ${selectedPlan.planCode}` : 'Edit Plan'}
        description="Update rates, terms, or active availability."
        maxWidth="680px"
      >
        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-grid-2">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Plan Code *
              </label>
              <Input
                value={formData.planCode}
                onChange={(e) => setFormData({ ...formData, planCode: e.target.value.toUpperCase() })}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Plan Display Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Category *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as PlanFormData['category'] })}
                required
              >
                <option value="SPECIAL_COMPREHENSIVE">Special Comprehensive (SAMC)</option>
                <option value="SEMI_COMPREHENSIVE">Semi Comprehensive</option>
                <option value="ORDINARY">Ordinary Maintenance</option>
                <option value="PREMIUM_JACKET">Premium Jacket Cleaning</option>
                <option value="STANDALONE">Standalone Service</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Pricing Model *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.pricingModel}
                onChange={(e) => setFormData({ ...formData, pricingModel: e.target.value as PlanFormData['pricingModel'] })}
                required
              >
                <option value="TIERED_TONNAGE">Tiered Capacity Tonnage (0.8-1.0T vs 1.5-2.2T)</option>
                <option value="FLAT_PER_UNIT">Flat Annual Rate Per Unit</option>
                <option value="PER_SERVICE">Flat Per Service</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Service Cadence Frequency *
              </label>
              <select
                className="input-neomorph"
                style={{ width: '100%', marginTop: '4px' }}
                value={formData.defaultFrequency}
                onChange={(e) => setFormData({ ...formData, defaultFrequency: e.target.value as AmcFrequency })}
                required
              >
                <option value="MONTHLY">Monthly (12 visits)</option>
                <option value="BI_MONTHLY">Bi-Monthly (6 visits)</option>
                <option value="QUARTERLY">Quarterly (4 visits)</option>
                <option value="FOUR_MONTHLY">Four-Monthly (3 visits)</option>
                <option value="HALF_YEARLY">Half-Yearly (2 visits)</option>
                <option value="YEARLY">Yearly (1 visit)</option>
                <option value="ON_DEMAND">On Demand</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Default Visits Per Year *
              </label>
              <Input
                type="number"
                min="1"
                max="52"
                value={formData.defaultVisitsPerYear}
                onChange={(e) => setFormData({ ...formData, defaultVisitsPerYear: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Pricing inputs */}
          {formData.pricingModel === 'TIERED_TONNAGE' ? (
            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Tiered Capacity Rates (INR)
              </div>
              <div className="form-grid-2">
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>0.8 – 1.0 TR Split Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateSplitSmall}
                    onChange={(e) => setFormData({ ...formData, rateSplitSmall: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>1.5 – 2.2 TR Split Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateSplitLarge}
                    onChange={(e) => setFormData({ ...formData, rateSplitLarge: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>0.8 – 1.0 TR Window Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateWindowSmall}
                    onChange={(e) => setFormData({ ...formData, rateWindowSmall: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>1.5 – 2.2 TR Window Rate</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.rateWindowLarge}
                    onChange={(e) => setFormData({ ...formData, rateWindowLarge: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Flat Rate Amount (INR) *
              </label>
              <Input
                type="number"
                min="0"
                value={formData.rateFlat}
                onChange={(e) => setFormData({ ...formData, rateFlat: Number(e.target.value) })}
                required
              />
            </div>
          )}

          {/* Tax & Age limits */}
          <div className="form-grid-2">
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                GST Tax Rate (%)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.gstRatePercent}
                onChange={(e) => setFormData({ ...formData, gstRatePercent: Number(e.target.value) })}
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Equipment Age Limit (Years)
              </label>
              <Input
                type="number"
                min="1"
                placeholder="Leave blank for no limit"
                value={formData.maxEquipmentAgeYears}
                onChange={(e) => setFormData({ ...formData, maxEquipmentAgeYears: e.target.value === '' ? '' : Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Coverage Summary &amp; Scope
            </label>
            <Input
              value={formData.coverageSummary}
              onChange={(e) => setFormData({ ...formData, coverageSummary: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Detailed Description
            </label>
            <Textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* Scope toggles & Active switch */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasUnlimitedComplaints}
                onChange={(e) => setFormData({ ...formData, hasUnlimitedComplaints: e.target.checked })}
              />
              Unlimited Breakdown Visits
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasGasCharging}
                onChange={(e) => setFormData({ ...formData, hasGasCharging: e.target.checked })}
              />
              Gas Charging Included
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hasSpareParts}
                onChange={(e) => setFormData({ ...formData, hasSpareParts: e.target.checked })}
              />
              Spare Parts Included
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: formData.isActive ? '#059669' : '#dc2626' }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Plan Active
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" type="button" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving Changes...' : 'Update Plan'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE / ARCHIVE CONFIRMATION MODAL */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={selectedPlan ? `Delete / Archive Plan: ${selectedPlan.planCode}` : 'Delete Plan'}
        description="Safely removes or archives this AMC plan."
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-error-text)',
              lineHeight: 1.5,
            }}
          >
            <strong>Safety Check:</strong> If any active or historical AMC contracts are linked to this plan, it will be automatically <em>archived</em> (set inactive) rather than permanently deleted, ensuring existing customer records and audit trails remain intact.
          </div>

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            Are you sure you want to remove <strong>{selectedPlan?.name}</strong> ({selectedPlan?.planCode}) from the rate chart?
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="secondary" type="button" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={handleDeleteSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : 'Confirm Remove / Archive'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
