import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Camera,
  Trash2,
} from 'lucide-react';
import { technicianApi, TechJob } from '@/services/technicianApi';
import { getApiErrorMessage } from '@/services/api/client';
import { getIstTodayIso } from '@/utils/date';
import { uploadFieldMediaFile } from '@/utils/mediaUpload';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import {
  PM_SERVICE_TYPES,
  BREAKDOWN_REPAIR_TYPES,
  getBreakdownCategoryLabel,
} from '@/domain/breakdownTypes';

export interface TechnicianServiceReportFormProps {
  scheduleId: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function TechnicianServiceReportForm({
  scheduleId,
  onBack,
  onSuccess,
}: TechnicianServiceReportFormProps) {
  const [job, setJob] = useState<TechJob | null>(null);
  const [siteAssets, setSiteAssets] = useState<NonNullable<TechJob['ac_assets']>[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [reportNumber, setReportNumber] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [reportedDate, setReportedDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Diagnostics & Asset Findings
  const [performedServiceType, setPerformedServiceType] = useState('DRY_SERVICE');
  const [filterCleaned, setFilterCleaned] = useState(false);
  const [coilJetWashed, setCoilJetWashed] = useState(false);
  const [drainCleared, setDrainCleared] = useState(false);
  const [electricalTightened, setElectricalTightened] = useState(false);

  // Gas recharge
  const [gasAdded, setGasAdded] = useState(false);
  const [gasType, setGasType] = useState('R32');
  const [gasQty, setGasQty] = useState('');

  // Outcome & Notes
  const [primaryOutcome, setPrimaryOutcome] = useState<'COMPLETED' | 'PENDING_PARTS' | 'PENDING_REPAIRS'>('COMPLETED');
  const [diagnosisFindings, setDiagnosisFindings] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [technicianRemarks, setTechnicianRemarks] = useState('');
  const [pendingItemDesc, setPendingItemDesc] = useState('');

  // Customer Sign-off
  const [customerRep, setCustomerRep] = useState('');
  const [isDigitallySigned, setIsDigitallySigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Photo Evidence
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const beforeInputRef = useRef<HTMLInputElement | null>(null);
  const afterInputRef = useRef<HTMLInputElement | null>(null);

  // Spot Billing & Payment Collection
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CASH' | 'CHEQUE' | 'NEFT'>('UPI');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [hasRecoveredDraft, setHasRecoveredDraft] = useState(false);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > maxDim) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            }
          } else {
            if (h > maxDim) {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let resultUrl: string;
      try {
        resultUrl = await uploadFieldMediaFile({
          file,
          scope: type === 'before' ? 'before-photo' : 'after-photo',
          entityRef: scheduleId,
          portal: 'tech',
        });
      } catch {
        resultUrl = await compressImage(file);
      }
      if (type === 'before') setBeforePhoto(resultUrl);
      else setAfterPhoto(resultUrl);
    } catch {
      setError('Failed to process photo from device.');
    }
  };

  const applyPreset = (preset: 'PM_STANDARD' | 'GAS_LEAK' | 'BREAKDOWN_CHECK') => {
    if (preset === 'PM_STANDARD') {
      setFilterCleaned(true);
      setCoilJetWashed(true);
      setDrainCleared(true);
      setElectricalTightened(true);
      setGasAdded(false);
      setPrimaryOutcome('COMPLETED');
      setDiagnosisFindings('Filters washed, coils jet cleaned, drain line cleared.');
      setWorkPerformed('Full preventive maintenance servicing performed. Condenser & evaporator jet cleaned.');
    } else if (preset === 'GAS_LEAK') {
      setElectricalTightened(true);
      setGasAdded(true);
      setPrimaryOutcome('COMPLETED');
      setDiagnosisFindings('Refrigerant leak detected and pressure tested.');
      setWorkPerformed('Torqued and flared joints, nitrogen leak test, vacuumed to 500 microns, recharged gas.');
    } else if (preset === 'BREAKDOWN_CHECK') {
      setFilterCleaned(true);
      setElectricalTightened(true);
      setDiagnosisFindings('Diagnostic evaluation conducted on compressor, electrical circuitry, and PCB relays.');
      setWorkPerformed('Inspected control circuits and tested operational amperage under load.');
    }
  };

  // Draft Auto-Recovery from LocalStorage
  useEffect(() => {
    if (!scheduleId) return;
    try {
      const saved = localStorage.getItem(`pys_draft_report_${scheduleId}`);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.reportNumber) setReportNumber(draft.reportNumber);
        if (draft.reportedDate) setReportedDate(draft.reportedDate);
        if (draft.startTime) setStartTime(draft.startTime);
        if (draft.endTime) setEndTime(draft.endTime);
        if (draft.selectedAssetId) setSelectedAssetId(draft.selectedAssetId);
        if (draft.assistantName) setAssistantName(draft.assistantName);
        if (draft.performedServiceType) setPerformedServiceType(draft.performedServiceType);
        if (draft.diagnosisFindings) setDiagnosisFindings(draft.diagnosisFindings);
        if (draft.workPerformed) setWorkPerformed(draft.workPerformed);
        if (draft.technicianRemarks) setTechnicianRemarks(draft.technicianRemarks);
        if (draft.pendingItemDesc) setPendingItemDesc(draft.pendingItemDesc);
        if (draft.customerRep) setCustomerRep(draft.customerRep);
        if (draft.paymentCollected !== undefined) setPaymentCollected(draft.paymentCollected);
        if (draft.paymentAmount) setPaymentAmount(draft.paymentAmount);
        if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
        if (draft.paymentReference) setPaymentReference(draft.paymentReference);
        if (draft.beforePhoto) setBeforePhoto(draft.beforePhoto);
        if (draft.afterPhoto) setAfterPhoto(draft.afterPhoto);
        setHasRecoveredDraft(true);
      }
    } catch {
      /* ignore localStorage access/parse errors */
    }
  }, [scheduleId]);

  // Save draft on state changes
  useEffect(() => {
    if (!scheduleId || isLoading) return;
    try {
      const draft = {
        reportNumber,
        reportedDate,
        startTime,
        endTime,
        selectedAssetId,
        assistantName,
        performedServiceType,
        diagnosisFindings,
        workPerformed,
        technicianRemarks,
        pendingItemDesc,
        customerRep,
        paymentCollected,
        paymentAmount,
        paymentMethod,
        paymentReference,
        beforePhoto,
        afterPhoto,
      };
      localStorage.setItem(`pys_draft_report_${scheduleId}`, JSON.stringify(draft));
    } catch {
      /* ignore localStorage quota/access errors */
    }
  }, [scheduleId, isLoading, reportNumber, reportedDate, startTime, endTime, selectedAssetId, assistantName, performedServiceType, diagnosisFindings, workPerformed, technicianRemarks, pendingItemDesc, customerRep, paymentCollected, paymentAmount, paymentMethod, paymentReference, beforePhoto, afterPhoto]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(`pys_draft_report_${scheduleId}`);
      setHasRecoveredDraft(false);
    } catch {
      /* ignore localStorage access errors */
    }
  };

