import React, { useState, useEffect, useRef } from 'react';
import {
  ServiceSchedule,
  ServiceVisitType,
  ServiceVisitOutcome,
  CreateServiceReportPayload,
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

type FormStatus = 'IDLE' | 'VALIDATING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

export const ServiceVisitReportModal: React.FC<ServiceVisitReportModalProps> = ({
  isOpen,
  onClose,
  schedule,
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
      recommendedAction: '',
      isApprovalRequired: false,
      isSpecialistRequired: false,
      isRevisitRequired: true,
    },
  ]);

  // Reset & initialize prefilled data whenever schedule changes
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
  }, [schedule, isOpen]);

  if (!schedule) return null;

  const isSubmitting = formStatus === 'VALIDATING' || formStatus === 'SUBMITTING';

  const visitType: ServiceVisitType =
    schedule.scheduleType === 'PREVENTIVE' || schedule.amcId || schedule.pmObligationId
      ? 'PREVENTIVE'
      : 'SERVICE_REQUEST';

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
        (r) => !r.itemName.trim() || !r.reason.trim() || !r.recommendedAction.trim()
      );
      if (invalidRepair) {
        const msg =
          'All repair items must have a Fault/Repair Description, Reason Pending, and Recommended Action.';
        setItemError(msg);
        setErrorMessage(msg);
        setFormStatus('ERROR');
        return;
      }
    }

    try {
      setFormStatus('SUBMITTING');

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

      setFormStatus('SUCCESS');
      showToast({
        type: 'success',
        title: 'Visit Report Saved',
        message: `Service Visit Report #${trimmedNumber} persisted successfully (${primaryOutcome})`,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setFormStatus('ERROR');
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          const msg = `Report number "${trimmedNumber}" already exists in the system. Please enter a distinct report number.`;
          setReportNumberError(msg);
          setErrorMessage(msg);
          reportNumberInputRef.current?.focus();
        } else {
          setErrorMessage(err.message || 'Failed to persist visit report.');
        }
      } else {
        const fallbackMsg =
          (err as Error)?.message || 'An unexpected error occurred while saving the report.';
        setErrorMessage(fallbackMsg);
      }

      showToast({
        type: 'error',
        title: 'Submission Failed',
        message:
          err instanceof ApiError
            ? err.message
            : 'Could not save the service report. Please check the inputs.',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Service Visit Report"
      description={`Official execution record for Appointment #${schedule.scheduleNumber}`}
      maxWidth="940px"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>All fields with asterisk (*) are required for persistence</span>
          </div>
          <div className="flex gap-3">
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
                ? 'Saving Visit Report...'
                : formStatus === 'VALIDATING'
                ? 'Validating Details...'
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
        className="space-y-6"
      >
        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-sm text-red-800 animate-fade-in shadow-xs">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-900">Validation Notice</div>
              <div className="text-red-800 text-xs mt-0.5">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Section 1: Authoritative Appointment Details (Read-Only) */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              Appointment Context (Read-Only)
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                visitType === 'PREVENTIVE'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {visitType === 'PREVENTIVE' ? 'AMC Preventive Maintenance' : 'Customer Service Request'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
              <span className="text-slate-400 block font-medium">Customer</span>
              <span className="font-semibold text-slate-900 block truncate mt-0.5">
                {schedule.customerName || 'N/A'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {schedule.customerCode || 'Code: N/A'}
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
              <span className="text-slate-400 block font-medium">Site Location</span>
              <span className="font-semibold text-slate-900 block truncate mt-0.5">
                {schedule.siteName || 'N/A'}
              </span>
              <span className="text-[11px] text-slate-500 truncate block">
                {schedule.siteAddress || 'Address on file'}
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
              <span className="text-slate-400 block font-medium">Assigned Technician</span>
              <span className="font-semibold text-blue-800 block truncate mt-0.5 flex items-center gap-1">
                <User size={12} className="text-blue-600" />
                {schedule.technicianName || 'Unassigned'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                [{schedule.technicianCode || 'N/A'}]
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
              <span className="text-slate-400 block font-medium">Work Item Reference</span>
              {schedule.amcContractNumber ? (
                <span className="font-semibold text-purple-700 block truncate mt-0.5">
                  AMC: {schedule.amcContractNumber}
                </span>
              ) : schedule.serviceRequestNumber ? (
                <span className="font-semibold text-blue-700 block truncate mt-0.5">
                  SR: {schedule.serviceRequestNumber}
                </span>
              ) : (
                <span className="font-semibold text-slate-700 block truncate mt-0.5">
                  General Appointment
                </span>
              )}
              <span className="text-[11px] text-slate-500 font-mono">
                Appt: {schedule.scheduleNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Report Information (Manual Number & Timing) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="manual-report-number-input"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Manual Report Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
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
                className={`font-mono text-sm tracking-wide ${
                  reportNumberError ? 'border-red-500 focus:ring-red-400' : ''
                }`}
              />
              <Hash className="w-4 h-4 absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
            {reportNumberError ? (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertTriangle size={12} className="flex-shrink-0" />
                {reportNumberError}
              </p>
            ) : (
              <span className="text-[11px] text-slate-500 block mt-1">
                Physical carbon / booklet serial number
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="reported-visit-date-input"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Reported Visit Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                id="reported-visit-date-input"
                type="date"
                value={visitDate}
                onChange={(e) => {
                  setVisitDate(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
              />
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              Date the visit was performed on-site
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Visit Timing (Start & End)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
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
                />
              </div>
              <div className="relative">
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
                  className={timeError ? 'border-red-500' : ''}
                />
              </div>
            </div>
            {timeError ? (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <Clock size={12} className="flex-shrink-0" />
                {timeError}
              </p>
            ) : (
              <span className="text-[11px] text-slate-500 block mt-1">
                Actual technician on-site interval
              </span>
            )}
          </div>
        </div>

        {/* Section 3: Primary Visit Outcome (3 Equal Cards with Rich Visual Tokens) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Primary Visit Outcome <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. Service Completed Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('COMPLETED')}
              className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 flex items-start gap-3 cursor-pointer shadow-2xs ${
                primaryOutcome === 'COMPLETED'
                  ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-3 ring-emerald-600/15'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white text-slate-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                  primaryOutcome === 'COMPLETED'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm leading-tight flex items-center justify-between">
                  <span>Service Completed</span>
                  {primaryOutcome === 'COMPLETED' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                  All work finished on-site and verified functional
                </div>
              </div>
            </button>

            {/* 2. Pending for Parts Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_PARTS')}
              className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 flex items-start gap-3 cursor-pointer shadow-2xs ${
                primaryOutcome === 'PENDING_PARTS'
                  ? 'border-amber-600 bg-amber-50/70 text-amber-950 ring-3 ring-amber-600/15'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white text-slate-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                  primaryOutcome === 'PENDING_PARTS'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Package className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm leading-tight flex items-center justify-between">
                  <span>Pending for Parts</span>
                  {primaryOutcome === 'PENDING_PARTS' && (
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Requires procurement of replacement spare parts
                </div>
              </div>
            </button>

            {/* 3. Pending for Repairs Card */}
            <button
              type="button"
              onClick={() => handleOutcomeChange('PENDING_REPAIRS')}
              className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 flex items-start gap-3 cursor-pointer shadow-2xs ${
                primaryOutcome === 'PENDING_REPAIRS'
                  ? 'border-rose-600 bg-rose-50/70 text-rose-950 ring-3 ring-rose-600/15'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white text-slate-700'
              }`}
            >
              <div
                className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                  primaryOutcome === 'PENDING_REPAIRS'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Wrench className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm leading-tight flex items-center justify-between">
                  <span>Pending for Repairs</span>
                  {primaryOutcome === 'PENDING_REPAIRS' && (
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Requires specialized repair, client approval, or revisit
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 4: Per-Asset Inspection Findings */}
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-blue-600" />
              AC Asset Findings & Inspection Details ({assets.length}{' '}
              {assets.length === 1 ? 'Unit' : 'Units'})
            </span>
            <span className="text-xs text-slate-400">
              Findings preserved independently per unit
            </span>
          </div>

          {assets.map((asset, idx) => (
            <div
              key={asset.assetId}
              className="space-y-3.5 p-4 bg-slate-50/90 rounded-xl border border-slate-200"
            >
              <div className="flex justify-between items-center text-xs font-semibold text-slate-800 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono font-bold">
                    {asset.assetTag}
                  </span>
                  <span className="text-slate-700">
                    {asset.brand} {asset.modelNumber} — {asset.roomLocation || 'General / Central'}
                  </span>
                </div>
                <span className="text-slate-500 text-[11px]">
                  Unit {idx + 1} of {assets.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fault or Complaint Reported
                  </label>
                  <Input
                    value={asset.faultReported}
                    onChange={(e) => handleAssetFieldChange(idx, 'faultReported', e.target.value)}
                    placeholder="e.g. Low cooling, noise from blower"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnosis / Findings
                  </label>
                  <Input
                    value={asset.diagnosisFindings}
                    onChange={(e) =>
                      handleAssetFieldChange(idx, 'diagnosisFindings', e.target.value)
                    }
                    placeholder="e.g. Coil choked with dust, pressure normal"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Work Performed on this Asset{' '}
                  {primaryOutcome === 'COMPLETED' && (
                    <span className="text-slate-400 font-normal">
                      (or describe in overall summary below)
                    </span>
                  )}
                </label>
                <Input
                  value={asset.workPerformed}
                  onChange={(e) => handleAssetFieldChange(idx, 'workPerformed', e.target.value)}
                  placeholder="e.g. Jet cleaned filters, tested compressor amp"
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Final Asset Condition
                  </label>
                  <select
                    value={asset.finalCondition}
                    onChange={(e) => handleAssetFieldChange(idx, 'finalCondition', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white font-medium text-slate-800"
                    disabled={isSubmitting}
                  >
                    <option value="Good">Good / Fully Operational</option>
                    <option value="Fair">Fair / Requires Regular Monitoring</option>
                    <option value="Poor">Poor / Performance Degraded</option>
                    <option value="Critical">Critical / Non-Operational</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id={`ref-add-${idx}`}
                    checked={asset.refrigerantAdded}
                    onChange={(e) =>
                      handleAssetFieldChange(idx, 'refrigerantAdded', e.target.checked)
                    }
                    disabled={isSubmitting}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <label
                    htmlFor={`ref-add-${idx}`}
                    className="text-xs text-slate-700 font-medium cursor-pointer"
                  >
                    Refrigerant Added (Gas Top-Up)
                  </label>
                </div>

                {asset.refrigerantAdded && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Section 5A: Outcome Section — Service Completed */}
        {primaryOutcome === 'COMPLETED' && (
          <div className="space-y-3 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Service Completed — Overall Work Summary & Verification
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Summary of Servicing & Testing Performed <span className="text-red-500">*</span>
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
                className={workError ? 'border-red-500' : ''}
              />
              {workError ? (
                <p className="text-xs text-red-600 font-medium mt-1">{workError}</p>
              ) : (
                <span className="text-[11px] text-slate-500 block mt-1">
                  Required if not already specified in per-asset work performed above
                </span>
              )}
            </div>
          </div>
        )}

        {/* Section 5B: Outcome Section — Pending for Parts */}
        {primaryOutcome === 'PENDING_PARTS' && (
          <div className="space-y-4 p-4 bg-amber-50/50 border border-amber-200 rounded-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <Package className="w-4 h-4 text-amber-600" />
                Required Parts Specification ({partItems.length}{' '}
                {partItems.length === 1 ? 'Item' : 'Items'})
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addPartItem}>
                <Plus size={14} className="mr-1" /> Add Another Part
              </Button>
            </div>

            {itemError && (
              <p className="text-xs text-red-600 font-medium">{itemError}</p>
            )}

            {partItems.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 bg-white border border-amber-200/90 rounded-xl space-y-3 shadow-2xs"
              >
                <div className="flex justify-between items-center text-xs font-semibold text-amber-900 pb-1.5 border-b border-amber-100">
                  <span>Part Item #{idx + 1}</span>
                  {partItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePartItem(item.id)}
                      className="text-red-600 hover:text-red-800 flex items-center gap-1 text-xs cursor-pointer"
                      title="Remove Part"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
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
                      onChange={(e) =>
                        updatePartItem(item.id, 'quantity', parseInt(e.target.value, 10) || 1)
                      }
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
                      placeholder="e.g. Capacitor blown, preventing compressor starting"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-700 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) =>
                        updatePartItem(item.id, 'isRevisitRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      className="w-4 h-4 text-amber-600 rounded"
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
          <div className="space-y-4 p-4 bg-rose-50/50 border border-rose-200 rounded-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-rose-900 font-bold text-xs uppercase tracking-wider">
                <Wrench className="w-4 h-4 text-rose-600" />
                Required Repairs & Next Action Items ({repairItems.length}{' '}
                {repairItems.length === 1 ? 'Item' : 'Items'})
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addRepairItem}>
                <Plus size={14} className="mr-1" /> Add Another Repair
              </Button>
            </div>

            {itemError && (
              <p className="text-xs text-red-600 font-medium">{itemError}</p>
            )}

            {repairItems.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 bg-white border border-rose-200/90 rounded-xl space-y-3 shadow-2xs"
              >
                <div className="flex justify-between items-center text-xs font-semibold text-rose-900 pb-1.5 border-b border-rose-100">
                  <span>Repair Item #{idx + 1}</span>
                  {repairItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRepairItem(item.id)}
                      className="text-red-600 hover:text-red-800 flex items-center gap-1 text-xs cursor-pointer"
                      title="Remove Repair"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
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
                    placeholder="e.g. Copper tube brazing and nitrogen leak pressure test"
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
                      placeholder="e.g. Nitrogen cylinder and brazing kit required on site"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Recommended Next Action <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={item.recommendedAction}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'recommendedAction', e.target.value)
                      }
                      placeholder="e.g. Arrange specialist team revisit with welding equipment"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isApprovalRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isApprovalRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      className="w-4 h-4 text-rose-600 rounded"
                    />
                    <span>Customer / Management Approval Required</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isSpecialistRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isSpecialistRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      className="w-4 h-4 text-rose-600 rounded"
                    />
                    <span>Senior HVAC Specialist Required</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isRevisitRequired}
                      onChange={(e) =>
                        updateRepairItem(item.id, 'isRevisitRequired', e.target.checked)
                      }
                      disabled={isSubmitting}
                      className="w-4 h-4 text-rose-600 rounded"
                    />
                    <span>Revisit Required</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Section 6: Technician Remarks & Customer Acknowledgement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              General Technician Remarks
            </label>
            <Textarea
              value={technicianRemarks}
              onChange={(e) => setTechnicianRemarks(e.target.value)}
              rows={3}
              placeholder="Internal operational notes, special tools used, or recommendations..."
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
                Customer Feedback / Acknowledgement
              </label>
              <Input
                value={customerAcknowledgement}
                onChange={(e) => setCustomerAcknowledgement(e.target.value)}
                placeholder="e.g. Satisfied with service, cooling restored"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
