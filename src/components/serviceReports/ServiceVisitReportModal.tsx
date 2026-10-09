import React, { useState, useEffect } from 'react';
import {
  ServiceSchedule,
  ServiceVisitType,
  ServiceVisitOutcome,
  CreateServiceReportPayload,
} from '@/domain/types';
import { serviceReportApi } from '@/services/serviceReportApi';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/useToast';
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Wrench,
  Package,
  CheckCircle,
} from 'lucide-react';

interface ServiceVisitReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ServiceSchedule | null;
  onSuccess: () => void;
}

interface AssetReportState {
  assetId: string;
  assetTag: string;
  brand: string;
  modelNumber: string;
  roomLocation: string;
  faultReported: string;
  diagnosisFindings: string;
  workPerformed: string;
  assetOutcome: ServiceVisitOutcome;
  finalCondition: string;
  refrigerantAdded: boolean;
  refrigerantQtyKg: string;
  notes: string;
}

interface PartItemState {
  id: string;
  assetId?: string;
  itemName: string;
  partNumber: string;
  quantity: number;
  reason: string;
  acCondition: string;
  isRevisitRequired: boolean;
}

interface RepairItemState {
  id: string;
  assetId?: string;
  itemName: string;
  reason: string;
  diagnosis: string;
  workCompleted: string;
  recommendedAction: string;
  isApprovalRequired: boolean;
  isSpecialistRequired: boolean;
  isRevisitRequired: boolean;
}

