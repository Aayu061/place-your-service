import React from 'react';
import { CheckCircle2, XCircle, UserCheck, UserPlus, ExternalLink, Phone, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { IntakeCandidate, IntakeDetailDto, IntakeDto, IntakeItemDto, PublicCatalog } from '@/services/intakeService';
import {
  ITEM_TYPE_LABELS,
  KIND_LABELS,
  LINE_STATUS_LABELS,
  NEW_CUSTOMER,
  SLOT_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  findAmcPlan,
  findCatalogService,
  formatDateTime,
  formatPrice,
  formatWaitingFor,
  pickAmcRate,
} from './intakeFormat';
import { formatCurrency } from '@/utils/formatters';

interface IntakeDetailProps {
  intake: IntakeDto | null;
  detail: IntakeDetailDto | null;
  isDetailLoading: boolean;
  catalog: PublicCatalog | null;
  catalogError: boolean;
  customerChoice: string;
  onCustomerChoiceChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenServiceRequest: (id: string) => void;
  now: number;
}

const sectionTitle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  margin: '0 0 6px',
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
    <dt style={{ color: 'var(--text-muted)', minWidth: 110, flexShrink: 0 }}>{label}</dt>
    <dd style={{ margin: 0, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{children ?? '—'}</dd>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--border-subtle)' }}>
    <h3 style={sectionTitle}>{title}</h3>
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</dl>
  </section>
);

/** Basket lines as the customer chose them, with the price they saw (per unit, incl. GST). */
const BasketItems: React.FC<{ items: IntakeItemDto[] }> = ({ items }) => {
  const total = items.reduce((sum, i) => sum + (i.price ? i.price.total * i.quantity : 0), 0);
  const unpriced = items.some((i) => !i.price);
  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={cell}>Item</th>
            <th style={cell}>AC</th>
            <th style={{ ...cell, textAlign: 'right' }}>Qty</th>
            <th style={{ ...cell, textAlign: 'right' }}>Price shown</th>
            <th style={cell}>Line</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td style={cell}>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {ITEM_TYPE_LABELS[i.type] ?? i.type}
                  {i.seller ? ` · Sold by ${i.seller.name}` : ''}
                </div>
                {i.notes && <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{i.notes}</div>}
              </td>
              <td style={cell}>
                {[i.ac.type, i.ac.brand, i.ac.tonnage ? `${i.ac.tonnage} ton` : null].filter(Boolean).join(' · ') || '—'}
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>{i.quantity}</td>
              <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {i.price ? formatCurrency(i.price.total) : 'After inspection'}
              </td>
              <td style={cell}>{LINE_STATUS_LABELS[i.status] ?? i.status}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...cell, fontWeight: 600 }} colSpan={3}>
              Estimated total{unpriced ? ' (priced lines only)' : ''}
            </td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(total)}</td>
            <td style={cell} />
          </tr>
        </tfoot>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
        On approval, service and AMC lines become one service request; AC lines go to the seller for a quote.
      </p>
    </div>
  );
};

const orDash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));

const RequestedPrice: React.FC<{ intake: IntakeDto; catalog: PublicCatalog | null; catalogError: boolean }> = ({
  intake,
  catalog,
  catalogError,
}) => {
  if (catalogError) return <span style={{ color: 'var(--text-muted)' }}>Price unavailable (catalog did not load)</span>;
  if (!catalog) return <Skeleton width="120px" height="14px" />;

  if (intake.request.amcPlanCode) {
    const plan = findAmcPlan(catalog, intake.request.amcPlanCode);
    if (!plan) return <span style={{ color: 'var(--text-muted)' }}>Plan not in current catalog</span>;
    const rate = pickAmcRate(plan, intake.ac);
    if (!rate) return <span style={{ color: 'var(--text-muted)' }}>No public rate for this AC</span>;
    const units = intake.ac.units && intake.ac.units > 1 ? intake.ac.units : 1;
    return (
      <span>
        <strong>{formatCurrency(rate.price.total)}</strong> per AC / year incl. GST ({rate.label})
        {units > 1 && <> · {units} ACs ≈ <strong>{formatCurrency(rate.price.total * units)}</strong></>}
      </span>
    );
  }

  const service = findCatalogService(catalog, intake.request.serviceCode);
  if (!service) return <span style={{ color: 'var(--text-muted)' }}>{intake.request.serviceCode ? 'Service not in current catalog' : '—'}</span>;
  if (service.pricingModel === 'QUOTE_AFTER_DIAGNOSIS' || !service.price) {
    return <span>Quote after diagnosis</span>;
  }
  const total = formatPrice(service.price);
  return (
    <span>
      {service.pricingModel === 'FROM' ? 'From ' : ''}
      <strong>{total}</strong> incl. GST
      <span style={{ color: 'var(--text-muted)' }}>
        {' '}({formatCurrency(service.price.base)} + {formatCurrency(service.price.gst)} GST)
      </span>
    </span>
  );
};

