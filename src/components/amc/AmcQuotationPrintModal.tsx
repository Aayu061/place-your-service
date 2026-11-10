import React, { useState } from 'react';
import { Printer, Mail, Send, X, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { LEGAL_DISCLAIMERS } from '@/config/legalTerms';
import { apiClient } from '@/services/api/client';
import { useToast } from '@/components/ui/useToast';

export interface AmcContractForPrint {
  id: string;
  contractNumber: string;
  customerName?: string | null;
  customerCode?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  planName?: string | null;
  startDate: string;
  endDate: string;
  frequency: string;
  totalVisits: number;
  dryServiceVisits?: number | null;
  jetServiceVisits?: number | null;
  pumpdownServiceVisits?: number | null;
  totalAmount: number;
  paymentBalanceDue?: number | null;
  status: string;
  notes?: string | null;
  coveredAssets?: Array<{
    assetTag?: string | null;
    brand?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
    capacityTonnage?: string | null;
    locationRoom?: string | null;
  }>;
}

interface AmcQuotationPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: AmcContractForPrint;
  onEmailSent?: () => void;
}

export function AmcQuotationPrintModal({
  isOpen,
  onClose,
  contract,
  onEmailSent,
}: AmcQuotationPrintModalProps) {
  const { showToast } = useToast();
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(contract.customerEmail || '');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const totalAmount = Number(contract.totalAmount || 0);
  const baseAmount = totalAmount / 1.18;
  const gstAmount = totalAmount - baseAmount;
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
      await apiClient.post(`/amc-contracts/${contract.id}/send-quotation`, {
        recipientEmail: recipientEmail.trim(),
      });
      showToast({
        type: 'success',
        title: 'Quotation Dispatched',
        message: `Official AMC quotation proposal sent to ${recipientEmail.trim()}`,
      });
      setShowEmailDialog(false);
      onEmailSent?.();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Email Delivery Failed',
        message: err instanceof Error ? err.message : 'Could not send AMC quotation email.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="860px">
      <div className="quotation-print-container" style={{ padding: '8px 4px', color: '#1e293b' }}>
        {/* Actions bar - hidden during print */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={22} style={{ color: 'var(--color-brand)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Annual Maintenance Contract Proposal</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Extreme Sales &amp; Services · Place Your Service Platform</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant="secondary" leftIcon={<Printer size={15} />} onClick={handlePrint}>
              Print Quotation
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
                  label="Client Recipient Email *"
                  type="email"
                  placeholder="e.g. client@example.com"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" isLoading={isSendingEmail} leftIcon={<Send size={14} />}>
                Send Quotation
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowEmailDialog(false)}>
                Cancel
              </Button>
            </form>
          </div>
        )}

        {/* Printable Quotation Sheet */}
        <div className="quotation-printable-sheet" style={{ background: '#ffffff', color: '#0f172a', padding: '24px', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {/* Header */}
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
                AMC QUOTATION
              </div>
              <div style={{ marginTop: 8, fontSize: '12px', color: '#475569' }}>
                GSTIN: <strong style={{ color: '#0f172a', fontSize: '13px' }}>{COMPANY_BANK_DETAILS.gstin}</strong>
              </div>
              <div style={{ marginTop: 4, fontSize: '12px', color: '#64748b' }}>
                Quote #: <strong style={{ color: '#0f172a' }}>{contract.contractNumber}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Status: <strong style={{ color: contract.status === 'ACTIVE' ? '#16a34a' : '#0284c7' }}>{contract.status}</strong>
              </div>
            </div>
          </div>

          {/* Client Details & Term Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Prepared For / Client
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                {(contract as any).customerCompanyName || (contract as any).companyName ? (
                  <>
                    <div style={{ fontWeight: 800, color: '#0369a1' }}>{(contract as any).customerCompanyName || (contract as any).companyName}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Attn: {contract.customerName}</div>
                  </>
                ) : (
                  contract.customerName || 'Valued Customer'
                )}
              </div>
              {((contract as any).customerGstNumber || (contract as any).gstNumber) && (
                <div style={{ fontSize: '11.5px', color: '#0f172a', marginTop: 3, fontWeight: 700 }}>
                  Client GSTIN: <span style={{ color: '#0284c7', fontFamily: 'monospace' }}>{(contract as any).customerGstNumber || (contract as any).gstNumber}</span>
                </div>
              )}
              {contract.customerCode && (
                <div style={{ fontSize: '12px', color: '#475569', marginTop: 2 }}>
                  Customer Code: <strong>{contract.customerCode}</strong>
                </div>
              )}
              {contract.customerPhone && (
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Phone: <strong>{contract.customerPhone}</strong>
                </div>
              )}
              {contract.customerEmail && (
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Email: {contract.customerEmail}
                </div>
              )}
              {contract.customerAddress && (
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: 3 }}>
                  Site Address: {contract.customerAddress}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Contract Term &amp; Service Cadence
              </div>
              <div style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: 1.5 }}>
                <div>Contract Term: <strong>{contract.startDate} to {contract.endDate}</strong></div>
                <div>Frequency: <strong>{contract.frequency}</strong></div>
                <div>Total Preventive Visits: <strong>{contract.totalVisits} visits</strong></div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: 2 }}>
                  Visit Allocation: {contract.dryServiceVisits ?? 0} Dry Filter Servicing, {contract.jetServiceVisits ?? 0} Pressure Jet Coil Servicing, {contract.pumpdownServiceVisits ?? 0} Seasonal Deep Pumpdown
                </div>
                <div style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 600, marginTop: 3 }}>
                  ✓ Unlimited breakdown breakdown calls within 4-hour SLA included
                </div>
              </div>
            </div>
          </div>

          {/* Covered Equipment List */}
          {contract.coveredAssets && contract.coveredAssets.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Covered Equipment &amp; Air Conditioning Systems ({contract.coveredAssets.length} Units)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 4 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '6px 10px' }}>Asset Tag</th>
                    <th style={{ padding: '6px 10px' }}>Brand / Model</th>
                    <th style={{ padding: '6px 10px' }}>Serial Number</th>
                    <th style={{ padding: '6px 10px' }}>Capacity / Location</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.coveredAssets.map((asset, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0284c7' }}>{asset.assetTag || `AC Unit #${idx + 1}`}</td>
                      <td style={{ padding: '6px 10px' }}>{asset.brand || ''} {asset.modelNumber || ''}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#64748b' }}>{asset.serialNumber || 'N/A'}</td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {[asset.capacityTonnage, asset.locationRoom].filter(Boolean).join(' · ') || 'Site Installed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pricing & Commercial Terms */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', color: '#475569' }}>Scope of Comprehensive AMC Coverage</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'center' }}>SAC</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Taxable Base</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>CGST (9%)</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>SGST (9%)</th>
                <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px' }}>
                  <strong>Annual Maintenance Contract ({contract.planName || 'Comprehensive AC Care'})</strong>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                    Includes {contract.totalVisits} scheduled preventive maintenance services, indoor blower wash, condenser pressure wash, electrical safety audit, capacitor/sensor checks, and priority emergency breakdown resolution.
                  </div>
                </td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#64748b' }}>998719</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>₹{baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #cbd5e1' }}>
                <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>Total Quotation Proposal Value:</td>
                <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: '15px', color: '#0284c7' }}>
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Banking Particulars & Stamp + Sign Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, borderTop: '2px solid #e2e8f0', paddingTop: 16, alignItems: 'flex-start' }}>
            {/* Left: Bank Details */}
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Bank Particulars for Quotation Acceptance / Remittance:
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
                  <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 600 }}>
                    Contract Total: <span style={{ color: '#0284c7' }}>₹{totalAmount.toFixed(2)}</span>
                  </div>
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
                  ✓ DIGITALLY VERIFIED PROPOSAL
                </div>
              </div>
            </div>
          </div>

          {/* Bottom disclaimer */}
          <div style={{ marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 8, textAlign: 'center', fontSize: '10px', color: '#64748b', lineHeight: 1.45 }}>
            <div>{LEGAL_DISCLAIMERS.quotationFooter}</div>
            <div style={{ marginTop: 3, color: '#94a3b8' }}>
              Extreme Sales &amp; Services · Operating on Place Your Service Platform · For questions or approvals, call +91 {COMPANY_BANK_DETAILS.phone} / +91 {COMPANY_BANK_DETAILS.altPhone} or email {COMPANY_BANK_DETAILS.email}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
