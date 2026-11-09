import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { technicianApi, TechJob } from '@/services/technicianApi';

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
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0284c7';
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
    if (!scheduleId || !job) return;

    if (!reportNumber.trim()) {
      setError('Physical carbon booklet report number is required.');
      setStep(1);
      return;
    }

    if (!customerRep.trim()) {
      setError('Customer representative name is required for sign-off.');
      setStep(4);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Get signature data URL if signed
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
      <div className="p-8 text-center space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-brand-secondary">Loading appointment details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-brand-secondary hover:text-brand-primary transition-colors font-medium cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Jobs</span>
        </button>
        <div className="font-mono text-xs font-bold text-brand-primary">
          {job?.schedule_number}
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Indicator Wizard Bar */}
      <div className="grid grid-cols-4 gap-1.5 bg-surface-raised p-1.5 rounded-xl border border-brand-border text-center text-[10px] font-bold">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`py-1.5 rounded-lg transition-all ${
            step === 1 ? 'bg-brand-primary text-surface-canvas shadow-xs' : 'text-brand-secondary'
          }`}
        >
          1. Serial
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          className={`py-1.5 rounded-lg transition-all ${
            step === 2 ? 'bg-brand-primary text-surface-canvas shadow-xs' : 'text-brand-secondary'
          }`}
        >
          2. Check
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          className={`py-1.5 rounded-lg transition-all ${
            step === 3 ? 'bg-brand-primary text-surface-canvas shadow-xs' : 'text-brand-secondary'
          }`}
        >
          3. Outcome
        </button>
        <button
          type="button"
          onClick={() => setStep(4)}
          className={`py-1.5 rounded-lg transition-all ${
            step === 4 ? 'bg-brand-primary text-surface-canvas shadow-xs' : 'text-brand-secondary'
          }`}
        >
          4. Sign
        </button>
      </div>

      {/* Main Form Container */}
      <form onSubmit={handleSubmit} className="bg-surface-raised border border-brand-border rounded-2xl p-4 shadow-xs space-y-4">
        {/* STEP 1: Context & Serial */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-surface-sunken rounded-xl border border-brand-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                Customer &amp; Site
              </span>
              <p className="text-xs font-bold text-brand-primary">{job?.customers?.name}</p>
              <p className="text-[11px] text-brand-secondary">{job?.sites?.site_name} · {job?.sites?.address}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">
                Carbon Booklet Report Number *
              </label>
              <input
                type="text"
                value={reportNumber}
                onChange={(e) => setReportNumber(e.target.value)}
                placeholder="e.g. REP-2026-0042"
                required
                className="w-full px-3 py-2 bg-surface-sunken border border-brand-border rounded-xl text-xs font-mono font-bold text-brand-primary focus:outline-hidden focus:ring-2 focus:ring-brand-primary uppercase"
              />
              <p className="text-[10px] text-brand-secondary">Serial number from physical paper slip</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">
                Assistant / Helper Name (Optional)
              </label>
              <input
                type="text"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3 py-2 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary focus:outline-hidden focus:ring-2 focus:ring-brand-primary"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-brand-secondary">Service Date</label>
                <input
                  type="date"
                  value={reportedDate}
                  onChange={(e) => setReportedDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-brand-secondary">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-brand-secondary">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary font-medium"
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
              className="w-full py-2.5 rounded-xl bg-brand-primary text-surface-canvas font-bold text-xs"
            >
              Continue to Inspection &rarr;
            </button>
          </div>
        )}

        {/* STEP 2: AC Inspection Diagnostics */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-surface-sunken rounded-xl border border-brand-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                Inspected AC Equipment
              </span>
              <p className="text-xs font-bold text-brand-primary">
                {job?.ac_assets?.brand} {job?.ac_assets?.model_number} ({job?.ac_assets?.room_location || 'Main Unit'})
              </p>
              <p className="text-[11px] text-brand-secondary font-mono">
                Tag: {job?.ac_assets?.asset_tag || 'ESSC-UNIT'} · {job?.ac_assets?.tonnage || '1.5'} Ton
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-brand-primary">Service Checklist</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-sunken border border-brand-border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCleaned}
                    onChange={(e) => setFilterCleaned(e.target.checked)}
                    className="w-4 h-4 text-brand-primary rounded"
                  />
                  <span>Filter Cleaned</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-sunken border border-brand-border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coilJetWashed}
                    onChange={(e) => setCoilJetWashed(e.target.checked)}
                    className="w-4 h-4 text-brand-primary rounded"
                  />
                  <span>Coil Jet Washed</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-sunken border border-brand-border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={drainCleared}
                    onChange={(e) => setDrainCleared(e.target.checked)}
                    className="w-4 h-4 text-brand-primary rounded"
                  />
                  <span>Drain Cleared</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-sunken border border-brand-border cursor-pointer">
                  <input
                    type="checkbox"
                    checked={electricalTightened}
                    onChange={(e) => setElectricalTightened(e.target.checked)}
                    className="w-4 h-4 text-brand-primary rounded"
                  />
                  <span>Wiring Checked</span>
                </label>
              </div>
            </div>

            {/* Diagnostic Readings */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">Operating Readings</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-[10px] text-brand-secondary font-semibold">Suction (PSI)</span>
                  <input
                    type="number"
                    value={suctionPsi}
                    onChange={(e) => setSuctionPsi(e.target.value)}
                    placeholder="e.g. 125"
                    className="w-full px-2.5 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs font-mono font-bold text-brand-primary"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-brand-secondary font-semibold">Discharge (PSI)</span>
                  <input
                    type="number"
                    value={dischargePsi}
                    onChange={(e) => setDischargePsi(e.target.value)}
                    placeholder="e.g. 320"
                    className="w-full px-2.5 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs font-mono font-bold text-brand-primary"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-brand-secondary font-semibold">Run Amps (A)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={runAmps}
                    onChange={(e) => setRunAmps(e.target.value)}
                    placeholder="e.g. 6.5"
                    className="w-full px-2.5 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs font-mono font-bold text-brand-primary"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-brand-secondary font-semibold">Voltage (V)</span>
                  <input
                    type="number"
                    value={voltage}
                    onChange={(e) => setVoltage(e.target.value)}
                    placeholder="e.g. 230"
                    className="w-full px-2.5 py-1.5 bg-surface-sunken border border-brand-border rounded-xl text-xs font-mono font-bold text-brand-primary"
                  />
                </div>
              </div>
            </div>

            {/* Gas Top-up Toggle */}
            <div className="p-3 rounded-xl bg-surface-sunken border border-brand-border space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-brand-primary">Refrigerant (Gas) Charged?</span>
                <input
                  type="checkbox"
                  checked={gasAdded}
                  onChange={(e) => setGasAdded(e.target.checked)}
                  className="w-4 h-4 text-brand-primary rounded"
                />
              </label>

              {gasAdded && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-brand-border">
                  <div>
                    <span className="text-[10px] text-brand-secondary">Gas Type</span>
                    <select
                      value={gasType}
                      onChange={(e) => setGasType(e.target.value)}
                      className="w-full px-2 py-1 bg-surface-raised border border-brand-border rounded-lg text-xs"
                    >
                      <option value="R32">R32</option>
                      <option value="R410A">R410A</option>
                      <option value="R22">R22</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-secondary">Quantity (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={gasQty}
                      onChange={(e) => setGasQty(e.target.value)}
                      className="w-full px-2 py-1 bg-surface-raised border border-brand-border rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 py-2.5 rounded-xl border border-brand-border text-xs font-bold"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-2/3 py-2.5 rounded-xl bg-brand-primary text-surface-canvas font-bold text-xs"
              >
                Next: Outcome &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Outcome & Observations */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-brand-primary">Visit Outcome *</label>
              <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold text-center">
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('COMPLETED')}
                  className={`p-2.5 rounded-xl border transition-all ${
                    primaryOutcome === 'COMPLETED'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold'
                      : 'bg-surface-sunken border-brand-border text-brand-secondary'
                  }`}
                >
                  Completed
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('PENDING_PARTS')}
                  className={`p-2.5 rounded-xl border transition-all ${
                    primaryOutcome === 'PENDING_PARTS'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 font-extrabold'
                      : 'bg-surface-sunken border-brand-border text-brand-secondary'
                  }`}
                >
                  Pending Parts
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryOutcome('PENDING_REPAIRS')}
                  className={`p-2.5 rounded-xl border transition-all ${
                    primaryOutcome === 'PENDING_REPAIRS'
                      ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 font-extrabold'
                      : 'bg-surface-sunken border-brand-border text-brand-secondary'
                  }`}
                >
                  Needs Revisit
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">Inspection Findings &amp; Diagnosis</label>
              <textarea
                value={diagnosisFindings}
                onChange={(e) => setDiagnosisFindings(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">Work Performed Description</label>
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">Technician Observations</label>
              <textarea
                value={technicianRemarks}
                onChange={(e) => setTechnicianRemarks(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3 py-2.5 rounded-xl border border-brand-border text-xs font-bold"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="w-2/3 py-2.5 rounded-xl bg-brand-primary text-surface-canvas font-bold text-xs"
              >
                Next: Customer Sign &rarr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Customer Sign-off */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-brand-primary">Customer Representative Name *</label>
              <input
                type="text"
                value={customerRep}
                onChange={(e) => setCustomerRep(e.target.value)}
                placeholder="Name of person acknowledging visit"
                required
                className="w-full px-3 py-2 bg-surface-sunken border border-brand-border rounded-xl text-xs text-brand-primary focus:outline-hidden focus:ring-2 focus:ring-brand-primary font-bold"
              />
            </div>

            {/* Signature Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-brand-primary">Customer Digital Signature</label>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="flex items-center gap-1 text-[10px] text-brand-secondary hover:text-red-500"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="border border-brand-border rounded-xl bg-white overflow-hidden touch-none relative shadow-inner">
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
                  className="w-full h-[140px] cursor-crosshair"
                />
                {!isDigitallySigned && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs italic">
                    Customer sign with finger here
                  </div>
                )}
              </div>
            </div>

            {/* Final Submit Button */}
            <div className="space-y-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Submitting &amp; Syncing Report...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit &amp; Sync Report</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full py-2 rounded-xl text-xs text-brand-secondary hover:text-brand-primary transition-colors font-semibold"
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