const CustomerChoice: React.FC<{
  intake: IntakeDto;
  candidates: IntakeCandidate[];
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}> = ({ intake, candidates, isLoading, value, onChange, disabled }) => {
  const options: { id: string; label: string; sub: string }[] = [];
  const seen = new Set<string>();
  if (intake.matchedCustomer) {
    options.push({
      id: intake.matchedCustomer.id,
      label: `${intake.matchedCustomer.name} (${intake.matchedCustomer.customerCode})`,
      sub: `Matched by phone · ${intake.matchedCustomer.customerType}`,
    });
    seen.add(intake.matchedCustomer.id);
  }
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    options.push({ id: c.id, label: `${c.name} (${c.customerCode})`, sub: `${c.phone} · ${c.customerType}` });
  }

  const hasMatch = options.length > 0;

  return (
    <div
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${hasMatch ? 'var(--color-success)' : 'var(--border-default)'}`,
        background: 'var(--bg-surface-subtle)',
        margin: 'var(--space-3) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 6 }}>
        {hasMatch ? <UserCheck size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
        {hasMatch ? 'Existing customer found' : 'No existing customer matches this phone'}
      </div>
      <fieldset disabled={disabled} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <legend className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Customer for this request
        </legend>
        {options.map((opt) => (
          <label key={opt.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
            <input
              type="radio"
              name="intake-customer"
              value={opt.id}
              checked={value === opt.id}
              onChange={() => onChange(opt.id)}
              style={{ marginTop: 3 }}
            />
            <span>
              Use {opt.label}
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{opt.sub}</span>
            </span>
          </label>
        ))}
        {isLoading && <Skeleton width="50%" height="12px" />}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="intake-customer"
            value={NEW_CUSTOMER}
            checked={value === NEW_CUSTOMER}
            onChange={() => onChange(NEW_CUSTOMER)}
          />
          <span>Create a new temporary customer from this request</span>
        </label>
      </fieldset>
    </div>
  );
};

export const IntakeDetail: React.FC<IntakeDetailProps> = ({
  intake,
  detail,
  isDetailLoading,
  catalog,
  catalogError,
  customerChoice,
  onCustomerChoiceChange,
  onApprove,
  onReject,
  onOpenServiceRequest,
  now,
}) => {
  if (!intake) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Select a request on the left to see its details.
      </div>
    );
  }

  const data: IntakeDto = detail && detail.id === intake.id ? detail : intake;
  const candidates = detail && detail.id === intake.id ? detail.candidates : [];
  const isPending = data.status === 'PENDING_REVIEW';
  const addressLine = [data.address.line, data.address.landmark, data.address.area, data.address.city, data.address.pincode]
    .filter(Boolean)
    .join(', ');
  const present = (v: unknown) => v !== null && v !== undefined && v !== '';
  // Units alone (defaults to 1) is not AC information.
  const hasAc =
    [data.ac.type, data.ac.brand, data.ac.tonnage, data.ac.ageYears, data.ac.inverter].some(present);
  const hasRequest = [
    data.request.serviceCode,
    data.request.amcPlanCode,
    data.request.serviceName,
    data.request.preferredDate,
  ].some(present);

  return (
    <article aria-labelledby="intake-detail-heading" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 id="intake-detail-heading" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>
            {data.contact.name || 'Unnamed'}
          </h2>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace' }}>{data.intakeNumber}</span>
            <span aria-hidden="true">·</span>
            <span>{KIND_LABELS[data.kind] ?? data.kind}</span>
            <span aria-hidden="true">·</span>
            <span>{data.sourceChannel}</span>
            <span aria-hidden="true">·</span>
            <span>Received {formatDateTime(data.createdAt)}</span>
            {isPending && <span>(waiting for {formatWaitingFor(data.createdAt, now)})</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant={STATUS_BADGE[data.status] ?? 'neutral'}>{STATUS_LABELS[data.status] ?? data.status}</Badge>
          {typeof data.spamScore === 'number' && data.spamScore >= 50 && <Badge variant="error">Spam score {data.spamScore}</Badge>}
        </div>
      </header>

      {isPending && (
        <CustomerChoice
          intake={data}
          candidates={candidates}
          isLoading={isDetailLoading}
          value={customerChoice}
          onChange={onCustomerChoiceChange}
          disabled={false}
        />
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8, margin: '0 0 var(--space-3)', flexWrap: 'wrap' }}>
          <Button variant="primary" leftIcon={<CheckCircle2 size={16} />} onClick={onApprove} aria-keyshortcuts="A">
            Approve
          </Button>
          <Button variant="outline" leftIcon={<XCircle size={16} />} onClick={onReject} aria-keyshortcuts="R">
            Reject
          </Button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
            Shortcuts: J / K move · A approve · R reject
          </span>
        </div>
      )}

      {data.serviceRequest && (
        <div
          role="note"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-success)',
            margin: 'var(--space-3) 0',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span>
            Service request <strong style={{ fontFamily: 'monospace' }}>{data.serviceRequest.requestNumber}</strong> was created from this request.
          </span>
          <Button variant="secondary" size="sm" rightIcon={<ExternalLink size={14} />} onClick={() => onOpenServiceRequest(data.serviceRequest!.id)}>
            Open {data.serviceRequest.requestNumber}
          </Button>
        </div>
      )}

      {data.review.rejectionReason && (
        <div role="note" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger, #ef4444)', margin: 'var(--space-3) 0', fontSize: 'var(--text-sm)' }}>
          <strong>Reason:</strong> {data.review.rejectionReason}
        </div>
      )}

      <Section title="Contact">
        <Field label="Name">{orDash(data.contact.name)}</Field>
        <Field label="Phone">
          {data.contact.phone ? (
            <a href={`tel:${data.contact.phone}`} style={{ color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Phone size={12} aria-hidden="true" /> {data.contact.phone}
            </a>
          ) : '—'}
        </Field>
        <Field label="Email">
          {data.contact.email ? (
            <a href={`mailto:${data.contact.email}`} style={{ color: 'var(--color-brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Mail size={12} aria-hidden="true" /> {data.contact.email}
            </a>
          ) : '—'}
        </Field>
        {!hasRequest && data.trackingCode && (
          <Field label="Tracking code">
            <span style={{ fontFamily: 'monospace' }}>{data.trackingCode}</span>
          </Field>
        )}
      </Section>

      {(data.items?.length ?? 0) > 0 && (
        <section style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--border-subtle)' }}>
          <h3 style={sectionTitle}>Basket ({data.items!.length})</h3>
          <BasketItems items={data.items!} />
        </section>
      )}

      {/* Sections a request type does not use (e.g. a contact message has no AC) stay hidden. */}
      {addressLine && (
        <Section title="Address">
          <Field label="Address">{addressLine}</Field>
        </Section>
      )}

      {hasAc && (
      <Section title="Air conditioner">
        <Field label="Type">{orDash(data.ac.type)}</Field>
        <Field label="Brand">{orDash(data.ac.brand)}</Field>
        <Field label="Tonnage">{data.ac.tonnage ? `${data.ac.tonnage} ton` : '—'}</Field>
        <Field label="Inverter">{data.ac.inverter === null || data.ac.inverter === undefined ? '—' : data.ac.inverter ? 'Yes' : 'No'}</Field>
        <Field label="Age">{data.ac.ageYears !== null && data.ac.ageYears !== undefined ? `${data.ac.ageYears} years` : '—'}</Field>
        <Field label="Units">{orDash(data.ac.units)}</Field>
      </Section>
      )}

      {hasRequest && (
      <Section title="Requested">
        <Field label={data.request.amcPlanCode ? 'AMC plan' : 'Service'}>
          {data.request.serviceName || findAmcPlan(catalog, data.request.amcPlanCode)?.name || data.request.serviceCode || data.request.amcPlanCode || '—'}
        </Field>
        <Field label="Price">
          {data.request.serviceCode || data.request.amcPlanCode ? <RequestedPrice intake={data} catalog={catalog} catalogError={catalogError} /> : '—'}
        </Field>
        <Field label="Preferred">
          {data.request.preferredDate
            ? `${data.request.preferredDate}${data.request.preferredSlot ? ` · ${SLOT_LABELS[data.request.preferredSlot] ?? data.request.preferredSlot}` : ''}`
            : '—'}
        </Field>
        <Field label="Tracking code">
          <span style={{ fontFamily: 'monospace' }}>{orDash(data.trackingCode)}</span>
        </Field>
      </Section>
      )}

      <Section title="Message">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', color: data.request.message ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {data.request.message || 'No message.'}
        </p>
      </Section>

      <Section title="Consent">
        <Field label="Privacy policy">{data.consent.privacy ? 'Accepted' : 'Not given'}</Field>
        <Field label="Marketing">{data.consent.marketing ? 'Opted in' : 'Not opted in'}</Field>
      </Section>
    </article>
  );
};