export const ServiceVisitReportModal: React.FC<ServiceVisitReportModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onSuccess,
}) => {
  const { showToast } = useToast();

  // Basic Form States
  const [reportNumber, setReportNumber] = useState<string>('');
  const [visitDate, setVisitDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:30');
  const [endTime, setEndTime] = useState<string>('11:45');
  const [primaryOutcome, setPrimaryOutcome] = useState<ServiceVisitOutcome>('COMPLETED');
  const [workDescription, setWorkDescription] = useState<string>('');
  const [technicianRemarks, setTechnicianRemarks] = useState<string>('');
  const [customerRepresentative, setCustomerRepresentative] = useState<string>('');
  const [customerAcknowledgement, setCustomerAcknowledgement] = useState<string>('');

  // Asset Finding States
  const [assets, setAssets] = useState<AssetReportState[]>([]);

  // Outcome-Specific Items (preserved across tab switching)
  const [partItems, setPartItems] = useState<PartItemState[]>([
    {
      id: 'part-1',
      itemName: '',
      partNumber: '',
      quantity: 1,
      reason: '',
      acCondition: 'Fair',
      isRevisitRequired: true,
    },
  ]);

  const [repairItems, setRepairItems] = useState<RepairItemState[]>([
    {
      id: 'repair-1',
      itemName: '',
      reason: '',
      diagnosis: '',
      workCompleted: '',
      recommendedAction: '',
      isApprovalRequired: false,
      isSpecialistRequired: false,
      isRevisitRequired: true,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize prefilled data whenever schedule changes
  useEffect(() => {
    if (schedule && isOpen) {
      setReportNumber('');
      setVisitDate(schedule.scheduledDate || new Date().toISOString().slice(0, 10));
      setStartTime(schedule.startTime || '09:30');
      setEndTime(schedule.endTime || '11:45');
      setPrimaryOutcome('COMPLETED');
      setWorkDescription('');
      setTechnicianRemarks('');
      setCustomerRepresentative('');
      setCustomerAcknowledgement('');
      setErrorMessage(null);

      // Setup initial asset
      if (schedule.assetId) {
        setAssets([
          {
            assetId: schedule.assetId,
            assetTag: schedule.assetTag || 'Assigned AC Asset',
            brand: schedule.brand || '',
            modelNumber: schedule.modelNumber || '',
            roomLocation: schedule.roomLocation || '',
            faultReported: schedule.serviceRequestType ? `Fault: ${schedule.serviceRequestType}` : '',
            diagnosisFindings: '',
            workPerformed: '',
            assetOutcome: 'COMPLETED',
            finalCondition: 'Good',
            refrigerantAdded: false,
            refrigerantQtyKg: '',
            notes: '',
          },
        ]);
      } else {
        setAssets([]);
      }
    }
  }, [schedule, isOpen]);

  if (!schedule) return null;

  const visitType: ServiceVisitType =
    schedule.scheduleType === 'PREVENTIVE' || schedule.amcId || schedule.pmObligationId
      ? 'PREVENTIVE'
      : 'SERVICE_REQUEST';

  const handleOutcomeChange = (newOutcome: ServiceVisitOutcome) => {
    setPrimaryOutcome(newOutcome);
    // Align asset outcomes with primary outcome by default
    setAssets((prev) =>
      prev.map((a) => ({
        ...a,
        assetOutcome: newOutcome,
      }))
    );
  };

  const handleAssetFieldChange = (
    index: number,
    field: keyof AssetReportState,
    value: string | number | boolean
  ) => {
    setAssets((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Parts items management
  const addPartItem = () => {
    setPartItems((prev) => [
      ...prev,
      {
        id: `part-${Date.now()}`,
        itemName: '',
        partNumber: '',
        quantity: 1,
        reason: '',
        acCondition: 'Fair',
        isRevisitRequired: true,
      },
    ]);
  };

  const removePartItem = (id: string) => {
    if (partItems.length <= 1) return;
    setPartItems((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePartItem = (
    id: string,
    field: keyof PartItemState,
    value: string | number | boolean
  ) => {
    setPartItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // Repair items management
  const addRepairItem = () => {
    setRepairItems((prev) => [
      ...prev,
      {
        id: `repair-${Date.now()}`,
        itemName: '',
        reason: '',
        diagnosis: '',
        workCompleted: '',
        recommendedAction: '',
        isApprovalRequired: false,
        isSpecialistRequired: false,
        isRevisitRequired: true,
      },
    ]);
  };

  const removeRepairItem = (id: string) => {
    if (repairItems.length <= 1) return;
    setRepairItems((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRepairItem = (
    id: string,
    field: keyof RepairItemState,
    value: string | number | boolean
  ) => {
    setRepairItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedNumber = reportNumber.trim();
    if (!trimmedNumber) {
      setErrorMessage('Manual report number is mandatory. Please enter a report number.');
      return;
    }

    if (assets.length === 0) {
      setErrorMessage('At least one AC asset must be associated with the report.');
      return;
    }

    // Outcome-specific client validation
    if (primaryOutcome === 'COMPLETED') {
      const hasAssetWork = assets.some((a) => a.workPerformed.trim().length > 0);
      const hasSummaryWork = workDescription.trim().length > 0;
      if (!hasAssetWork && !hasSummaryWork) {
        setErrorMessage(
          'Please enter details of the work performed either in the overall summary or under asset findings.'
        );
        return;
      }
    } else if (primaryOutcome === 'PENDING_PARTS') {
      const invalidPart = partItems.find((p) => !p.itemName.trim() || !p.reason.trim());
      if (invalidPart) {
        setErrorMessage('All required part items must have a Part Name and Reason specified.');
        return;
      }
    } else if (primaryOutcome === 'PENDING_REPAIRS') {
      const invalidRepair = repairItems.find(
        (r) => !r.itemName.trim() || !r.reason.trim() || !r.recommendedAction.trim()
      );
      if (invalidRepair) {
        setErrorMessage(
          'All repair items must have a Fault/Repair Description, Reason Pending, and Recommended Action.'
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const payload: CreateServiceReportPayload = {
        reportNumber: trimmedNumber,
        scheduleId: schedule.id,
        visitType,
        serviceDate: visitDate,
        startTime: startTime || null,
        endTime: endTime || null,
        primaryOutcome,
        workDescription: workDescription.trim() || null,
        technicianRemarks: technicianRemarks.trim() || null,
        customerRepresentative: customerRepresentative.trim() || null,
        customerAcknowledgement: customerAcknowledgement.trim() || null,
        assets: assets.map((a) => ({
          assetId: a.assetId,
          faultReported: a.faultReported.trim() || null,
          diagnosisFindings: a.diagnosisFindings.trim() || null,
          workPerformed: a.workPerformed.trim() || null,
          assetOutcome: a.assetOutcome,
          finalCondition: a.finalCondition || null,
          refrigerantAdded: a.refrigerantAdded,
          refrigerantQtyKg: a.refrigerantQtyKg ? parseFloat(a.refrigerantQtyKg) : null,
          notes: a.notes.trim() || null,
        })),
        items:
          primaryOutcome === 'PENDING_PARTS'
            ? partItems.map((p) => ({
                itemType: 'PART_REQUIRED',
                itemName: p.itemName.trim(),
                partNumber: p.partNumber.trim() || null,
                quantity: p.quantity,
                reason: p.reason.trim(),
                acCondition: p.acCondition,
                isRevisitRequired: p.isRevisitRequired,
              }))
            : primaryOutcome === 'PENDING_REPAIRS'
            ? repairItems.map((r) => ({
                itemType: 'REPAIR_REQUIRED',
                itemName: r.itemName.trim(),
                reason: r.reason.trim(),
                diagnosis: r.diagnosis.trim() || null,
                workCompleted: r.workCompleted.trim() || null,
                recommendedAction: r.recommendedAction.trim(),
                isApprovalRequired: r.isApprovalRequired,
                isSpecialistRequired: r.isSpecialistRequired,
                isRevisitRequired: r.isRevisitRequired,
              }))
            : [],
      };

      await serviceReportApi.createReport(payload);

      showToast({
        type: 'success',
        title: 'Visit Report Saved',
        message: `Service Visit Report #${trimmedNumber} saved successfully (${primaryOutcome})`,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      };
      const msg =
        axiosErr?.response?.data?.error?.message ||
        axiosErr?.message ||
        'Failed to save visit report. Please check the entered data.';
      setErrorMessage(msg);
      showToast({
        type: 'error',
        title: 'Submission Error',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !schedule) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create Service Visit Report — ${schedule.scheduleNumber}`}
      maxWidth="900px"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Validation / Submission Notice</div>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* 1. Prefilled Read-Only Visit Information */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Authoritative Appointment Details (Read-Only)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Visit Type:</span>
              <span className="font-semibold text-slate-900">
                {visitType === 'PREVENTIVE' ? 'AMC Preventive' : 'Service Request'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Customer:</span>
              <span className="font-semibold text-slate-900">{schedule.customerName || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Site Location:</span>
              <span className="font-semibold text-slate-900">{schedule.siteName || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Assigned Technician:</span>
              <span className="font-semibold text-blue-700">
                {schedule.technicianName || 'Unassigned'} [{schedule.technicianCode || 'N/A'}]
              </span>
            </div>
          </div>
          {schedule.amcContractNumber && (
            <div className="mt-2 text-xs text-slate-600">
              <strong>Contract:</strong> {schedule.amcContractNumber}
            </div>
          )}
          {schedule.serviceRequestNumber && (
            <div className="mt-2 text-xs text-slate-600">
              <strong>Request Ticket:</strong> {schedule.serviceRequestNumber} (
              {schedule.serviceRequestType || 'General'})
            </div>
          )}
        </div>

        {/* 2. Manual Report Number & Visit Time */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Manual Report Number <span className="text-red-500">*</span>
            </label>
            <Input
              value={reportNumber}
              onChange={(e) => setReportNumber(e.target.value)}
              placeholder="e.g. REP-2026-0042"
              required
              disabled={isSubmitting}
              className="font-mono text-sm uppercase"
            />
            <span className="text-[11px] text-slate-500 block mt-1">
              Official physical / carbon report number
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Reported Visit Date <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Start Time
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                End Time
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* 3. Primary Outcome Selector (3 Distinct Categories) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Primary Visit Outcome <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleOutcomeChange('COMPLETED')}
              className={`p-3 rounded-lg border text-left transition-all flex items-center gap-3 ${
                primaryOutcome === 'COMPLETED'
                  ? 'border-green-600 bg-green-50 text-green-900 ring-2 ring-green-600/20'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <CheckCircle className={`w-5 h-5 ${primaryOutcome === 'COMPLETED' ? 'text-green-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold text-sm">Service Completed</div>
                <div className="text-[11px] text-slate-500">All work finished on-site</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_PARTS')}
              className={`p-3 rounded-lg border text-left transition-all flex items-center gap-3 ${
                primaryOutcome === 'PENDING_PARTS'
                  ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-600/20'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <Package className={`w-5 h-5 ${primaryOutcome === 'PENDING_PARTS' ? 'text-amber-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold text-sm">Pending for Parts</div>
                <div className="text-[11px] text-slate-500">Requires replacement parts</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_REPAIRS')}
              className={`p-3 rounded-lg border text-left transition-all flex items-center gap-3 ${
                primaryOutcome === 'PENDING_REPAIRS'
                  ? 'border-red-600 bg-red-50 text-red-900 ring-2 ring-red-600/20'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <Wrench className={`w-5 h-5 ${primaryOutcome === 'PENDING_REPAIRS' ? 'text-red-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold text-sm">Pending for Repairs</div>
                <div className="text-[11px] text-slate-500">Requires follow-up repair</div>
              </div>
            </button>
          </div>
        </div>

        {/* 4. Per-Asset Findings */}
        <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-4">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            AC Asset Findings & Inspection
          </div>
          {assets.map((asset, idx) => (
            <div key={asset.assetId} className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-800">
                <span>
                  {asset.assetTag} ({asset.brand} {asset.modelNumber}) — {asset.roomLocation || 'General'}
                </span>
                <span className="text-slate-500">Asset {idx + 1} of {assets.length}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fault or Complaint Reported
                  </label>
                  <Input
                    value={asset.faultReported}
                    onChange={(e) => handleAssetFieldChange(idx, 'faultReported', e.target.value)}
                    placeholder="e.g. Low cooling, strange noise"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnosis / Findings
                  </label>
                  <Input
                    value={asset.diagnosisFindings}
                    onChange={(e) => handleAssetFieldChange(idx, 'diagnosisFindings', e.target.value)}
                    placeholder="e.g. Coil choked, gas level normal"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Work Performed on this Asset
                </label>
                <Input
                  value={asset.workPerformed}
                  onChange={(e) => handleAssetFieldChange(idx, 'workPerformed', e.target.value)}
                  placeholder="e.g. Jet cleaned filters, tested compressor amp"
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Final Asset Condition
                  </label>
                  <select
                    value={asset.finalCondition}
                    onChange={(e) => handleAssetFieldChange(idx, 'finalCondition', e.target.value)}
                    className="w-full text-xs rounded border border-slate-300 p-2 bg-white"
                    disabled={isSubmitting}
                  >
                    <option value="Good">Good / Operational</option>
                    <option value="Fair">Fair / Requires monitoring</option>
                    <option value="Poor">Poor / Degraded</option>
                    <option value="Critical">Critical / Non-operational</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id={`ref-add-${idx}`}
                    checked={asset.refrigerantAdded}
                    onChange={(e) => handleAssetFieldChange(idx, 'refrigerantAdded', e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <label htmlFor={`ref-add-${idx}`} className="text-xs text-slate-700">
                    Refrigerant Added (Gas top-up)
                  </label>
                </div>

                {asset.refrigerantAdded && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Gas Qty (Kg)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={asset.refrigerantQtyKg}
                      onChange={(e) => handleAssetFieldChange(idx, 'refrigerantQtyKg', e.target.value)}
                      placeholder="e.g. 0.8"
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 5. Outcome Section: Service Completed */}
        {primaryOutcome === 'COMPLETED' && (
          <div className="space-y-4 p-4 bg-green-50/50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-800 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Service Completed Details
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Summary of Work Performed & Testing Completed <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                rows={3}
                placeholder="Describe servicing performed, checks, testing, and operational parameters..."
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        {/* 6. Outcome Section: Pending for Parts */}
        {primaryOutcome === 'PENDING_PARTS' && (
          <div className="space-y-4 p-4 bg-amber-50/50 border border-amber-200 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                <Package className="w-4 h-4 text-amber-600" />
                Required Parts Specification
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addPartItem}>
                <Plus size={14} className="mr-1" /> Add Another Part
              </Button>
            </div>

            {partItems.map((item, idx) => (
              <div key={item.id} className="p-3 bg-white border border-amber-200 rounded-lg space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold text-amber-900">
                  <span>Part #{idx + 1}</span>
                  {partItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePartItem(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Part Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.itemName}
                      onChange={(e) => updatePartItem(item.id, 'itemName', e.target.value)}
                      placeholder="e.g. Dual Run Capacitor 45+5 uF"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Part Number (Optional)
                    </label>
                    <Input
                      value={item.partNumber}
                      onChange={(e) => updatePartItem(item.id, 'partNumber', e.target.value)}
                      placeholder="e.g. CAP-4550"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Quantity Required <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updatePartItem(item.id, 'quantity', parseInt(e.target.value, 10) || 1)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reason Required <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.reason}
                      onChange={(e) => updatePartItem(item.id, 'reason', e.target.value)}
                      placeholder="e.g. Blown capacitor causing compressor hard start"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) => updatePartItem(item.id, 'isRevisitRequired', e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Requires Return Visit for Installation
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 7. Outcome Section: Pending for Repairs */}
        {primaryOutcome === 'PENDING_REPAIRS' && (
          <div className="space-y-4 p-4 bg-red-50/50 border border-red-200 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider">
                <Wrench className="w-4 h-4 text-red-600" />
                Required Repairs & Next Action Items
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addRepairItem}>
                <Plus size={14} className="mr-1" /> Add Another Repair
              </Button>
            </div>

            {repairItems.map((item, idx) => (
              <div key={item.id} className="p-3 bg-white border border-red-200 rounded-lg space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold text-red-900">
                  <span>Repair Item #{idx + 1}</span>
                  {repairItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRepairItem(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Fault / Repair Description <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateRepairItem(item.id, 'itemName', e.target.value)}
                    placeholder="e.g. Outdoor copper tubing brazing & nitrogen pressure test"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Reason Pending <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.reason}
                      onChange={(e) => updateRepairItem(item.id, 'reason', e.target.value)}
                      placeholder="e.g. Heavy gas leak; brazing kit and nitrogen cylinder required"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Recommended Next Action <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.recommendedAction}
                      onChange={(e) => updateRepairItem(item.id, 'recommendedAction', e.target.value)}
                      placeholder="e.g. Arrange specialist brazing team and vacuum pump revisit"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isApprovalRequired}
                      onChange={(e) => updateRepairItem(item.id, 'isApprovalRequired', e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Client / Management Approval Required
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isSpecialistRequired}
                      onChange={(e) => updateRepairItem(item.id, 'isSpecialistRequired', e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Senior HVAC Specialist Required
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) => updateRepairItem(item.id, 'isRevisitRequired', e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Revisit Required
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 8. Remarks & Customer Representative Sign-Off */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              General Technician Remarks
            </label>
            <Textarea
              value={technicianRemarks}
              onChange={(e) => setTechnicianRemarks(e.target.value)}
              rows={2}
              placeholder="Internal operational notes or technician observations..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer / Site Representative Name
              </label>
              <Input
                value={customerRepresentative}
                onChange={(e) => setCustomerRepresentative(e.target.value)}
                placeholder="e.g. Ramesh Shah (Facility Incharge)"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Acknowledgement / Feedback
              </label>
              <Input
                value={customerAcknowledgement}
                onChange={(e) => setCustomerAcknowledgement(e.target.value)}
                placeholder="e.g. Satisfied with cooling; acknowledged filter cleaning"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Visit Report...' : 'Submit Visit Report'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
