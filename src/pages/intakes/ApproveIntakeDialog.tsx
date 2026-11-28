import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import type { ServicePriority, ServiceType } from '@/domain/types';
import {
  isCustomerAccountKind,
  listActiveTechnicians,
  type ApproveIntakePayload,
  type IntakeDto,
  type IntakeSlot,
  type TechnicianOption,
} from '@/services/intakeService';
import { getIstTodayIso } from '@/utils/date';
import { REQUEST_TYPE_OPTIONS, SLOT_LABELS } from './intakeFormat';

const PRIORITY_OPTIONS: { value: ServicePriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

const SLOT_OPTIONS = (Object.keys(SLOT_LABELS) as IntakeSlot[]).map((value) => ({ value, label: SLOT_LABELS[value] }));

interface ApproveIntakeDialogProps {
  /** Render only while open, keyed by intake id, so each opening starts with a fresh form. */
  intake: IntakeDto;
  defaultRequestType: ServiceType;
  /** Existing customer id, or null when a new temporary customer will be created. */
  customerId: string | null;
  customerLabel: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: ApproveIntakePayload) => void;
}

export const ApproveIntakeDialog: React.FC<ApproveIntakeDialogProps> = ({
  intake,
  defaultRequestType,
  customerId,
  customerLabel,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [today] = useState(() => getIstTodayIso());
  const [requestType, setRequestType] = useState<ServiceType>(defaultRequestType);
  const [priority, setPriority] = useState<ServicePriority>('MEDIUM');
  const [notes, setNotes] = useState('');
  const [withSchedule, setWithSchedule] = useState(false);
  const [date, setDate] = useState(() => {
    const preferred = intake.request.preferredDate;
    return preferred && preferred >= today ? preferred : '';
  });
  const [slot, setSlot] = useState<IntakeSlot | ''>(intake.request.preferredSlot ?? '');
  const [technicianId, setTechnicianId] = useState('');
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [techLoadFailed, setTechLoadFailed] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const requestTypeRef = useRef<HTMLSelectElement>(null);

  // Focus the first real field rather than the header close button.
  useEffect(() => {
    const t = setTimeout(() => (isCustomerAccountKind(intake.kind) ? notesRef.current : requestTypeRef.current)?.focus(), 0);
    return () => clearTimeout(t);
  }, [intake.kind]);

  // Technicians are only needed when scheduling; load lazily, fail quietly.
  useEffect(() => {
    if (!withSchedule || technicians.length > 0) return;
    let cancelled = false;
    listActiveTechnicians()
      .then((list) => {
        if (!cancelled) setTechnicians(list);
      })
      .catch(() => {
        if (!cancelled) setTechLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [withSchedule, technicians.length]);

  const accountRequest = isCustomerAccountKind(intake.kind);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accountRequest) {
      // Closes the review only: no service request, no visit, always the account's own customer (PYS enforces it).
      const payload: ApproveIntakePayload = {};
      if (customerId) payload.customerId = customerId;
      if (notes.trim()) payload.notes = notes.trim();
      onSubmit(payload);
      return;
    }
    const payload: ApproveIntakePayload = { requestType, priority };
    if (customerId) payload.customerId = customerId;
    if (notes.trim()) payload.notes = notes.trim();

    if (withSchedule) {
      let ok = true;
      if (!date) {
        setDateError('Pick a visit date.');
        ok = false;
      } else if (date < today) {
        setDateError('The visit date cannot be in the past.');
        ok = false;
      } else {
        setDateError(null);
      }
      if (!slot) {
        setSlotError('Pick a time slot.');
        ok = false;
      } else {
        setSlotError(null);
      }
      if (!ok) return;
      payload.schedule = { date, slot: slot as IntakeSlot };
      if (technicianId) payload.schedule.technicianId = technicianId;
    }

    onSubmit(payload);
  };

  if (accountRequest) {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title={intake.kind === 'AMC_RENEWAL' ? 'Close AMC renewal request' : 'Close change-of-details request'}
        description={`${intake.intakeNumber} · ${intake.contact.name}`}
        maxWidth="520px"
      >
        <form noValidate onSubmit={handleSubmit} aria-label="Close request form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Customer: <strong>{customerLabel}</strong>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            {intake.kind === 'AMC_RENEWAL'
              ? 'Approving only closes this request. Renew the contract in AMC first; no service request or visit is created.'
              : "Approving only closes this request. Edit the customer's details in Customers first; nothing is changed automatically."}
          </p>
          <Textarea
            ref={notesRef}
            id="approve-notes"
            label="What was done (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-2)' }}>
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              {intake.kind === 'AMC_RENEWAL' ? 'Mark renewal as done' : 'Mark change as done'}
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Approve request"
      description={`${intake.intakeNumber} · ${intake.contact.name}`}
      maxWidth="560px"
    >
      <form noValidate onSubmit={handleSubmit} aria-label="Approve request form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          Customer: <strong>{customerLabel}</strong>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          <Select
            ref={requestTypeRef}
            id="approve-request-type"
            label="Request type"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as ServiceType)}
            options={REQUEST_TYPE_OPTIONS}
            required
          />
          <Select
            id="approve-priority"
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ServicePriority)}
            options={PRIORITY_OPTIONS}
            required
          />
        </div>

        <Textarea
          id="approve-notes"
          label="Notes for the team (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={withSchedule}
            onChange={(e) => setWithSchedule(e.target.checked)}
          />
          Also book a visit now
        </label>

        {withSchedule && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
            <Input
              id="approve-schedule-date"
              type="date"
              label="Visit date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={dateError ?? undefined}
              required
            />
            <Select
              id="approve-schedule-slot"
              label="Time slot"
              value={slot}
              onChange={(e) => setSlot(e.target.value as IntakeSlot | '')}
              error={slotError ?? undefined}
              required
            >
              <option value="">Choose a slot</option>
              {SLOT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              id="approve-schedule-technician"
              label="Technician (optional)"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              helperText={techLoadFailed ? 'Could not load technicians — you can assign one later.' : undefined}
            >
              <option value="">Assign later</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.technicianCode ? ` (${t.technicianCode})` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-2)' }}>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>
            Approve &amp; create service request
          </Button>
        </div>
      </form>
    </Modal>
  );
};
