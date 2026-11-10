import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { technicianApi, TechJob } from '@/services/technicianApi';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [reportNumber, setReportNumber] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [reportedDate, setReportedDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');

  // Diagnostics & Asset Findings
  const [performedServiceType, setPerformedServiceType] = useState('Dry Service');
  const [filterCleaned, setFilterCleaned] = useState(true);
  const [coilJetWashed, setCoilJetWashed] = useState(false);
  const [drainCleared, setDrainCleared] = useState(true);
  const [electricalTightened, setElectricalTightened] = useState(true);
  const [suctionPsi, setSuctionPsi] = useState<string>('125');
  const [dischargePsi, setDischargePsi] = useState<string>('320');
  const [runAmps, setRunAmps] = useState<string>('6.5');
  const [voltage, setVoltage] = useState<string>('230');

  // Gas recharge
  const [gasAdded, setGasAdded] = useState(false);
  const [gasType, setGasType] = useState('R32');
  const [gasQty, setGasQty] = useState('0.4');

  // Outcome & Notes
  const [primaryOutcome, setPrimaryOutcome] = useState<'COMPLETED' | 'PENDING_PARTS' | 'PENDING_REPAIRS'>('COMPLETED');
  const [diagnosisFindings, setDiagnosisFindings] = useState('Filters cleaned, coils inspected. Operating pressures within nominal range.');
  const [workPerformed, setWorkPerformed] = useState('Standard preventive maintenance dry servicing performed. Blower checked.');
  const [technicianRemarks, setTechnicianRemarks] = useState('Cooling verified functional. Customer satisfied.');

  // Customer Sign-off
  const [customerRep, setCustomerRep] = useState('');
  const [isDigitallySigned, setIsDigitallySigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!scheduleId) return;

    technicianApi
      .getJobDetail(scheduleId)
      .then(({ schedule, existingReport }) => {
        if (existingReport) {
          alert(`A service report (${existingReport.reportNumber}) has already been filed for this appointment.`);
          onBack();
          return;
        }
        setJob(schedule);
        setCustomerRep(schedule.customers?.name || '');
        if (schedule.planned_service_type) {
          setPerformedServiceType(schedule.planned_service_type);
        } else if (!schedule.amc_id) {
          setPerformedServiceType('DIAGNOSTIC_INSPECTION');
        } else {
          setPerformedServiceType('DRY_SERVICE');
        }

        if (!schedule.amc_id) {
          const complaint = schedule.service_requests?.description || 'Breakdown symptom reported by customer';
          setDiagnosisFindings(`Inspected unit: ${complaint}. Measured operating parameters.`);
          setWorkPerformed(`Diagnosed fault and performed corrective on-site servicing.`);
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.error?.message || 'Failed to load appointment details.');
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
      setError('Physical booklet report number is mandatory.');
      setStep(1);
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
        startTime,
        endTime,
        serviceExecutionType: performedServiceType,
        primaryOutcome,
        technicianRemarks,
        customerRepresentative: customerRep.trim(),
        customerAcknowledgement: isDigitallySigned ? 'Digitally Signed by Customer on Field Device' : 'Confirmed on-site by Customer Representative',
        signatureDataUrl,
        assets: [
          {
            assetId: job.ac_assets?.id || '00000000-0000-0000-0000-000000000000',
            assetTag: job.ac_assets?.asset_tag,
            brand: job.ac_assets?.brand,
            modelNumber: job.ac_assets?.model_number,
            roomLocation: job.ac_assets?.room_location,
            diagnosisFindings,
            workPerformed,
            assetOutcome: primaryOutcome,
            finalCondition: 'GOOD',
            filterCleaned,
            coilJetWashed,
            drainCleared,
            electricalTightened,
            suctionPressurePsi: suctionPsi ? Number(suctionPsi) : null,
            dischargePressurePsi: dischargePsi ? Number(dischargePsi) : null,
            runAmperage: runAmps ? Number(runAmps) : null,
            operatingVoltage: voltage ? Number(voltage) : null,
            refrigerantAdded: gasAdded,
            refrigerantType: gasAdded ? gasType : null,
            refrigerantQtyKg: gasAdded && gasQty ? Number(gasQty) : null,
          },
        ],
        items: [],
      };

      await technicianApi.submitFieldReport(payload);
      alert('Service Report submitted successfully! Schedule is now completed.');
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to submit service report.');
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
            onClick={() => setStep(s.num as any)}
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
                Carbon Booklet Report Number *
              </label>
              <input
                type="text"
                value={reportNumber}
                onChange={(e) => setReportNumber(e.target.value)}
                placeholder="e.g. REP-2026-0042"
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
                Serial number from physical paper slip
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
                placeholder="e.g. Ramesh Kumar"
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
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Inspected AC Equipment
              </span>
              <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
                {job?.ac_assets?.brand} {job?.ac_assets?.model_number} ({job?.ac_assets?.room_location || 'Main Unit'})
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: '2px 0 0 0' }}>
                Tag: {job?.ac_assets?.asset_tag || 'ESSC-UNIT'} · {job?.ac_assets?.tonnage || '1.5'} Ton
              </p>
            </div>

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

            {/* Diagnostic Readings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Operating Readings</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Suction (PSI)</span>
                  <input
                    type="number"
                    value={suctionPsi}
                    onChange={(e) => setSuctionPsi(e.target.value)}
                    placeholder="e.g. 125"
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Discharge (PSI)</span>
                  <input
                    type="number"
                    value={dischargePsi}
                    onChange={(e) => setDischargePsi(e.target.value)}
                    placeholder="e.g. 320"
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Run Amps (A)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={runAmps}
                    onChange={(e) => setRunAmps(e.target.value)}
                    placeholder="e.g. 6.5"
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Voltage (V)</span>
                  <input
                    type="number"
                    value={voltage}
                    onChange={(e) => setVoltage(e.target.value)}
                    placeholder="e.g. 230"
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Inspection Findings &amp; Diagnosis</label>
              <textarea
                value={diagnosisFindings}
                onChange={(e) => setDiagnosisFindings(e.target.value)}
                rows={2}
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
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Work Performed Description</label>
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                rows={2}
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
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>Technician Observations</label>
              <textarea
                value={technicianRemarks}
                onChange={(e) => setTechnicianRemarks(e.target.value)}
                rows={2}
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
                onClick={() => setStep(4)}
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
