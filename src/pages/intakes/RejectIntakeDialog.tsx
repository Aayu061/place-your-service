import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import type { IntakeDto, IntakeRejectStatus, RejectIntakePayload } from '@/services/intakeService';

const OUTCOMES: { value: IntakeRejectStatus; label: string; hint: string }[] = [
  { value: 'REJECTED', label: 'Reject', hint: 'Genuine request we will not take up. A reason is required.' },
  { value: 'DUPLICATE', label: 'Duplicate', hint: 'Same customer already asked for this.' },
  { value: 'SPAM', label: 'Spam', hint: 'Junk, test or abusive submission.' },
];

interface RejectIntakeDialogProps {
  /** Render only while open, keyed by intake id, so each opening starts with a fresh form. */
  intake: IntakeDto;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: RejectIntakePayload) => void;
}

export const RejectIntakeDialog: React.FC<RejectIntakeDialogProps> = ({ intake, isSubmitting, onClose, onSubmit }) => {
  const [outcome, setOutcome] = useState<IntakeRejectStatus>('REJECTED');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => reasonRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (outcome === 'REJECTED' && !trimmed) {
      setReasonError('Please write a short reason for rejecting this request.');
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    onSubmit({ status: outcome, reason: trimmed });
  };

  const submitLabel = outcome === 'REJECTED' ? 'Reject request' : outcome === 'SPAM' ? 'Mark as spam' : 'Mark as duplicate';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Reject request"
      description={`${intake.intakeNumber} · ${intake.contact.name}`}
      maxWidth="520px"
    >
      <form noValidate onSubmit={handleSubmit} aria-label="Reject request form" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend className="form-label" style={{ marginBottom: 6 }}>Outcome</legend>
          {OUTCOMES.map((o) => (
            <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="reject-outcome"
                value={o.value}
                checked={outcome === o.value}
                onChange={() => {
                  setOutcome(o.value);
                  setReasonError(null);
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>{o.label}</strong>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Textarea
          ref={reasonRef}
          id="reject-reason"
          label={outcome === 'REJECTED' ? 'Reason' : 'Reason (optional)'}
          required={outcome === 'REJECTED'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError ?? undefined}
          helperText="Internal note — not sent to the customer."
          rows={3}
          maxLength={1000}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-2)' }}>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
