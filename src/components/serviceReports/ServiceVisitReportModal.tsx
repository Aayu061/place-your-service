import React, { useState, useEffect, useRef } from 'react';
import {
  ServiceSchedule,
  ServiceVisitType,
  ServiceVisitOutcome,
  CreateServiceReportPayload,
  ServiceVisitReport,
} from '@/domain/types';
import { serviceReportApi } from '@/services/serviceReportApi';
import { ApiError } from '@/services/api/client';
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
  Clock,
  Building,
  User,
  Hash,
  ShieldCheck,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface ServiceVisitReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule?: ServiceSchedule | null;
  initialReport?: ServiceVisitReport | null;
  mode?: 'create' | 'edit';
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
  isApprovalRequired: boolean;
  isSpecialistRequired: boolean;
  isRevisitRequired: boolean;
}

type FormStatus = 'IDLE' | 'VALIDATING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

export const ServiceVisitReportModal: React.FC<ServiceVisitReportModalProps> = ({
  isOpen,
  onClose,
  schedule,
  initialReport,
  mode = 'create',
  onSuccess,
}) => {
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const reportNumberInputRef = useRef<HTMLInputElement>(null);

  // Form Submission State Machine
  const [formStatus, setFormStatus] = useState<FormStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Field-level error states
  const [reportNumberError, setReportNumberError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [workError, setWorkError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

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
  const [isAdditionalOpen, setIsAdditionalOpen] = useState<boolean>(false);

  // Asset Finding States
  const [assets, setAssets] = useState<AssetReportState[]>([]);

  // Outcome-Specific Items (retained across outcome switching)
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
      isApprovalRequired: false,
      isSpecialistRequired: false,
      isRevisitRequired: true,
    },
  ]);

  // Reset & initialize prefilled data whenever schedule or initialReport changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialReport) {
        setReportNumber(initialReport.reportNumber || '');
        setVisitDate(initialReport.serviceDate || '');
        setStartTime(initialReport.startTime || '09:30');
        setEndTime(initialReport.endTime || '11:45');
        setPrimaryOutcome(initialReport.primaryOutcome || 'COMPLETED');
        setWorkDescription(initialReport.workDescription || '');
        setTechnicianRemarks(initialReport.technicianRemarks || '');
        setCustomerRepresentative(initialReport.customerRepresentative || '');
        setCustomerAcknowledgement(initialReport.customerAcknowledgement || '');
        setErrorMessage(null);
        setReportNumberError(null);
        setTimeError(null);
        setWorkError(null);
        setItemError(null);
        setFormStatus('IDLE');

        if (
          initialReport.technicianRemarks ||
          initialReport.customerRepresentative ||
          initialReport.customerAcknowledgement
        ) {
          setIsAdditionalOpen(true);
        } else {
          setIsAdditionalOpen(false);
        }

        if (initialReport.assets && initialReport.assets.length > 0) {
          setAssets(
            initialReport.assets.map((a) => ({
              assetId: a.assetId,
              assetTag: a.assetTag || 'Assigned AC Asset',
              brand: a.brand || '',
              modelNumber: a.modelNumber || '',
              roomLocation: a.roomLocation || '',
              faultReported: a.faultReported || '',
              diagnosisFindings: a.diagnosisFindings || '',
              workPerformed: a.workPerformed || '',
              assetOutcome: a.assetOutcome || initialReport.primaryOutcome,
              finalCondition: a.finalCondition || 'Good',
              refrigerantAdded: Boolean(a.refrigerantAdded),
              refrigerantQtyKg: a.refrigerantQtyKg != null ? String(a.refrigerantQtyKg) : '',
              notes: a.notes || '',
            }))
          );
        } else if (schedule?.assetId) {
          setAssets([
            {
              assetId: schedule.assetId,
              assetTag: schedule.assetTag || 'Assigned AC Asset',
              brand: schedule.brand || '',
              modelNumber: schedule.modelNumber || '',
              roomLocation: schedule.roomLocation || '',
              faultReported: '',
              diagnosisFindings: '',
              workPerformed: '',
              assetOutcome: initialReport.primaryOutcome,
              finalCondition: 'Good',
              refrigerantAdded: false,
              refrigerantQtyKg: '',
              notes: '',
            },
          ]);
        }

        const parts = (initialReport.items || []).filter((i) => i.itemType === 'PART_REQUIRED');
        if (parts.length > 0) {
          setPartItems(
            parts.map((p, idx) => ({
              id: p.id || `part-${idx + 1}`,
              assetId: p.assetId || undefined,
              itemName: p.itemName,
              partNumber: p.partNumber || '',
              quantity: p.quantity || 1,
              reason: p.reason,
              acCondition: p.acCondition || 'Fair',
              isRevisitRequired: p.isRevisitRequired ?? true,
            }))
          );
        }

        const repairs = (initialReport.items || []).filter((i) => i.itemType === 'REPAIR_REQUIRED');
        if (repairs.length > 0) {
          setRepairItems(
            repairs.map((r, idx) => ({
              id: r.id || `repair-${idx + 1}`,
              assetId: r.assetId || undefined,
              itemName: r.itemName,
              reason: r.reason,
              diagnosis: r.diagnosis || '',
              workCompleted: r.workCompleted || '',
              isApprovalRequired: r.isApprovalRequired ?? false,
              isSpecialistRequired: r.isSpecialistRequired ?? false,
              isRevisitRequired: r.isRevisitRequired ?? true,
            }))
          );
        }
      } else if (schedule) {
        setReportNumber('');
        setVisitDate(schedule.scheduledDate || new Date().toISOString().slice(0, 10));
        setStartTime(schedule.startTime || '09:30');
        setEndTime(schedule.endTime || '11:45');
        setPrimaryOutcome('COMPLETED');
        setWorkDescription('');
        setTechnicianRemarks('');
        setCustomerRepresentative('');
        setCustomerAcknowledgement('');
        setIsAdditionalOpen(false);
        setErrorMessage(null);
        setReportNumberError(null);
        setTimeError(null);
        setWorkError(null);
        setItemError(null);
        setFormStatus('IDLE');

        // Setup initial asset findings
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
    }
  }, [schedule, initialReport, mode, isOpen]);

  if (!schedule && !initialReport) return null;

  const isSubmitting = formStatus === 'VALIDATING' || formStatus === 'SUBMITTING';

  const visitType: ServiceVisitType =
    initialReport?.visitType ||
    (schedule?.scheduleType === 'PREVENTIVE' || schedule?.amcId || schedule?.pmObligationId
      ? 'PREVENTIVE'
      : 'SERVICE_REQUEST');

  const handleOutcomeChange = (newOutcome: ServiceVisitOutcome) => {
    setPrimaryOutcome(newOutcome);
    setItemError(null);
    setWorkError(null);
    if (errorMessage && !reportNumberError) {
      setErrorMessage(null);
    }
    // Synchronize asset outcomes to match primary outcome by default
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
    if (field === 'workPerformed' && workError) {
      setWorkError(null);
      setErrorMessage(null);
    }
  };

  // Parts items management
  const addPartItem = () => {
    setPartItems((prev) => [
      ...prev,
      {
        id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    if (itemError) {
      setItemError(null);
      setErrorMessage(null);
    }
  };

  // Repair items management
  const addRepairItem = () => {
    setRepairItems((prev) => [
      ...prev,
      {
        id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemName: '',
        reason: '',
        diagnosis: '',
        workCompleted: '',
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
    if (itemError) {
      setItemError(null);
      setErrorMessage(null);
    }
  };

  // Authoritative form submit handler with strict validation state machine
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submission calls while already in flight
    if (isSubmitting) return;

    setFormStatus('VALIDATING');
    setErrorMessage(null);
    setReportNumberError(null);
    setTimeError(null);
    setWorkError(null);
    setItemError(null);

    const trimmedNumber = reportNumber.trim();
    if (!trimmedNumber) {
      const msg = 'Manual report number is mandatory. Please enter a report number.';
      setReportNumberError(msg);
      setErrorMessage(msg);
      setFormStatus('ERROR');
      reportNumberInputRef.current?.focus();
      return;
    }

    if (!/^[A-Za-z0-9_\-/.\s]+$/.test(trimmedNumber)) {
      const msg =
        'Report number may only contain letters, numbers, spaces, dashes (-), slashes (/), and periods (.)';
      setReportNumberError(msg);
      setErrorMessage(msg);
      setFormStatus('ERROR');
      reportNumberInputRef.current?.focus();
      return;
    }

    if (!visitDate) {
      const msg = 'Reported visit date is required.';
      setErrorMessage(msg);
      setFormStatus('ERROR');
      return;
    }

    // Time validation: when same day, ensure endTime > startTime
    if (startTime && endTime) {
      if (endTime <= startTime) {
        const msg = 'End time must be after start time for the visit.';
        setTimeError(msg);
        setErrorMessage(msg);
        setFormStatus('ERROR');
        return;
      }
    }

    if (assets.length === 0) {
      const msg = 'At least one AC asset must be associated with the report.';
      setErrorMessage(msg);
      setFormStatus('ERROR');
      return;
    }

    // Outcome-specific client validation
    if (primaryOutcome === 'COMPLETED') {
      const hasAssetWork = assets.some((a) => a.workPerformed.trim().length > 0);
      const hasSummaryWork = workDescription.trim().length > 0;
      if (!hasAssetWork && !hasSummaryWork) {
        const msg =
          'Please enter details of the work performed either in the overall summary or under asset findings.';
        setWorkError(msg);
        setErrorMessage(msg);
        setFormStatus('ERROR');
        return;
      }
    } else if (primaryOutcome === 'PENDING_PARTS') {
      const invalidPart = partItems.find((p) => !p.itemName.trim() || !p.reason.trim());
      if (invalidPart) {
        const msg = 'All required part items must have a Part Name and Reason specified.';
        setItemError(msg);
        setErrorMessage(msg);
        setFormStatus('ERROR');
        return;
      }
    } else if (primaryOutcome === 'PENDING_REPAIRS') {
      const invalidRepair = repairItems.find(
        (r) => !r.itemName.trim() || !r.reason.trim()
      );
      if (invalidRepair) {
        const msg =
          'All repair items must have a Fault/Repair Description and Reason Pending.';
        setItemError(msg);
        setErrorMessage(msg);
        setFormStatus('ERROR');
        return;
      }
    }

    try {
      setFormStatus('SUBMITTING');

      const targetScheduleId = schedule?.id || initialReport?.scheduleId || '';

      const payload: CreateServiceReportPayload = {
        reportNumber: trimmedNumber,
        scheduleId: targetScheduleId,
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
                isApprovalRequired: r.isApprovalRequired,
                isSpecialistRequired: r.isSpecialistRequired,
                isRevisitRequired: r.isRevisitRequired,
              }))
            : [],
      };

      if (mode === 'edit' && initialReport) {
        await serviceReportApi.updateReport(initialReport.id, {
          reportNumber: trimmedNumber,
          serviceDate: visitDate,
          startTime: startTime || null,
          endTime: endTime || null,
          workDescription: workDescription.trim() || null,
          technicianRemarks: technicianRemarks.trim() || null,
          customerRepresentative: customerRepresentative.trim() || null,
          customerAcknowledgement: customerAcknowledgement.trim() || null,
          assets: payload.assets,
          items: payload.items,
        });

        setFormStatus('SUCCESS');
        showToast({
          type: 'success',
          title: 'Visit Report Updated',
          message: `Service Visit Report #${trimmedNumber} updated successfully`,
        });
      } else {
        await serviceReportApi.createReport(payload);

        setFormStatus('SUCCESS');
        showToast({
          type: 'success',
          title: 'Visit Report Saved',
          message: `Service Visit Report #${trimmedNumber} persisted successfully (${primaryOutcome})`,
        });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setFormStatus('ERROR');
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          const msg = `Report number "${trimmedNumber}" is already in use by another report. Please enter a distinct report number.`;
          setReportNumberError(msg);
          setErrorMessage(msg);
          reportNumberInputRef.current?.focus();
        } else {
          setErrorMessage(err.message || (mode === 'edit' ? 'Failed to update visit report.' : 'Failed to persist visit report.'));
        }
      } else {
        const fallbackMsg =
          (err as Error)?.message || (mode === 'edit' ? 'An unexpected error occurred while updating the report.' : 'An unexpected error occurred while saving the report.');
        setErrorMessage(fallbackMsg);
      }

      showToast({
        type: 'error',
        title: mode === 'edit' ? 'Update Failed' : 'Submission Failed',
        message:
          err instanceof ApiError
            ? err.message
            : mode === 'edit'
            ? 'Could not update the service report. Please check the inputs.'
            : 'Could not save the service report. Please check the inputs.',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? `Edit Service Visit Report #${initialReport?.reportNumber || ''}` : 'Create Service Visit Report'}
      description={
        mode === 'edit'
          ? `Amend or correct inspection findings for Report #${initialReport?.reportNumber || ''}`
          : `Official execution record for Appointment #${schedule?.scheduleNumber || ''}`
      }
      maxWidth="1040px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-success-solid)' }} />
            <span>All fields with asterisk (*) are required for persistence</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="service-visit-report-form"
              disabled={isSubmitting}
            >
              {formStatus === 'SUBMITTING'
                ? mode === 'edit'
                  ? 'Updating Report...'
                  : 'Saving Visit Report...'
                : formStatus === 'VALIDATING'
                ? 'Validating Details...'
                : mode === 'edit'
                ? 'Update Visit Report'
                : 'Submit Visit Report'}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="service-visit-report-form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="svr-space-y-6"
        style={{ paddingBottom: 'var(--space-6)' }}
      >
        {/* Global Error Banner */}
        {errorMessage && (
          <div className="svr-error-banner animate-fade-in">
            <AlertTriangle size={18} style={{ color: 'var(--color-error-solid)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-error-text)' }}>Validation Notice</div>
              <div style={{ fontSize: '12px', marginTop: '2px', color: 'var(--color-error-text)' }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Section 1: Appointment Context Panel (Read-Only) */}
        <div className="svr-context-panel">
          <div className="svr-context-header">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Building size={14} style={{ color: 'var(--color-brand)' }} />
              Appointment Context (Read-Only)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: visitType === 'PREVENTIVE' ? 'var(--color-amc-bg)' : 'var(--color-info-bg)',
                color: visitType === 'PREVENTIVE' ? 'var(--color-amc-text)' : 'var(--color-info-text)',
                border: `1px solid ${visitType === 'PREVENTIVE' ? 'var(--color-amc-border)' : 'var(--color-info-border)'}`,
              }}
            >
              {visitType === 'PREVENTIVE' ? 'AMC Preventive Maintenance' : 'Customer Service Request'}
            </span>
          </div>

          <div className="svr-context-grid">
            <div className="svr-context-item">
              <span className="svr-context-label">Customer</span>
              <span className="svr-context-value">{schedule?.customerName || initialReport?.customerName || 'N/A'}</span>
              <span className="svr-context-sub" style={{ fontFamily: 'var(--font-mono)' }}>
                {schedule?.customerCode || initialReport?.customerCode || 'Code: N/A'}
              </span>
            </div>

            <div className="svr-context-item">
              <span className="svr-context-label">Site Location</span>
              <span className="svr-context-value">{schedule?.siteName || initialReport?.siteName || 'N/A'}</span>
              <span className="svr-context-sub">{schedule?.siteAddress || initialReport?.siteAddress || 'Address on file'}</span>
            </div>

            <div className="svr-context-item">
              <span className="svr-context-label">Assigned Technician</span>
              <span className="svr-context-value" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-brand)' }}>
                <User size={13} style={{ color: 'var(--color-brand)' }} />
                {schedule?.technicianName || initialReport?.technicianName || 'Unassigned'}
              </span>
              <span className="svr-context-sub" style={{ fontFamily: 'var(--font-mono)' }}>
                [{schedule?.technicianCode || initialReport?.technicianCode || 'N/A'}]
              </span>
            </div>

            <div className="svr-context-item">
              <span className="svr-context-label">Work Item Reference</span>
              {schedule?.amcContractNumber || initialReport?.amcContractNumber ? (
                <span className="svr-context-value" style={{ color: 'var(--color-amc-text)' }}>
                  AMC: {schedule?.amcContractNumber || initialReport?.amcContractNumber}
                </span>
              ) : schedule?.serviceRequestNumber || initialReport?.serviceRequestNumber ? (
                <span className="svr-context-value" style={{ color: 'var(--color-info-text)' }}>
                  SR: {schedule?.serviceRequestNumber || initialReport?.serviceRequestNumber}
                </span>
              ) : (
                <span className="svr-context-value">General Appointment</span>
              )}
              <span className="svr-context-sub" style={{ fontFamily: 'var(--font-mono)' }}>
                Appt: {schedule?.scheduleNumber || initialReport?.scheduleNumber || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Report Information (Manual Number & Timing) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <label
              htmlFor="manual-report-number-input"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Manual Report Number <span style={{ color: 'var(--color-error-solid)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Input
                id="manual-report-number-input"
                ref={reportNumberInputRef}
                value={reportNumber}
                onChange={(e) => {
                  setReportNumber(e.target.value.toUpperCase());
                  if (reportNumberError) setReportNumberError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                onBlur={() => setReportNumber((prev) => prev.trim())}
                placeholder="e.g. REP-2026-0042"
                disabled={isSubmitting}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  letterSpacing: '0.03em',
                  paddingRight: '32px',
                  borderColor: reportNumberError ? 'var(--color-error-solid)' : undefined,
                }}
              />
              <Hash
                size={16}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
            </div>
            {reportNumberError ? (
              <p style={{ fontSize: '12px', color: 'var(--color-error-text)', fontWeight: 500, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                {reportNumberError}
              </p>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Physical carbon / booklet serial number
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="reported-visit-date-input"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Reported Visit Date <span style={{ color: 'var(--color-error-solid)' }}>*</span>
            </label>
            <Input
              id="reported-visit-date-input"
              type="date"
              value={visitDate}
              onChange={(e) => {
                setVisitDate(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isSubmitting}
              style={{ fontSize: '13px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Date the visit was performed on-site
            </span>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Visit Timing (Start & End)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (timeError) setTimeError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
                title="Visit Start Time"
                style={{ fontSize: '13px' }}
              />
              <Input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  if (timeError) setTimeError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
                title="Visit End Time"
                style={{
                  fontSize: '13px',
                  borderColor: timeError ? 'var(--color-error-solid)' : undefined,
                }}
              />
            </div>
            {timeError ? (
              <p style={{ fontSize: '12px', color: 'var(--color-error-text)', fontWeight: 500, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} style={{ flexShrink: 0 }} />
                {timeError}
              </p>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Actual technician on-site interval
              </span>
            )}
          </div>
        </div>

        {/* Section 3: Primary Visit Outcome (3 Equal Cards with Rich Visual Tokens) */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            Primary Visit Outcome <span style={{ color: 'var(--color-error-solid)' }}>*</span>
          </label>
          <div className="svr-outcome-grid">
            {/* 1. Service Completed Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('COMPLETED')}
              className={`svr-outcome-card ${primaryOutcome === 'COMPLETED' ? 'selected-completed' : ''}`}
            >
              <div className="svr-outcome-icon">
                <CheckCircle size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="svr-outcome-title">
                  <span>Service Completed</span>
                  {primaryOutcome === 'COMPLETED' && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--color-success-solid)' }} />
                  )}
                </div>
                <div className="svr-outcome-desc">
                  All work finished on-site and verified functional
                </div>
              </div>
            </button>

            {/* 2. Pending for Parts Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_PARTS')}
              className={`svr-outcome-card ${primaryOutcome === 'PENDING_PARTS' ? 'selected-parts' : ''}`}
            >
              <div className="svr-outcome-icon">
                <Package size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="svr-outcome-title">
                  <span>Pending for Parts</span>
                  {primaryOutcome === 'PENDING_PARTS' && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--color-warning-solid)' }} />
                  )}
                </div>
                <div className="svr-outcome-desc">
                  Requires procurement of replacement spare parts
                </div>
              </div>
            </button>

            {/* 3. Pending for Repairs Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_REPAIRS')}
              className={`svr-outcome-card ${primaryOutcome === 'PENDING_REPAIRS' ? 'selected-repairs' : ''}`}
            >
              <div className="svr-outcome-icon">
                <Wrench size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="svr-outcome-title">
                  <span>Pending for Repairs</span>
                  {primaryOutcome === 'PENDING_REPAIRS' && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '9999px', backgroundColor: 'var(--color-error-solid)' }} />
                  )}
                </div>
                <div className="svr-outcome-desc">
                  Requires specialized repair, client approval, or revisit
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 4: Per-Asset Inspection Findings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FileCheck size={16} style={{ color: 'var(--color-brand)' }} />
              AC Asset Findings & Inspection Details ({assets.length}{' '}
              {assets.length === 1 ? 'Unit' : 'Units'})
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Findings preserved independently per unit
            </span>
          </div>

          {assets.map((asset, idx) => (
            <div key={asset.assetId} className="svr-asset-card">
              {/* Asset Card Header */}
              <div className="svr-asset-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      backgroundColor: 'var(--color-primary-50)',
                      color: 'var(--color-primary-800)',
                      border: '1px solid var(--color-primary-200)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    {asset.assetTag}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {asset.brand} {asset.modelNumber} — {asset.roomLocation || 'General / Central'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Unit {idx + 1} of {assets.length}
                </span>
              </div>

              {/* Group 1: Inspection & Diagnostics */}
              <div className="svr-group-card">
                <span className="svr-group-title">
                  <Wrench size={13} style={{ color: 'var(--color-brand)' }} />
                  1. Inspection & Diagnostic Findings
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Fault or Complaint Reported
                    </label>
                    <Input
                      value={asset.faultReported}
                      onChange={(e) => handleAssetFieldChange(idx, 'faultReported', e.target.value)}
                      placeholder="e.g. Low cooling, noise from blower"
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Diagnosis / Findings
                    </label>
                    <Input
                      value={asset.diagnosisFindings}
                      onChange={(e) =>
                        handleAssetFieldChange(idx, 'diagnosisFindings', e.target.value)
                      }
                      placeholder="e.g. Coil choked with dust, pressure normal"
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Group 2: Work Performed & Final Condition */}
              <div className="svr-group-card">
                <span className="svr-group-title">
                  <CheckCircle2 size={13} style={{ color: 'var(--color-success-solid)' }} />
                  2. Work Performed & Asset Operational Status
                </span>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Work Performed on this Asset{' '}
                    {primaryOutcome === 'COMPLETED' && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        (or describe in overall summary below)
                      </span>
                    )}
                  </label>
                  <Input
                    value={asset.workPerformed}
                    onChange={(e) => handleAssetFieldChange(idx, 'workPerformed', e.target.value)}
                    placeholder="e.g. Jet cleaned filters, tested compressor amp"
                    disabled={isSubmitting}
                    style={{ fontSize: '12px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Final Asset Condition
                    </label>
                    <select
                      value={asset.finalCondition}
                      onChange={(e) => handleAssetFieldChange(idx, 'finalCondition', e.target.value)}
                      style={{
                        width: '100%',
                        fontSize: '12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        padding: '7px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                      disabled={isSubmitting}
                    >
                      <option value="Good">Good / Fully Operational</option>
                      <option value="Fair">Fair / Requires Regular Monitoring</option>
                      <option value="Poor">Poor / Performance Degraded</option>
                      <option value="Critical">Critical / Non-Operational</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px' }}>
                    <input
                      type="checkbox"
                      id={`ref-add-${idx}`}
                      checked={asset.refrigerantAdded}
                      onChange={(e) =>
                        handleAssetFieldChange(idx, 'refrigerantAdded', e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-brand)', cursor: 'pointer' }}
                    />
                    <label
                      htmlFor={`ref-add-${idx}`}
                      style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer' }}
                    >
                      Refrigerant Added (Gas Top-Up)
                    </label>
                  </div>

                  {asset.refrigerantAdded && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Gas Qty Added (Kg)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="20"
                        value={asset.refrigerantQtyKg}
                        onChange={(e) =>
                          handleAssetFieldChange(idx, 'refrigerantQtyKg', e.target.value)
                        }
                        placeholder="e.g. 0.8"
                        disabled={isSubmitting}
                        style={{ fontSize: '12px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Section 5A: Outcome Section — Service Completed */}
        {primaryOutcome === 'COMPLETED' && (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--color-success-text)',
                fontWeight: 700,
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <CheckCircle2 size={16} style={{ color: 'var(--color-success-solid)' }} />
              Service Completed — Overall Work Summary & Verification
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Summary of Servicing & Testing Performed <span style={{ color: 'var(--color-error-solid)' }}>*</span>
              </label>
              <Textarea
                value={workDescription}
                onChange={(e) => {
                  setWorkDescription(e.target.value);
                  if (workError) setWorkError(null);
                  if (errorMessage) setErrorMessage(null);
                }}
                rows={3}
                placeholder="Describe servicing performed, air-flow checks, amperage and operational verification..."
                disabled={isSubmitting}
                style={{
                  fontSize: '13px',
                  borderColor: workError ? 'var(--color-error-solid)' : undefined,
                }}
              />
              {workError ? (
                <p style={{ fontSize: '12px', color: 'var(--color-error-text)', fontWeight: 500, marginTop: '4px' }}>{workError}</p>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Required if not already specified in per-asset work performed above
                </span>
              )}
            </div>
          </div>
        )}

        {/* Section 5B: Outcome Section — Pending for Parts */}
        {primaryOutcome === 'PENDING_PARTS' && (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-warning-bg)',
              border: '1px solid var(--color-warning-border)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3-5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--color-warning-text)',
                  fontWeight: 700,
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <Package size={16} style={{ color: 'var(--color-warning-solid)' }} />
                Required Parts Specification ({partItems.length}{' '}
                {partItems.length === 1 ? 'Item' : 'Items'})
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addPartItem}>
                <Plus size={14} /> <span>Add Another Part</span>
              </Button>
            </div>

            {itemError && (
              <p style={{ fontSize: '12px', color: 'var(--color-error-text)', fontWeight: 500 }}>{itemError}</p>
            )}

            {partItems.map((item, idx) => (
              <div key={item.id} className="svr-repeater-card">
                <div className="svr-repeater-header" style={{ color: 'var(--color-warning-text)' }}>
                  <span>Part Item #{idx + 1}</span>
                  {partItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePartItem(item.id)}
                      style={{
                        color: 'var(--color-error-solid)',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      title="Remove Part"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Part Name <span style={{ color: 'var(--color-error-solid)' }}>*</span>
                    </label>
                    <Input
                      value={item.itemName}
                      onChange={(e) => updatePartItem(item.id, 'itemName', e.target.value)}
                      placeholder="e.g. Dual Run Capacitor 45+5 uF"
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Part Number (Optional)
                    </label>
                    <Input
                      value={item.partNumber}
                      onChange={(e) => updatePartItem(item.id, 'partNumber', e.target.value)}
                      placeholder="e.g. CAP-4550"
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Quantity <span style={{ color: 'var(--color-error-solid)' }}>*</span>
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updatePartItem(item.id, 'quantity', parseInt(e.target.value, 10) || 1)
                      }
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Reason Required <span style={{ color: 'var(--color-error-solid)' }}>*</span>
                    </label>
                    <Input
                      value={item.reason}
                      onChange={(e) => updatePartItem(item.id, 'reason', e.target.value)}
                      placeholder="e.g. Capacitor blown, preventing compressor starting"
                      disabled={isSubmitting}
                      style={{ fontSize: '12px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) =>
                        updatePartItem(item.id, 'isRevisitRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--color-warning-solid)', cursor: 'pointer' }}
                    />
                    <span>Requires Revisit for Part Installation</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section 5C: Outcome Section — Pending for Repairs */}
        {primaryOutcome === 'PENDING_REPAIRS' && (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-error-bg)',
              border: '1px solid var(--color-error-border)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3-5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--color-error-text)',
                  fontWeight: 700,
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <Wrench size={16} style={{ color: 'var(--color-error-solid)' }} />
                Required Repairs & Next Action Items ({repairItems.length}{' '}
                {repairItems.length === 1 ? 'Item' : 'Items'})
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addRepairItem}>
                <Plus size={14} /> <span>Add Another Repair</span>
              </Button>
            </div>

            {itemError && (
              <p style={{ fontSize: '12px', color: 'var(--color-error-text)', fontWeight: 500 }}>{itemError}</p>
            )}

            {repairItems.map((item, idx) => (
              <div key={item.id} className="svr-repeater-card">
                <div className="svr-repeater-header" style={{ color: 'var(--color-error-text)' }}>
                  <span>Repair Item #{idx + 1}</span>
                  {repairItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRepairItem(item.id)}
                      style={{
                        color: 'var(--color-error-solid)',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                      title="Remove Repair"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Fault / Repair Description <span style={{ color: 'var(--color-error-solid)' }}>*</span>
                  </label>
                  <Input
                    value={item.itemName}
                    onChange={(e) => updateRepairItem(item.id, 'itemName', e.target.value)}
                    placeholder="e.g. Copper tube brazing and nitrogen leak pressure test"
                    disabled={isSubmitting}
                    style={{ fontSize: '12px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Reason Pending <span style={{ color: 'var(--color-error-solid)' }}>*</span>
                  </label>
                  <Input
                    value={item.reason}
                    onChange={(e) => updateRepairItem(item.id, 'reason', e.target.value)}
                    placeholder="e.g. Nitrogen cylinder and brazing kit required on site"
                    disabled={isSubmitting}
                    style={{ fontSize: '12px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', fontSize: '12px', paddingTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={item.isApprovalRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isApprovalRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--color-error-solid)', cursor: 'pointer' }}
                    />
                    <span>Customer / Management Approval Required</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={item.isSpecialistRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isSpecialistRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--color-error-solid)', cursor: 'pointer' }}
                    />
                    <span>Senior HVAC Specialist Required</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isRevisitRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{ width: '15px', height: '15px', accentColor: 'var(--color-error-solid)', cursor: 'pointer' }}
                    />
                    <span>Revisit Required</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section 6: Additional Details & Customer Feedback (Progressive Disclosure) */}
        <div style={{ marginTop: 'var(--space-2)' }}>
          <button
            type="button"
            className="svr-disclosure-toggle"
            aria-expanded={isAdditionalOpen}
            onClick={() => setIsAdditionalOpen((prev) => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-default)',
              borderRadius: isAdditionalOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={14} style={{ color: 'var(--color-brand)' }} />
              Additional Details & Customer Remarks (Optional)
              {(technicianRemarks || customerRepresentative || customerAcknowledgement) && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: 'var(--color-brand-100)',
                    color: 'var(--color-brand-800)',
                    padding: '1px 6px',
                    borderRadius: '9999px',
                  }}
                >
                  Recorded
                </span>
              )}
            </span>
            {isAdditionalOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isAdditionalOpen && (
            <div
              className="svr-disclosure-content"
              style={{
                padding: 'var(--space-4)',
                border: '1px solid var(--border-default)',
                borderTop: 'none',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                backgroundColor: 'var(--bg-surface)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  General Technician Remarks
                </label>
                <Textarea
                  value={technicianRemarks}
                  onChange={(e) => setTechnicianRemarks(e.target.value)}
                  rows={3}
                  placeholder="Internal operational notes, special tools used, or recommendations..."
                  disabled={isSubmitting}
                  style={{ fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer / Site Representative Name
                  </label>
                  <Input
                    value={customerRepresentative}
                    onChange={(e) => setCustomerRepresentative(e.target.value)}
                    placeholder="e.g. Ramesh Shah (Facility Incharge)"
                    disabled={isSubmitting}
                    style={{ fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer Feedback / Acknowledgement
                  </label>
                  <Input
                    value={customerAcknowledgement}
                    onChange={(e) => setCustomerAcknowledgement(e.target.value)}
                    placeholder="e.g. Satisfied with service, cooling restored"
                    disabled={isSubmitting}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};
