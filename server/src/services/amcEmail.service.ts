import { env } from '../config/env.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { logActivity } from './audit.service.js';

interface QuotationEmailDelivery {
  id: string;
  amc_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  text_body: string;
}

interface TransportResult {
  success: boolean;
  transport: string;
  providerMessageId?: string;
  error?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] as string);
}

function formatAmcQuotationEmail(
  contract: Record<string, any>,
  customerName: string,
  assets: Array<Record<string, any>>
) {
  const assetRows = assets.map(
    (a) => `${a.assetTag || a.asset_tag || 'AC Unit'} — ${a.brand || ''} ${a.modelNumber || a.model_number || ''} (Serial: ${a.serialNumber || a.serial_number || 'N/A'})`
  );

  const amountStr = Number(contract.totalAmount || contract.total_amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const upiPayLink = `upi://pay?pa=placeyourservice@icici&pn=Place%20Your%20Service&am=${Number(contract.totalAmount || contract.total_amount || 0).toFixed(2)}&cu=INR&tn=AMC%20Quotation%20${contract.contractNumber || contract.contract_number}`;

  const textLines = [
    `Annual Maintenance Contract (AMC) Quotation - ${contract.contractNumber || contract.contract_number}`,
    `Dear ${customerName},`,
    `Thank you for choosing Place Your Service. Here is the official AMC quotation for your air conditioning systems:`,
    `Term: ${contract.startDate || contract.start_date} to ${contract.endDate || contract.end_date} (${contract.frequency})`,
    `Total Scheduled Visits: ${contract.totalVisits || contract.total_visits} (Dry: ${contract.dryServiceVisits || contract.dry_service_visits || 0}, Jet: ${contract.jetServiceVisits || contract.jet_service_visits || 0}, Pumpdown: ${contract.pumpdownServiceVisits || contract.pumpdown_service_visits || 0})`,
    `Total Quotation Amount: INR ${amountStr}`,
    assetRows.length ? `Covered Units:\n${assetRows.map((x) => `• ${x}`).join('\n')}` : '',
    `Payment Details:`,
    `Bank: HDFC Bank | A/C: 50200098765432 | IFSC: HDFC0001234`,
    `Payee: Place Your Service Pvt Ltd | UPI ID: placeyourservice@icici`,
    `UPI Payment Link: ${upiPayLink}`,
    `Thank you,\nPlace Your Service Support Team`,
  ].filter(Boolean).join('\n\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AMC Quotation ${escapeHtml(contract.contractNumber || contract.contract_number)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
    <div style="border-bottom:2px solid #0284c7;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:22px;color:#0284c7;">Place Your Service</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b;">HVAC Preventive Maintenance & Asset Care</p>
    </div>

    <h2 style="font-size:18px;color:#0f172a;margin-top:0;">AMC Contract Quotation: ${escapeHtml(contract.contractNumber || contract.contract_number)}</h2>
    <p>Dear <strong>${escapeHtml(customerName)}</strong>,</p>
    <p>Thank you for your interest in our comprehensive AMC protection plans. Below are the commercial quotation and service cadence details for your property:</p>

    <div style="background:#f1f5f9;border-radius:6px;padding:16px;margin:16px 0;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;color:#64748b;">Contract Term:</td>
          <td style="padding:4px 0;font-weight:600;text-align:right;">${escapeHtml(contract.startDate || contract.start_date)} to ${escapeHtml(contract.endDate || contract.end_date)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Cadence & Visits:</td>
          <td style="padding:4px 0;font-weight:600;text-align:right;">${escapeHtml(contract.frequency)} (${escapeHtml(contract.totalVisits || contract.total_visits)} total visits)</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Service Allocation:</td>
          <td style="padding:4px 0;font-weight:600;text-align:right;">${escapeHtml(contract.dryServiceVisits || contract.dry_service_visits || 0)} Dry, ${escapeHtml(contract.jetServiceVisits || contract.jet_service_visits || 0)} Jet, ${escapeHtml(contract.pumpdownServiceVisits || contract.pumpdown_service_visits || 0)} Pumpdown</td>
        </tr>
        <tr style="border-top:1px solid #cbd5e1;">
          <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#0f172a;">Total Quotation Amount:</td>
          <td style="padding:8px 0 0;font-size:16px;font-weight:700;color:#0284c7;text-align:right;">₹${amountStr}</td>
        </tr>
      </table>
    </div>

    ${assetRows.length ? `
      <h3 style="font-size:14px;color:#334155;margin:20px 0 8px;">Covered AC Equipment (${assets.length} Units)</h3>
      <ul style="font-size:13px;color:#475569;padding-left:20px;margin:0 0 20px;">
        ${assets.map((a) => `<li><strong>${escapeHtml(a.assetTag || a.asset_tag || 'Unit')}</strong>: ${escapeHtml(a.brand || '')} ${escapeHtml(a.modelNumber || a.model_number || '')}</li>`).join('')}
      </ul>
    ` : ''}

    <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:16px;margin:20px 0;">
      <h3 style="margin:0 0 8px;font-size:14px;color:#0284c7;">Payment Clearance Options</h3>
      <p style="font-size:12px;color:#475569;margin:0 0 8px;">
        <strong>Bank Transfer (NEFT/IMPS):</strong><br>
        Payee: Place Your Service Pvt Ltd<br>
        Bank: HDFC Bank | A/C No: 50200098765432<br>
        IFSC: HDFC0001234 | Branch: Kandivali West, Mumbai
      </p>
      <p style="font-size:12px;color:#475569;margin:0 0 12px;">
        <strong>UPI Payment:</strong><br>
        UPI ID: <span style="color:#0284c7;font-weight:600;">placeyourservice@icici</span>
      </p>
      <div style="text-align:center;">
        <a href="${upiPayLink}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 20px;border-radius:6px;">Pay ₹${amountStr} via UPI</a>
      </div>
    </div>

    <p style="font-size:13px;color:#64748b;margin-top:24px;">Upon payment clearance, your AMC agreement will be activated and your preventive maintenance visits will be scheduled.</p>
    <p style="font-size:13px;color:#334155;margin:20px 0 0;">Thank you,<br><strong>Place Your Service Desk</strong></p>
  </div>
</body>
</html>`;

  return {
    subject: `AMC Quotation ${contract.contractNumber || contract.contract_number} | Place Your Service`,
    html,
    text: textLines,
  };
}

export class AmcEmailService {
  /**
   * Dispatches the AMC quotation email to the customer
   */
  async sendQuotation(
    contractId: string,
    recipientEmail: string,
    actorId: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const supabase = getSupabaseClient();

    // 1. Fetch contract with customer details
    const { data: contract, error: contractErr } = await supabase
      .from('amc_contracts')
      .select('*, customers(name, email, phone)')
      .eq('id', contractId)
      .maybeSingle();

    if (contractErr || !contract) {
      throw new NotFoundError('AMC contract was not found.');
    }

    // 2. Fetch covered assets
    const { data: assetLinks } = await supabase
      .from('amc_assets')
      .select('asset_id, ac_assets(asset_tag, brand, model_number, serial_number)')
      .eq('amc_id', contractId);

    const assets = (assetLinks || []).map((link: any) => ({
      assetTag: link.ac_assets?.asset_tag,
      brand: link.ac_assets?.brand,
      modelNumber: link.ac_assets?.model_number,
      serialNumber: link.ac_assets?.serial_number,
    }));

    const customerName = contract.customers?.name || 'Valued Customer';
    const emailData = formatAmcQuotationEmail(contract, customerName, assets);

    let providerMessageId: string | undefined;
    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | null = null;

    // Send using Resend if configured, else log in development
    if (env.RESEND_API_KEY) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL || 'Place Your Service <support@placeyourservice.internal>',
            to: recipientEmail,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
          }),
        });

        const resData = (await response.json()) as any;
        if (!response.ok) {
          throw new Error(resData?.message || `Resend returned HTTP ${response.status}`);
        }
        providerMessageId = resData?.id;
      } catch (err: any) {
        logger.error('Failed to dispatch AMC quotation email via Resend', { error: err.message, contractId });
        status = 'FAILED';
        errorMessage = err.message;
      }
    } else {
      providerMessageId = `dev-amc-${Date.now()}`;
      logger.info('Development transport recorded AMC quotation email dispatch', {
        contractId,
        recipientEmail,
        subject: emailData.subject,
      });
    }

    // Record delivery audit
    await supabase.from('amc_quotation_email_deliveries').insert({
      amc_id: contractId,
      recipient_email: recipientEmail,
      subject: emailData.subject,
      provider_message_id: providerMessageId || null,
      status,
      error_message: errorMessage,
      sent_by: actorId,
    });

    await logActivity({
      actorProfileId: actorId,
      action: 'AMC_QUOTATION_EMAIL_SENT',
      entityType: 'amc_contract',
      entityId: contractId,
      details: {
        recipientEmail,
        status,
        providerMessageId: providerMessageId || null,
        subject: emailData.subject,
      },
    });

    if (status === 'FAILED') {
      throw new BadRequestError(`Failed to send quotation email: ${errorMessage}`);
    }

    return { success: true, messageId: providerMessageId };
  }
}

export const amcEmailService = new AmcEmailService();