  useEffect(() => {
    if (!scheduleId) return;

    technicianApi
      .getJobDetail(scheduleId)
      .then(({ schedule, existingReport, suggestedReportNumber, siteAssets: loadedSiteAssets }) => {
        if (existingReport) {
          setError(`A service report (${existingReport.reportNumber}) has already been filed for this appointment.`);
          onBack();
          return;
        }
        setJob(schedule);
        setCustomerRep((prev) => prev || schedule.customers?.name || '');

        if (suggestedReportNumber) {
          setReportNumber((prev) => prev || suggestedReportNumber);
        }

        const resolvedDate = schedule.scheduled_date || getIstTodayIso();
        setReportedDate((prev) => prev || resolvedDate);

        if (schedule.start_time) {
          setStartTime((prev) => prev || schedule.start_time.slice(0, 5));
        }
        if (schedule.end_time) {
          setEndTime((prev) => prev || schedule.end_time.slice(0, 5));
        }

        const resolvedAssets =
          loadedSiteAssets && loadedSiteAssets.length > 0
            ? loadedSiteAssets
            : schedule.ac_assets
              ? [schedule.ac_assets]
              : [];
        setSiteAssets(resolvedAssets);
        setSelectedAssetId((prev) => prev || schedule.ac_assets?.id || resolvedAssets[0]?.id || '');

        if (schedule.planned_service_type) {
          setPerformedServiceType(schedule.planned_service_type);
        } else if (!schedule.amc_id) {
          setPerformedServiceType('DIAGNOSTIC_INSPECTION');
        } else {
          setPerformedServiceType('DRY_SERVICE');
        }
      })
      .catch((err: unknown) => {
        setError(getApiErrorMessage(err, 'Failed to load appointment details.'));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [scheduleId, onBack]);

  // Touch signature canvas handlers
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setIsDigitallySigned(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsDigitallySigned(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    if (!reportNumber.trim()) {
      setError('Report number is required.');
      setStep(1);
      return;
    }

    if (!reportedDate || !startTime || !endTime) {
      setError('Service date, start time, and end time are required.');
      setStep(1);
      return;
    }

    const activeAsset = siteAssets.find((a) => a.id === selectedAssetId) || job.ac_assets || null;

    if (activeAsset && (!diagnosisFindings.trim() || diagnosisFindings.trim().length < 2)) {
      setError('Inspection findings & diagnosis are required (min 2 characters).');
      setStep(3);
      return;
    }

    if (!workPerformed.trim() || workPerformed.trim().length < 2) {
      setError('Work performed description is required (min 2 characters).');
      setStep(3);
      return;
    }

    if (technicianRemarks.trim().length < 3) {
      setError('Technician observations are required (min 3 characters).');
      setStep(3);
      return;
    }

    if (!customerRep.trim()) {
      setError('Customer representative acknowledgement name is required.');
      setStep(4);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let signatureDataUrl: string | null = null;
      if (canvasRef.current && isDigitallySigned) {
        signatureDataUrl = canvasRef.current.toDataURL('image/png');
      }

      const payload = {
        scheduleId,
        manualReportNumber: reportNumber.trim(),
        assistantName: assistantName.trim() || null,
        reportedVisitDate: reportedDate,
        startTime: startTime.slice(0, 5),
        endTime: endTime.slice(0, 5),
        serviceExecutionType: performedServiceType,
        primaryOutcome,
        workDescription: workPerformed.trim() || diagnosisFindings.trim() || null,
        technicianRemarks: technicianRemarks.trim(),
        customerRepresentative: customerRep.trim(),
        customerAcknowledgement: isDigitallySigned
          ? 'Digitally Signed by Customer on Field Device'
          : 'Confirmed on-site by Customer Representative',
        signatureDataUrl,
        beforePhotoUrl: beforePhoto,
        afterPhotoUrl: afterPhoto,
        paymentCollected,
        paymentAmount: paymentCollected && paymentAmount ? Number(paymentAmount) : 0,
        paymentMethod: paymentCollected ? paymentMethod : null,
        paymentReference: paymentCollected && paymentReference ? paymentReference.trim() : null,
        assets: activeAsset
          ? [
              {
                assetId: activeAsset.id,
                assetTag: activeAsset.asset_tag,
                brand: activeAsset.brand,
                modelNumber: activeAsset.model_number,
                roomLocation: activeAsset.room_location,
                diagnosisFindings: diagnosisFindings.trim(),
                workPerformed: workPerformed.trim(),
                assetOutcome: primaryOutcome,
                finalCondition: primaryOutcome === 'COMPLETED' ? 'GOOD' : 'FAIR',
                filterCleaned,
                coilJetWashed,
                drainCleared,
                electricalTightened,
                refrigerantAdded: gasAdded,
                refrigerantType: gasAdded ? gasType : null,
                refrigerantQtyKg: gasAdded && gasQty ? Number(gasQty) : null,
              },
            ]
          : [],
        items:
          primaryOutcome !== 'COMPLETED' && pendingItemDesc.trim().length >= 2
            ? [
                {
                  assetId: activeAsset?.id || null,
                  partDescription: pendingItemDesc.trim(),
                  quantity: 1,
                  isProcurementRequired: primaryOutcome === 'PENDING_PARTS',
                  isRevisitRequired: true,
                  actionRemarks: technicianRemarks.trim() || undefined,
                },
              ]
            : [],
      };

      await technicianApi.submitFieldReport(payload);
      try {
        localStorage.removeItem(`pys_draft_report_${scheduleId}`);
      } catch {
        /* ignore localStorage access errors */
      }
      onSuccess();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to submit service report.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        Loading appointment details...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Bar with Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Jobs</span>
        </button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
          {job?.schedule_number}
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Draft Recovery Notification */}
      {hasRecoveredDraft && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            color: '#2563eb',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>📝 Resumed from auto-saved draft.</span>
          <button
            type="button"
            onClick={handleClearDraft}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '11px',
              padding: 0,
            }}
          >
            Discard Draft
          </button>
        </div>
      )}

      {/* Step Indicator Wizard Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          backgroundColor: 'var(--bg-surface)',
          padding: '6px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
          textAlign: 'center',
        }}
      >
        {[
          { num: 1, label: '1. Serial' },
          { num: 2, label: '2. Check' },
          { num: 3, label: '3. Outcome' },
          { num: 4, label: '4. Sign' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
            style={{
              padding: '6px 4px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: step === s.num ? 'var(--color-brand)' : 'transparent',
              color: step === s.num ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Main Form Container */}
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {/* STEP 1: Context & Serial */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Customer &amp; Site
              </span>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
                {job?.customers?.name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {job?.sites?.site_name} · {job?.sites?.address}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Report Number *
              </label>
              <input
                type="text"
                value={reportNumber}
                onChange={(e) => setReportNumber(e.target.value)}
                placeholder="Auto-generated or enter paper slip no."
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                }}
              />
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                Auto-generated serial report number (editable if overriding with a paper slip)
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Assistant / Helper Name (Optional)
              </label>
              <input
                type="text"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Helper / Assistant Full Name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Service Date</label>
                <input
                  type="date"
                  value={reportedDate}
                  onChange={(e) => setReportedDate(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!reportNumber.trim()) {
                  setError('Report number is required.');
                  return;
                }
                if (!reportedDate || !startTime || !endTime) {
                  setError('Service date, start time, and end time are required.');
                  return;
                }
                setError(null);
                setStep(2);
              }}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-brand)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                border: 'none',
                cursor: 'pointer',
                marginTop: 'var(--space-2)',
              }}
            >
              Continue to Inspection &rarr;
            </button>
          </div>
        )}

        {/* STEP 2: AC Inspection Diagnostics */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(() => {
              const activeAsset = siteAssets.find((a) => a.id === selectedAssetId) || job?.ac_assets || null;
              return (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Inspected AC Equipment
                  </span>
                  {siteAssets.length > 1 && (
                    <select
                      value={selectedAssetId}
                      onChange={(e) => setSelectedAssetId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    >
                      {siteAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.asset_tag || 'Unit'} — {asset.brand} {asset.model_number} ({asset.room_location || 'Site'})
                        </option>
                      ))}
                    </select>
                  )}
                  {activeAsset ? (
                    <>
                      <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
                        {[activeAsset.brand, activeAsset.model_number].filter(Boolean).join(' ') || 'AC Unit'}{' '}
                        {activeAsset.room_location ? `(${activeAsset.room_location})` : ''}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: '2px 0 0 0' }}>
                        Tag: {activeAsset.asset_tag || 'Unassigned'}
                        {activeAsset.tonnage ? ` · ${activeAsset.tonnage} Ton` : ''}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Site-level service visit (no individual AC unit linked)
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Reported Customer Issue */}
            {job?.service_requests && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#b45309' }}>
                    Reported Breakdown Symptom
                  </span>
                  {job.service_requests.issue_category && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', backgroundColor: 'rgba(245, 158, 11, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                      {getBreakdownCategoryLabel(job.service_requests.issue_category)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-primary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  <strong>Client Complaint:</strong> {job.service_requests.description}
                </p>
              </div>
            )}

            {/* Quick Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                ⚡ Quick Presets
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyPreset('PM_STANDARD')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#16a34a',
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Standard PM Clean
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('GAS_LEAK')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#2563eb',
                    cursor: 'pointer',
                  }}
                >
                  ❄️ Gas Leak Check
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('BREAKDOWN_CHECK')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#d97706',
                    cursor: 'pointer',
                  }}
                >
                  🔧 Breakdown Diagnostic
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Service Checklist</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: 'var(--text-xs)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filterCleaned}
                    onChange={(e) => setFilterCleaned(e.target.checked)}
                  />
                  <span>Filter Cleaned</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={coilJetWashed}
                    onChange={(e) => setCoilJetWashed(e.target.checked)}
                  />
                  <span>Coil Jet Washed</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={drainCleared}
                    onChange={(e) => setDrainCleared(e.target.checked)}
                  />
                  <span>Drain Cleared</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-default)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={electricalTightened}
                    onChange={(e) => setElectricalTightened(e.target.checked)}
                  />
                  <span>Wiring Checked</span>
                </label>
              </div>
            </div>

            {/* Photo Proof Evidence */}
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                📸 On-Site Photo Proof (Before & After)
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* Before Photo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>Before Service</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={beforeInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => handlePhotoUpload(e, 'before')}
                  />
                  {beforePhoto ? (
                    <div style={{ position: 'relative', height: '90px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                      <img src={beforePhoto} alt="Before Service" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setBeforePhoto(null)}
                        style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', padding: '4px', color: '#fff', cursor: 'pointer' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beforeInputRef.current?.click()}
                      style={{
                        height: '90px',
                        border: '1px dashed var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                      }}
                    >
                      <Camera size={18} />
                      <span>Snap Before</span>
                    </button>
                  )}
                </div>

                {/* After Photo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>After Service</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={afterInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => handlePhotoUpload(e, 'after')}
                  />
                  {afterPhoto ? (
                    <div style={{ position: 'relative', height: '90px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                      <img src={afterPhoto} alt="After Service" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setAfterPhoto(null)}
                        style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', padding: '4px', color: '#fff', cursor: 'pointer' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => afterInputRef.current?.click()}
                      style={{
                        height: '90px',
                        border: '1px dashed var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                      }}
                    >
                      <Camera size={18} />
                      <span>Snap After</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Gas Top-up Toggle */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Refrigerant (Gas) Charged?
                </span>
                <input
                  type="checkbox"
                  checked={gasAdded}
                  onChange={(e) => setGasAdded(e.target.checked)}
                />
              </label>

              {gasAdded && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Gas Type</span>
                    <select
                      value={gasType}
                      onChange={(e) => setGasType(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="R32">R32</option>
                      <option value="R410A">R410A</option>
                      <option value="R22">R22</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Qty Added (kg)</span>
                    <input
                      type="number"
                      step="0.05"
                      value={gasQty}
                      onChange={(e) => setGasQty(e.target.value)}
                      placeholder="Qty in kg"
                      style={{
                        padding: '6px 8px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  width: '33%',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={{
                  width: '67%',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-brand)',
                  color: '#ffffff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Next: Outcome &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Outcome & Observations */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Performed Service Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Service Action Performed *
              </label>
              <select
                value={performedServiceType}
                onChange={(e) => setPerformedServiceType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
                required
              >
                {job?.amc_id ? (
                  <optgroup label="Preventive Maintenance Routine">
                    {PM_SERVICE_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  <optgroup label="Breakdown Diagnosis &amp; Repairs">
                    {BREAKDOWN_REPAIR_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Visit Outcome *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('COMPLETED')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: primaryOutcome === 'COMPLETED' ? '1px solid #16a34a' : '1px solid var(--border-default)',
                    backgroundColor: primaryOutcome === 'COMPLETED' ? 'rgba(34, 197, 94, 0.12)' : 'var(--bg-surface-subtle)',
                    color: primaryOutcome === 'COMPLETED' ? '#16a34a' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Completed
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('PENDING_PARTS')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: primaryOutcome === 'PENDING_PARTS' ? '1px solid #d97706' : '1px solid var(--border-default)',
                    backgroundColor: primaryOutcome === 'PENDING_PARTS' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-surface-subtle)',
                    color: primaryOutcome === 'PENDING_PARTS' ? '#d97706' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Pending Parts
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('PENDING_REPAIRS')}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: primaryOutcome === 'PENDING_REPAIRS' ? '1px solid #dc2626' : '1px solid var(--border-default)',
                    backgroundColor: primaryOutcome === 'PENDING_REPAIRS' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-surface-subtle)',
                    color: primaryOutcome === 'PENDING_REPAIRS' ? '#dc2626' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Needs Revisit
                </button>
              </div>
            </div>

            {primaryOutcome !== 'COMPLETED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {primaryOutcome === 'PENDING_PARTS' ? 'Required Spare Parts *' : 'Follow-up Repair Scope *'}
                </label>
                <input
                  type="text"
                  value={pendingItemDesc}
                  onChange={(e) => setPendingItemDesc(e.target.value)}
                  placeholder={
                    primaryOutcome === 'PENDING_PARTS'
                      ? 'Describe required spare parts and qty'
                      : 'Describe follow-up repair scope needed'
                  }
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Inspection Findings &amp; Diagnosis</label>
              <textarea
                value={diagnosisFindings}
                onChange={(e) => setDiagnosisFindings(e.target.value)}
                rows={2}
                placeholder="Enter inspection findings and fault diagnosis"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Work Performed Description *</label>
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                rows={2}
                placeholder="Describe the service or repair work performed"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Technician Observations *</label>
              <textarea
                value={technicianRemarks}
                onChange={(e) => setTechnicianRemarks(e.target.value)}
                rows={2}
                placeholder="Additional technician observations or notes (min 3 characters)"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  width: '33%',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={() => {
                  const activeAsset = siteAssets.find((a) => a.id === selectedAssetId) || job?.ac_assets || null;
                  if (activeAsset && diagnosisFindings.trim().length < 2) {
                    setError('Inspection findings & diagnosis are required (min 2 characters).');
                    return;
                  }
                  if (workPerformed.trim().length < 2) {
                    setError('Work performed description is required (min 2 characters).');
                    return;
                  }
                  if (technicianRemarks.trim().length < 3) {
                    setError('Technician observations are required (min 3 characters).');
                    return;
                  }
                  if (primaryOutcome !== 'COMPLETED' && pendingItemDesc.trim().length < 2) {
                    setError('Please describe the pending spare parts or repair scope.');
                    return;
                  }
                  setError(null);
                  setStep(4);
                }}
                style={{
                  width: '67%',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-brand)',
                  color: '#ffffff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Next: Customer Sign &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Customer Sign-off */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Spot Billing & Payment Collection */}
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  💰 Spot Payment Collection
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={paymentCollected}
                    onChange={(e) => setPaymentCollected(e.target.checked)}
                    style={{ accentColor: 'var(--color-brand)' }}
                  />
                  <span style={{ fontWeight: 600 }}>Payment Received</span>
                </label>
              </div>

              {paymentCollected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-default)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Amount (₹) *</label>
                      <input
                        type="number"
                        min="0"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Amount received"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Mode</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'UPI' | 'CASH' | 'CHEQUE' | 'NEFT')}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                      >
                        <option value="UPI">UPI / QR Code</option>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="NEFT">Bank Transfer (NEFT/IMPS)</option>
                      </select>
                    </div>
                  </div>

                  {paymentMethod === 'UPI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>Customer Scans to Pay Instantly</span>
                      <UpiQrCode
                        amount={Number(paymentAmount) || 0}
                        note={`Rep_${reportNumber || 'PYS'}`}
                        size={120}
                        showDetails={false}
                      />
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        UPI ID: {COMPANY_BANK_DETAILS.upiId}
                      </span>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                      {paymentMethod === 'UPI' ? 'UPI UTR / Transaction ID' : 'Receipt / Cheque / Ref Number'}
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={paymentMethod === 'UPI' ? 'Enter 12-digit UPI UTR / Transaction ID' : 'Receipt / Cheque / Reference Number'}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Customer Representative Name *</label>
              <input
                type="text"
                value={customerRep}
                onChange={(e) => setCustomerRep(e.target.value)}
                placeholder="Name of person acknowledging visit"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Signature Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Customer Digital Signature</label>
                <button
                  type="button"
                  onClick={clearSignature}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Clear</span>
                </button>
              </div>

              <div
                style={{
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#ffffff',
                  overflow: 'hidden',
                  touchAction: 'none',
                  position: 'relative',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={140}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ width: '100%', height: '140px', cursor: 'crosshair', display: 'block' }}
                />
                {!isDigitallySigned && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      color: '#94a3b8',
                      fontSize: 'var(--text-xs)',
                      fontStyle: 'italic',
                    }}
                  >
                    Customer sign with finger here
                  </div>
                )}
              </div>
            </div>

            {/* Final Submit Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 'var(--text-sm)',
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <span>Submitting &amp; Syncing Report...</span>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Submit &amp; Sync Report</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'none',
                  border: 'none',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                &larr; Back to Outcome
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
