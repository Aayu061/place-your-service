import React, { useState } from 'react';
import { Printer, Mail, Send, FileText, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { LEGAL_DISCLAIMERS } from '@/config/legalTerms';
import { operationsApi, PaymentRecord, PaymentTransactionRecord } from '@/services/operationsApi';
import { useToast } from '@/components/ui/useToast';

interface PaymentInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentRecord;
  transactions?: PaymentTransactionRecord[];
  onPaymentUpdated?: () => void;
}

export function PaymentInvoiceModal({
  isOpen,
  onClose,
  payment,
  transactions = [],
  onPaymentUpdated,
}: PaymentInvoiceModalProps) {
  const { showToast } = useToast();
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(
    payment.customers?.email || ''
  );
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const totalDue = Number(payment.total_amount_due || 0);
  const totalPaid = Number(payment.total_amount_paid || 0);
  const balanceDue = payment.status === 'PAID' ? 0 : Math.max(0, totalDue - totalPaid);

  // 18% GST estimate
  const baseAmount = totalDue / 1.18;
  const gstAmount = totalDue - baseAmount;
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim()) {
      showToast({ type: 'error', title: 'Email required', message: 'Please enter a valid recipient email address.' });
      return;
    }
    setIsSendingEmail(true);
    try {
      await operationsApi.sendPaymentInvoice(payment.id, { recipientEmail: recipientEmail.trim() });
      showToast({
        type: 'success',
        title: 'Invoice Dispatched',
        message: `Official invoice & receipt sent to ${recipientEmail.trim()}`,
      });
      setShowEmailDialog(false);
      onPaymentUpdated?.();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Email Delivery Failed',
        message: err instanceof Error ? err.message : 'Could not send invoice email.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const service = payment.service_requests;
  const amc = payment.amc_contracts;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="840px">
      <div className="invoice-print-container" style={{ padding: '8px 4px', color: '#1e293b' }}>
        {/* Actions bar - hidden during print */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} style={{ color: 'var(--color-brand)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Tax Invoice &amp; Payment Receipt</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Extreme Sales &amp; Services · Place Your Service Platform</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="secondary" leftIcon={<Printer size={15} />} onClick={handlePrint}>
              Print Invoice
            </Button>
            <Button size="sm" variant="primary" leftIcon={<Mail size={15} />} onClick={() => setShowEmailDialog((v) => !v)}>
              Email Customer
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close modal">
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Inline Email Dispatch Box */}
        {showEmailDialog && (
          <div className="no-print" style={{ background: 'var(--bg-surface-subtle)', padding: 14, borderRadius: 8, border: '1px solid var(--border-default)', marginBottom: 20 }}>
            <form onSubmit={handleSendEmail} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <Input
                  label="Recipient Email Address *"
                  type="email"
                  placeholder="e.g. customer@example.com"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" isLoading={isSendingEmail} leftIcon={<Send size={14} />}>
                Send Invoice
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowEmailDialog(false)}>
                Cancel
              </Button>
            </form>
          </div>
        )}

        {/* Printable Invoice Sheet */}
        <div className="invoice-printable-sheet" style={{ background: '#ffffff', color: '#0f172a', padding: '24px', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Company Official Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0284c7', paddingBottom: 16, marginBottom: 18, gap: 16 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <img
                src={COMPANY_BANK_DETAILS.extremeLogoUrl}
                alt={COMPANY_BANK_DETAILS.mainCompanyName}
                style={{ width: 62, height: 62, objectFit: 'contain', marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  {COMPANY_BANK_DETAILS.mainCompanyName}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: '3px' }}>
                  <img
                    src={COMPANY_BANK_DETAILS.pysLogoUrl}
                    alt="Place Your Service"
                    style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0284c7' }}>
                    Air Conditioning Sales &amp; Services · {COMPANY_BANK_DETAILS.platformBrand} Platform
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#64748b', lineHeight: 1.45, maxWidth: 440 }}>
                  <strong>Office:</strong> {COMPANY_BANK_DETAILS.officeAddress}<br />
                  <strong>Billing:</strong> {COMPANY_BANK_DETAILS.billingAddress}<br />
                  <strong>Tel:</strong> +91 {COMPANY_BANK_DETAILS.phone} / +91 {COMPANY_BANK_DETAILS.altPhone} | <strong>Email:</strong> {COMPANY_BANK_DETAILS.email}
                </p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-block', padding: '4px 12px', background: '#0284c7', color: '#ffffff', fontWeight: 800, fontSize: '13px', borderRadius: 4, letterSpacing: '0.04em' }}>
                TAX INVOICE
              </div>
              <div style={{ marginTop: 8, fontSize: '12px', color: '#475569' }}>
                GSTIN: <strong style={{ color: '#0f172a', fontSize: '13px' }}>{COMPANY_BANK_DETAILS.gstin}</strong>
              </div>
              <div style={{ marginTop: 4, fontSize: '12px', color: '#64748b' }}>
                Invoice #: <strong style={{ color: '#0f172a' }}>{payment.payment_number}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Date: <strong>{new Date(payment.created_at).toLocaleDateString('en-IN')}</strong>
              </div>
            </div>
          </div>

          {/* Customer & Service Info 2-column Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Billed To / Customer Details
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                {payment.customers?.company_name ? (
                  <>
                    <div style={{ fontWeight: 800, color: '#0369a1' }}>{payment.customers.company_name}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Attn: {payment.customers.name}</div>
                  </>
                ) : (
                  payment.customers?.name || 'Customer'
                )}
              </div>
              {payment.customers?.gst_number && (
                <div style={{ fontSize: '11.5px', color: '#0f172a', marginTop: 3, fontWeight: 700 }}>
                  Recipient GSTIN: <span style={{ color: '#0284c7', fontFamily: 'monospace' }}>{payment.customers.gst_number}</span>
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#475569', marginTop: 2 }}>
                Customer Code: <strong>{payment.customers?.customer_code || 'N/A'}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Phone: <strong>{payment.customers?.phone || 'N/A'}</strong>
              </div>
              {payment.customers?.email && (
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Email: {payment.customers.email}
                </div>
              )}
              {payment.customers?.address && (
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: 3 }}>
                  {[payment.customers.address, payment.customers.city, payment.customers.state, payment.customers.postal_code].filter(Boolean).join(', ')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Linked Service Information
              </div>
              {service ? (
                <div style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: 1.45 }}>
                  <div>Service Request: <strong style={{ color: '#0284c7' }}>{service.request_number}</strong></div>
                  <div>Type: <strong>{service.request_type || 'AC Repair & Service'}</strong> ({service.status})</div>
                  {service.description && (
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: 2 }}>
                      {service.description}
                    </div>
                  )}
                  {service.reported_date && (
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: 2 }}>
                      Reported: {new Date(service.reported_date).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </div>
              ) : amc ? (
                <div style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: 1.45 }}>
                  <div>AMC Contract: <strong style={{ color: '#0284c7' }}>{amc.contract_number}</strong></div>
                  <div>Plan: <strong>{amc.plan_name || 'Annual Maintenance Contract'}</strong></div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                    Term: {amc.start_date} to {amc.end_date}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12.5px', color: '#475569' }}>
                  General Air Conditioning Service, HVAC Parts &amp; Maintenance
                </div>
              )}
            </div>
          </div>

          {/* Line Items & GST Calculation Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', color: '#475569' }}>Description of Service / Goods</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'center' }}>HSN / SAC</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Taxable Amt</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>CGST (9%)</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>SGST (9%)</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px' }}>
                  <strong>
                    {service ? `HVAC Service & Technical Labor (${service.request_number})` : amc ? `Annual Maintenance Contract (${amc.contract_number})` : 'Air Conditioning Maintenance & Replacement Parts'}
                  </strong>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                    Comprehensive air conditioning diagnostics, refrigerant check, coil wash, electrical testing and preventive maintenance.
                  </div>
                </td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#64748b' }}>998719</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>₹{baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>₹{totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Total Invoiced Amount (Gross):</td>
                <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                  ₹{totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>Total Amount Paid / Settled:</td>
                <td colSpan={2} style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                  ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: balanceDue > 0 ? '#b45309' : '#16a34a' }}>
                  {balanceDue > 0 ? 'Outstanding Balance Due:' : 'Settlement Status:'}
                </td>
                <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: '15px', color: balanceDue > 0 ? '#b91c1c' : '#16a34a' }}>
                  {balanceDue > 0 ? `₹${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'PAID IN FULL'}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Payment Transactions Ledger if any */}
          {transactions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Recorded Payments / Receipts History
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 4 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '6px 8px' }}>Date</th>
                    <th style={{ padding: '6px 8px' }}>Method</th>
                    <th style={{ padding: '6px 8px' }}>Reference / UTR</th>
                    <th style={{ padding: '6px 8px' }}>Notes</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px' }}>{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{t.payment_method}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#0284c7' }}>{t.external_payment_reference || t.transaction_reference}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{t.notes || '-'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: t.entry_type === 'REVERSAL' ? '#dc2626' : '#16a34a' }}>
                        {t.entry_type === 'REVERSAL' ? '-' : ''}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Banking Particulars & Rubber Stamp + Sign Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, borderTop: '2px solid #e2e8f0', paddingTop: 16, alignItems: 'flex-start' }}>
            {/* Left: Bank Details */}
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Bank Particulars for Remittance:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '3px 8px', color: '#334155' }}>
                <span style={{ color: '#64748b' }}>Bank Name:</span>
                <strong>{COMPANY_BANK_DETAILS.bankName}</strong>
                <span style={{ color: '#64748b' }}>A/C Payee:</span>
                <strong>{COMPANY_BANK_DETAILS.accountHolderName}</strong>
                <span style={{ color: '#64748b' }}>Current A/C:</span>
                <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>{COMPANY_BANK_DETAILS.accountNumber}</strong>
                <span style={{ color: '#64748b' }}>IFSC Code:</span>
                <strong style={{ fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.ifscCode}</strong>
                <span style={{ color: '#64748b' }}>UPI VPA:</span>
                <strong style={{ color: '#0284c7', fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.upiId}</strong>
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={COMPANY_BANK_DETAILS.fixedQrImageUrl}
                  alt="Official Extreme Sales & Services UPI QR Standee"
                  style={{ width: 76, height: 106, objectFit: 'contain', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', padding: 2, flexShrink: 0 }}
                />
                <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>Official UPI QR Code</div>
                  <div>UPI ID: <strong style={{ color: '#0284c7', fontFamily: 'monospace' }}>{COMPANY_BANK_DETAILS.upiId}</strong></div>
                  <div>Accepted: GPay, PhonePe, Paytm, BHIM</div>
                  {balanceDue > 0 && (
                    <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 600 }}>
                      Remaining Balance: <span style={{ color: '#0284c7' }}>₹{balanceDue.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Stamp & Signature */}
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: 140, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={COMPANY_BANK_DETAILS.stampImageUrl}
                  alt="Extreme Sales & Services Stamp & Signature"
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                  {COMPANY_BANK_DETAILS.mainCompanyName}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>
                  Authorized Signatory &amp; Stamp
                </div>
                <div style={{ fontSize: '9.5px', color: '#16a34a', fontWeight: 700, letterSpacing: '0.04em', marginTop: 1 }}>
                  ✓ DIGITALLY VERIFIED DOCUMENT
                </div>
              </div>
            </div>
          </div>

          {/* Bottom disclaimer */}
          <div style={{ marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 8, textAlign: 'center', fontSize: '10px', color: '#64748b', lineHeight: 1.45 }}>
            <div>{LEGAL_DISCLAIMERS.invoiceFooter}</div>
            <div style={{ marginTop: 3, color: '#94a3b8' }}>
              For service inquiries, billing verification, or DPDP rights requests, call +91 {COMPANY_BANK_DETAILS.phone} / +91 {COMPANY_BANK_DETAILS.altPhone} or email {COMPANY_BANK_DETAILS.email}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
