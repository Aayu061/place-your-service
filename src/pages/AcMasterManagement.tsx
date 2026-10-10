import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Edit2,
  Power,
  Layers,
  Filter,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { apiClient, ApiError } from '@/services/api/client';
import { AcBrand, AcModel, AcModelVariant } from '../domain/types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/feedback/EmptyState';
import { useToast } from '@/components/ui/useToast';

interface AcMasterManagementProps {
  onNavigate?: (route: string) => void;
}

interface BrandsApiResponse {
  data?: { brands?: AcBrand[] };
  brands?: AcBrand[];
}

interface ModelsApiResponse {
  data?: { models?: AcModel[] };
  models?: AcModel[];
}

export const AcMasterManagement: React.FC<AcMasterManagementProps> = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'brands' | 'models'>('brands');

  // Brand state
  const [brands, setBrands] = useState<AcBrand[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [brandActiveFilter, setBrandActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Brand Modal state
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<AcBrand | null>(null);
  const [brandName, setBrandName] = useState('');
  const [brandCode, setBrandCode] = useState('');
  const [brandIsActive, setBrandIsActive] = useState(true);
  const [isSubmittingBrand, setIsSubmittingBrand] = useState(false);
  const [brandFormError, setBrandFormError] = useState<string | null>(null);

  // Model state
  const [models, setModels] = useState<AcModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('ALL');
  const [modelActiveFilter, setModelActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Model Modal state
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AcModel | null>(null);
  const [modelBrandId, setModelBrandId] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [modelAcType, setModelAcType] = useState('Split AC');
  const [modelTechnology, setModelTechnology] = useState('Inverter');
  const [modelCapacityTons, setModelCapacityTons] = useState('1.5');
  const [modelRating, setModelRating] = useState('5 Star');
  const [modelRefrigerant, setModelRefrigerant] = useState('R32');
  const [modelIsActive, setModelIsActive] = useState(true);
  const [isSubmittingModel, setIsSubmittingModel] = useState(false);
  const [modelFormError, setModelFormError] = useState<string | null>(null);

  // Variant Modal state
  const [selectedModelForVariants, setSelectedModelForVariants] = useState<AcModel | null>(null);
  const [variants, setVariants] = useState<AcModelVariant[]>([]);
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);
  const [isVariantsModalOpen, setIsVariantsModalOpen] = useState(false);
  const [isAddingVariant, setIsAddingVariant] = useState(false);
  const [variantCode, setVariantCode] = useState('');
  const [variantCapacityTons, setVariantCapacityTons] = useState('1.5');
  const [variantCapacityDisplay, setVariantCapacityDisplay] = useState('1.5 Ton');
  const [variantStarRating, setVariantStarRating] = useState('5 Star');
  const [variantAcType, setVariantAcType] = useState('Split AC');
  const [variantTechnology, setVariantTechnology] = useState('Inverter');
  const [variantRefrigerant, setVariantRefrigerant] = useState('R32');
  const [variantSeries, setVariantSeries] = useState('');
  const [isSubmittingVariant, setIsSubmittingVariant] = useState(false);
  const [variantFormError, setVariantFormError] = useState<string | null>(null);

  // Load brands
  const fetchBrands = useCallback(async () => {
    setIsLoadingBrands(true);
    try {
      const activeParam = brandActiveFilter === 'ALL' ? '' : `&activeOnly=${brandActiveFilter === 'ACTIVE'}`;
      const searchParam = brandSearch.trim() ? `&search=${encodeURIComponent(brandSearch.trim())}` : '';
      const res = await apiClient.get<BrandsApiResponse>(
        `/ac-brands?page=1&pageSize=100${activeParam}${searchParam}`
      );
      const brandList = res?.data?.brands || res?.brands || [];
      setBrands(brandList);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load AC brands';
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsLoadingBrands(false);
    }
  }, [brandActiveFilter, brandSearch, showToast]);

  // Load models
  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const brandParam = selectedBrandFilter !== 'ALL' ? `&brandId=${selectedBrandFilter}` : '';
      const activeParam = modelActiveFilter === 'ALL' ? '' : `&activeOnly=${modelActiveFilter === 'ACTIVE'}`;
      const searchParam = modelSearch.trim() ? `&search=${encodeURIComponent(modelSearch.trim())}` : '';
      const res = await apiClient.get<ModelsApiResponse>(
        `/ac-models?page=1&pageSize=100${brandParam}${activeParam}${searchParam}`
      );
      const modelList = res?.data?.models || res?.models || [];
      setModels(modelList);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load AC models';
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsLoadingModels(false);
    }
  }, [selectedBrandFilter, modelActiveFilter, modelSearch, showToast]);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Brand modal helpers
  const openCreateBrandModal = () => {
    setEditingBrand(null);
    setBrandName('');
    setBrandCode('');
    setBrandIsActive(true);
    setBrandFormError(null);
    setIsBrandModalOpen(true);
  };

  const openEditBrandModal = (brand: AcBrand) => {
    setEditingBrand(brand);
    setBrandName(brand.name);
    setBrandCode(brand.code);
    setBrandIsActive(brand.isActive);
    setBrandFormError(null);
    setIsBrandModalOpen(true);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;

    setIsSubmittingBrand(true);
    setBrandFormError(null);

    try {
      if (editingBrand) {
        await apiClient.patch(`/ac-brands/${editingBrand.id}`, {
          name: brandName.trim(),
          code: brandCode.trim() || undefined,
          isActive: brandIsActive,
        });
        showToast({ type: 'success', title: 'Brand Updated', message: `AC brand '${brandName}' updated successfully.` });
      } else {
        await apiClient.post('/ac-brands', {
          name: brandName.trim(),
          code: brandCode.trim() || undefined,
          isActive: brandIsActive,
        });
        showToast({ type: 'success', title: 'Brand Created', message: `AC brand '${brandName}' created successfully.` });
      }
      setIsBrandModalOpen(false);
      await fetchBrands();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save brand';
      setBrandFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingBrand(false);
    }
  };

  const handleToggleBrandStatus = async (brand: AcBrand) => {
    const nextStatus = !brand.isActive;
    const action = nextStatus ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} brand '${brand.name}'?`)) return;

    try {
      await apiClient.patch(`/ac-brands/${brand.id}/status`, { isActive: nextStatus });
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: `AC brand '${brand.name}' ${nextStatus ? 'activated' : 'deactivated'}.`,
      });
      await fetchBrands();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to change brand status';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  // Model modal helpers
  const openCreateModelModal = () => {
    setEditingModel(null);
    setModelBrandId(selectedBrandFilter !== 'ALL' ? selectedBrandFilter : brands.length > 0 ? brands[0].id : '');
    setModelNumber('');
    setModelAcType('Split AC');
    setModelTechnology('Inverter');
    setModelCapacityTons('1.5');
    setModelRating('5 Star');
    setModelRefrigerant('R32');
    setModelIsActive(true);
    setModelFormError(null);
    setIsModelModalOpen(true);
  };

  const openEditModelModal = (model: AcModel) => {
    setEditingModel(model);
    setModelBrandId(model.brandId);
    setModelNumber(model.modelNumber);
    setModelAcType(model.acType || 'Split AC');
    setModelTechnology(model.technology || 'Inverter');
    setModelCapacityTons(model.capacityTons ? String(model.capacityTons) : '1.5');
    setModelRating(model.rating || '5 Star');
    setModelRefrigerant(model.refrigerant || 'R32');
    setModelIsActive(model.isActive);
    setModelFormError(null);
    setIsModelModalOpen(true);
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelNumber.trim() || (!editingModel && !modelBrandId)) return;

    setIsSubmittingModel(true);
    setModelFormError(null);

    try {
      if (editingModel) {
        await apiClient.patch(`/ac-models/${editingModel.id}`, {
          modelNumber: modelNumber.trim(),
          acType: modelAcType || null,
          technology: modelTechnology || null,
          capacityTons: modelCapacityTons ? parseFloat(modelCapacityTons) : null,
          rating: modelRating || null,
          refrigerant: modelRefrigerant || null,
          isActive: modelIsActive,
        });
        showToast({ type: 'success', title: 'Model Updated', message: `AC model '${modelNumber}' updated successfully.` });
      } else {
        await apiClient.post('/ac-models', {
          brandId: modelBrandId,
          modelNumber: modelNumber.trim(),
          acType: modelAcType || null,
          technology: modelTechnology || null,
          capacityTons: modelCapacityTons ? parseFloat(modelCapacityTons) : null,
          rating: modelRating || null,
          refrigerant: modelRefrigerant || null,
          isActive: modelIsActive,
        });
        showToast({ type: 'success', title: 'Model Created', message: `AC model '${modelNumber}' created successfully.` });
      }
      setIsModelModalOpen(false);
      await fetchModels();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save model';
      setModelFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingModel(false);
    }
  };

  const handleToggleModelStatus = async (model: AcModel) => {
    const nextStatus = !model.isActive;
    const action = nextStatus ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} model '${model.modelNumber}'?`)) return;

    try {
      await apiClient.patch(`/ac-models/${model.id}/status`, { isActive: nextStatus });
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: `AC model '${model.modelNumber}' ${nextStatus ? 'activated' : 'deactivated'}.`,
      });
      await fetchModels();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to change model status';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  const fetchVariants = useCallback(async (modelId: string) => {
    setIsLoadingVariants(true);
    try {
      const res = await apiClient.get<{ success?: boolean; data?: { variants?: AcModelVariant[] }; variants?: AcModelVariant[] }>(
        `/ac-models/${modelId}/variants?activeOnly=false`
      );
      const list = res?.data?.variants || res?.variants || [];
      setVariants(list);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load model variants';
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsLoadingVariants(false);
    }
  }, [showToast]);

  const openVariantsModal = (model: AcModel) => {
    setSelectedModelForVariants(model);
    setIsVariantsModalOpen(true);
    setIsAddingVariant(false);
    setVariantCode('');
    setVariantCapacityTons(model.capacityTons ? String(model.capacityTons) : '1.5');
    setVariantCapacityDisplay(model.capacityTons ? `${model.capacityTons} Ton` : '1.5 Ton');
    setVariantStarRating(model.rating || '5 Star');
    setVariantAcType(model.acType || 'Split AC');
    setVariantTechnology(model.technology || 'Inverter');
    setVariantRefrigerant(model.refrigerant || 'R32');
    setVariantSeries('');
    setVariantFormError(null);
    fetchVariants(model.id);
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelForVariants) return;
    const cap = parseFloat(variantCapacityTons);
    if (isNaN(cap) || cap <= 0) {
      setVariantFormError('Capacity must be a positive number');
      return;
    }

    setIsSubmittingVariant(true);
    setVariantFormError(null);
    try {
      await apiClient.post(`/ac-models/${selectedModelForVariants.id}/variants`, {
        variantCode: variantCode.trim() || undefined,
        capacityTons: cap,
        capacityDisplay: variantCapacityDisplay.trim() || undefined,
        starRating: variantStarRating,
        acType: variantAcType,
        technology: variantTechnology,
        refrigerant: variantRefrigerant.trim() || undefined,
        series: variantSeries.trim() || undefined,
        sourceProvenance: 'ADMIN_MANUAL_ENTRY',
        isActive: true,
      });
      showToast({ type: 'success', title: 'Variant Added', message: 'Verified model variant added successfully.' });
      setIsAddingVariant(false);
      setVariantCode('');
      setVariantSeries('');
      await fetchVariants(selectedModelForVariants.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create variant';
      setVariantFormError(msg);
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsSubmittingVariant(false);
    }
  };

  const handleToggleVariantStatus = async (variant: AcModelVariant) => {
    if (!selectedModelForVariants) return;
    const nextStatus = !variant.isActive;
    try {
      await apiClient.patch(`/ac-variants/${variant.id}/status`, { isActive: nextStatus });
      showToast({
        type: 'success',
        title: 'Variant Updated',
        message: `Variant ${variant.variantCode || variant.capacityDisplay || variant.capacityTons + ' Ton'} ${nextStatus ? 'activated' : 'deactivated'}.`,
      });
      await fetchVariants(selectedModelForVariants.id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update variant status';
      showToast({ type: 'error', title: 'Error', message: msg });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', padding: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Boxes size={24} style={{ color: 'var(--color-brand)' }} />
            AC Master Data Management
          </h2>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Admin configuration for verified HVAC equipment brands and technical product models
          </span>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {activeTab === 'brands' ? (
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateBrandModal}>
              + Add New Brand
            </Button>
          ) : (
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateModelModal} disabled={brands.length === 0}>
              + Add New Model
            </Button>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--border-default)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('brands')}
          style={{
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'brands' ? '2px solid var(--color-brand)' : '2px solid transparent',
            color: activeTab === 'brands' ? 'var(--color-brand)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Layers size={16} />
          AC Brands ({brands.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('models')}
          style={{
            padding: '10px 18px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'models' ? '2px solid var(--color-brand)' : '2px solid transparent',
            color: activeTab === 'models' ? 'var(--color-brand)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Boxes size={16} />
          AC Models ({models.length})
        </button>
      </div>

      {/* TAB 1: BRANDS */}
      {activeTab === 'brands' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px' }}>
              <Input
                placeholder="Search brand by name or code..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <select
              className="select"
              value={brandActiveFilter}
              onChange={(e) => setBrandActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Brands Only</option>
              <option value="INACTIVE">Inactive Brands Only</option>
            </select>
          </div>

          {/* Brands Content */}
          {isLoadingBrands ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading AC Brands...
            </div>
          ) : brands.length === 0 ? (
            <EmptyState
              title="No AC Brands Found"
              description="No equipment brands match the filter criteria."
              actionLabel="+ Add New Brand"
              onAction={openCreateBrandModal}
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {brands.map((b) => (
                <div
                  key={b.id}
                  className="card"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    borderLeft: `4px solid ${b.isActive ? 'var(--color-success-solid, #10b981)' : 'var(--border-default)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700 }}>{b.name}</h4>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        CODE: {b.code}
                      </span>
                    </div>
                    <Badge variant={b.isActive ? 'success' : 'neutral'}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    Models Registered: <strong>{b.modelCount ?? 0}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit2 size={13} />}
                      onClick={() => openEditBrandModal(b)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={b.isActive ? 'ghost' : 'outline'}
                      size="sm"
                      leftIcon={<Power size={13} />}
                      onClick={() => handleToggleBrandStatus(b)}
                    >
                      {b.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODELS */}
      {activeTab === 'models' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px' }}>
              <Input
                placeholder="Search model number, AC type, technology..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                leftIcon={<Search size={16} />}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Filter size={16} style={{ color: 'var(--text-muted)' }} />
              <select
                className="select"
                value={selectedBrandFilter}
                onChange={(e) => setSelectedBrandFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <option value="ALL">All Brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <select
              className="select"
              value={modelActiveFilter}
              onChange={(e) => setModelActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Models Only</option>
              <option value="INACTIVE">Inactive Models Only</option>
            </select>
          </div>

          {/* Models Content */}
          {isLoadingModels ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading AC Models...
            </div>
          ) : models.length === 0 ? (
            <EmptyState
              title="No AC Models Found"
              description="No equipment models match the selected filter criteria."
              actionLabel="+ Add New Model"
              onAction={openCreateModelModal}
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {models.map((m) => (
                <div
                  key={m.id}
                  className="card"
                  style={{
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    borderLeft: `4px solid ${m.isActive ? 'var(--color-brand)' : 'var(--border-default)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-brand)', textTransform: 'uppercase' }}>
                        {m.brandName || 'Brand'}
                      </span>
                      <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700 }}>
                        {m.modelNumber}
                      </h4>
                    </div>
                    <Badge variant={m.isActive ? 'success' : 'neutral'}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong>Type:</strong> {m.acType || 'N/A'}
                    </div>
                    <div>
                      <strong>Tech:</strong> {m.technology || 'N/A'}
                    </div>
                    <div>
                      <strong>Capacity:</strong> {m.capacityTons ? `${m.capacityTons} Ton` : 'N/A'}
                    </div>
                    <div>
                      <strong>Rating:</strong> {m.rating || 'N/A'}
                    </div>
                    <div>
                      <strong>Gas:</strong> {m.refrigerant || 'N/A'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Layers size={13} />}
                      onClick={() => openVariantsModal(m)}
                    >
                      Variants
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit2 size={13} />}
                      onClick={() => openEditModelModal(m)}
                    >
                      Edit Specs
                    </Button>
                    <Button
                      variant={m.isActive ? 'ghost' : 'outline'}
                      size="sm"
                      leftIcon={<Power size={13} />}
                      onClick={() => handleToggleModelStatus(m)}
                    >
                      {m.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BRAND MODAL (Create / Edit) */}
      <Modal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
        title={editingBrand ? `Edit Brand: ${editingBrand.name}` : 'Add New AC Brand'}
        description="Register a verified air conditioning equipment manufacturer"
      >
        <form onSubmit={handleSaveBrand} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {brandFormError && (
            <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} />
              {brandFormError}
            </div>
          )}

          <Input
            label="Brand Name *"
            placeholder="e.g. Daikin, Mitsubishi Electric, Voltas"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            required
          />

          <Input
            label="Brand Code (Optional)"
            placeholder="e.g. DAIKIN (auto-generated if blank)"
            value={brandCode}
            onChange={(e) => setBrandCode(e.target.value)}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="checkbox"
              id="brandActiveCheckbox"
              checked={brandIsActive}
              onChange={(e) => setBrandIsActive(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="brandActiveCheckbox" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              Active (Available for new asset registrations)
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button variant="outline" onClick={() => setIsBrandModalOpen(false)} disabled={isSubmittingBrand}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingBrand} leftIcon={<CheckCircle2 size={16} />}>
              {editingBrand ? 'Save Changes' : 'Create Brand'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODEL MODAL (Create / Edit) */}
      <Modal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        title={editingModel ? `Edit Model: ${editingModel.modelNumber}` : 'Add New AC Model'}
        description="Configure product specifications for automated asset auto-fill"
      >
        <form onSubmit={handleSaveModel} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {modelFormError && (
            <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={14} />
              {modelFormError}
            </div>
          )}

          {!editingModel && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                Manufacturer / Brand *
              </label>
              <select
                className="select"
                value={modelBrandId}
                onChange={(e) => setModelBrandId(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Model Number / Code *"
            placeholder="e.g. FTKF50TV, 185V-VECTRA"
            value={modelNumber}
            onChange={(e) => setModelNumber(e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                AC Type
              </label>
              <select
                className="select"
                value={modelAcType}
                onChange={(e) => setModelAcType(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
              >
                <option value="Split AC">Split AC</option>
                <option value="Window AC">Window AC</option>
                <option value="Cassette AC">Cassette AC</option>
                <option value="Floor Standing AC">Floor Standing AC</option>
                <option value="Tower AC">Tower AC</option>
                <option value="Ductable AC">Ductable AC</option>
                <option value="Ceiling Suspended AC">Ceiling Suspended AC</option>
                <option value="Portable AC">Portable AC</option>
                <option value="Central AC">Central AC</option>
                <option value="Package AC">Package AC</option>
                <option value="VRF System">VRF System</option>
                <option value="VRV System">VRV System</option>
                <option value="AHU / FCU Connected System">AHU / FCU Connected System</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                Technology
              </label>
              <select
                className="select"
                value={modelTechnology}
                onChange={(e) => setModelTechnology(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
              >
                <option value="Inverter">Inverter</option>
                <option value="Non-Inverter">Non-Inverter</option>
                <option value="Fixed Speed">Fixed Speed</option>
                <option value="Variable Speed">Variable Speed</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Capacity (Tons)"
              type="number"
              step="0.1"
              placeholder="e.g. 1.5"
              value={modelCapacityTons}
              onChange={(e) => setModelCapacityTons(e.target.value)}
            />

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                Energy Rating
              </label>
              <select
                className="select"
                value={modelRating}
                onChange={(e) => setModelRating(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
              >
                <option value="5 Star">5 Star</option>
                <option value="4 Star">4 Star</option>
                <option value="3 Star">3 Star</option>
                <option value="2 Star">2 Star</option>
                <option value="1 Star">1 Star</option>
                <option value="Not Rated">Not Rated</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                Refrigerant
              </label>
              <select
                className="select"
                value={modelRefrigerant}
                onChange={(e) => setModelRefrigerant(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
              >
                <option value="R32">R32</option>
                <option value="R410A">R410A</option>
                <option value="R22">R22</option>
                <option value="R290">R290</option>
                <option value="Other">Other</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="checkbox"
              id="modelActiveCheckbox"
              checked={modelIsActive}
              onChange={(e) => setModelIsActive(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="modelActiveCheckbox" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
              Active (Available for model selection in asset registration)
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button variant="outline" onClick={() => setIsModelModalOpen(false)} disabled={isSubmittingModel}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingModel} leftIcon={<CheckCircle2 size={16} />}>
              {editingModel ? 'Save Changes' : 'Create Model'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* VARIANTS MODAL (List / Add / Toggle) */}
      <Modal
        isOpen={isVariantsModalOpen}
        onClose={() => setIsVariantsModalOpen(false)}
        maxWidth="720px"
        title={selectedModelForVariants ? `Model Variants: ${selectedModelForVariants.modelNumber}` : 'Model Variants'}
        description={selectedModelForVariants ? `${selectedModelForVariants.brandName || 'AC Brand'} — Verified capacity & technical variants` : 'Model Variants'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Rule 4 Compliance Banner */}
          <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-info-subtle, rgba(59, 130, 246, 0.08))', border: '1px solid var(--color-info, #3b82f6)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-brand, #3b82f6)', flexShrink: 0 }} />
            <span>
              <strong>Rule 4 Compliance:</strong> Only register verified manufacturer variants. Do not fabricate unverified specifications.
            </span>
          </div>

          {/* Variants Header & Toggle Add Form */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              Registered Variants ({variants.length})
            </h4>
            <Button
              variant={isAddingVariant ? 'outline' : 'primary'}
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setIsAddingVariant(!isAddingVariant)}
            >
              {isAddingVariant ? 'Cancel Form' : '+ Add Variant'}
            </Button>
          </div>

          {/* Form to add a verified variant */}
          {isAddingVariant && (
            <form onSubmit={handleSaveVariant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-subtle, #f9fafb)' }}>
              <h5 style={{ margin: 0, fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-brand)' }}>
                New Verified Variant Specification
              </h5>

              {variantFormError && (
                <div style={{ padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-danger-subtle)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={14} />
                  {variantFormError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  label="Variant Code / SKU"
                  placeholder="e.g. FTKF50TV16U"
                  value={variantCode}
                  onChange={(e) => setVariantCode(e.target.value)}
                />
                <Input
                  label="Series / Sub-model"
                  placeholder="e.g. Standard Inverter Series"
                  value={variantSeries}
                  onChange={(e) => setVariantSeries(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Input
                  label="Capacity (Tons) *"
                  type="number"
                  step="0.1"
                  placeholder="e.g. 1.5"
                  value={variantCapacityTons}
                  onChange={(e) => {
                    setVariantCapacityTons(e.target.value);
                    if (e.target.value) {
                      setVariantCapacityDisplay(`${e.target.value} Ton`);
                    }
                  }}
                  required
                />
                <Input
                  label="Capacity Display"
                  placeholder="e.g. 1.5 Ton"
                  value={variantCapacityDisplay}
                  onChange={(e) => setVariantCapacityDisplay(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Star Rating *
                  </label>
                  <select
                    className="select"
                    value={variantStarRating}
                    onChange={(e) => setVariantStarRating(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="5 Star">5 Star</option>
                    <option value="4 Star">4 Star</option>
                    <option value="3 Star">3 Star</option>
                    <option value="2 Star">2 Star</option>
                    <option value="1 Star">1 Star</option>
                    <option value="Not Rated">Not Rated</option>
                    <option value="Inverter">Inverter</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    AC Type *
                  </label>
                  <select
                    className="select"
                    value={variantAcType}
                    onChange={(e) => setVariantAcType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="Split AC">Split AC</option>
                    <option value="Window AC">Window AC</option>
                    <option value="Cassette AC">Cassette AC</option>
                    <option value="Floor Standing AC">Floor Standing AC</option>
                    <option value="Tower AC">Tower AC</option>
                    <option value="Ductable AC">Ductable AC</option>
                    <option value="Central AC">Central AC</option>
                    <option value="Package AC">Package AC</option>
                    <option value="VRF System">VRF System</option>
                    <option value="VRV System">VRV System</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Technology *
                  </label>
                  <select
                    className="select"
                    value={variantTechnology}
                    onChange={(e) => setVariantTechnology(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="Inverter">Inverter</option>
                    <option value="Non-Inverter">Non-Inverter</option>
                    <option value="Fixed Speed">Fixed Speed</option>
                    <option value="Variable Speed">Variable Speed</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                    Refrigerant
                  </label>
                  <select
                    className="select"
                    value={variantRefrigerant}
                    onChange={(e) => setVariantRefrigerant(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    <option value="R32">R32</option>
                    <option value="R410A">R410A</option>
                    <option value="R22">R22</option>
                    <option value="R290">R290</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button variant="outline" size="sm" onClick={() => setIsAddingVariant(false)} disabled={isSubmittingVariant}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" isLoading={isSubmittingVariant} leftIcon={<CheckCircle2 size={14} />}>
                  Save Variant
                </Button>
              </div>
            </form>
          )}

          {/* Variants list display */}
          {isLoadingVariants ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading model variants...
            </div>
          ) : variants.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              No variants registered yet for this model. Click "+ Add Variant" to configure verified specifications.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '320px', overflowY: 'auto' }}>
              {variants.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: v.isActive ? 'var(--bg-surface)' : 'var(--bg-subtle, #f9fafb)',
                    opacity: v.isActive ? 1 : 0.7,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: 'var(--text-sm)' }}>
                        {v.variantCode || v.capacityDisplay || `${v.capacityTons} Ton`}
                      </strong>
                      <Badge variant={v.isActive ? 'success' : 'neutral'}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {v.capacityDisplay || `${v.capacityTons} Ton`} • {v.starRating} • {v.acType} • {v.technology} • {v.refrigerant || 'N/A'}
                      {v.series ? ` • Series: ${v.series}` : ''}
                    </span>
                  </div>

                  <Button
                    variant={v.isActive ? 'ghost' : 'outline'}
                    size="sm"
                    leftIcon={<Power size={13} />}
                    onClick={() => handleToggleVariantStatus(v)}
                  >
                    {v.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Modal Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <Button variant="outline" onClick={() => setIsVariantsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AcMasterManagement;
