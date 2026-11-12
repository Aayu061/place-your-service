export function escapeEmailHtml(val: unknown): string {
  return String(val ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

export function wrapBrandedEmailLayout(opts: {
  title: string;
  badgeText?: string;
  badgeColor?: string;
  badgeBg?: string;
  bodyHtml: string;
}): string {
  const badgeHtml = opts.badgeText
    ? `<span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11.5px;font-weight:700;letter-spacing:0.04em;background:${opts.badgeBg || '#e0f2fe'};color:${opts.badgeColor || '#0369a1'};">${escapeEmailHtml(opts.badgeText)}</span>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeEmailHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
    <div style="border-bottom:2px solid #0284c7;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <h1 style="margin:0;font-size:22px;color:#0f172a;letter-spacing:-0.02em;">Extreme Sales &amp; Services</h1>
        <p style="margin:2px 0 0;font-size:12px;color:#0284c7;font-weight:600;">Air Conditioning Sales, Preventive Maintenance &amp; Services · Place Your Service Platform</p>
        <p style="margin:4px 0 0;font-size:11.5px;color:#64748b;line-height:1.45;">
          Office: 1/1, Samrat Ashok Nagar, Chembur, Mumbai - 400043<br>
          Billing: 204 Kokan Residency, 2nd floor, Vikas Wadi, Nr J P Bar, Devad, New Panvel - 410206<br>
          Tel: +91 7977805245 / 9969423500 | Email: extremess0121@gmail.com | <strong>GSTIN: 27ANTPP9778J1ZO</strong>
        </p>
      </div>
      ${badgeHtml}
    </div>
    ${opts.bodyHtml}
    <div style="margin-top:24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
      Extreme Sales &amp; Services · Operating on Place Your Service Platform (PYS)<br>
      For questions or replies, write to extremess0121@gmail.com or call +91 7977805245
    </div>
  </div>
</body>
</html>`;
}

export interface PaymentInvoiceEmailInput {
  paymentNumber: string;
  status: string;
  createdAt: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  customerName: string;
  customerCode: string;
  customerPhone: string;
  customerAddress: string;
  serviceInfo: string;
  isReceiptOnly?: boolean;
  transactions: Array<{
    created_at: string;
    payment_method: string;
    amount: number;
    external_payment_reference?: string | null;
    notes?: string | null;
  }>;
}

export function buildPaymentInvoiceTemplate(input: PaymentInvoiceEmailInput) {
  const {
    paymentNumber,
    status,
    createdAt,
    totalDue,
    totalPaid,
    balance,
    customerName,
    customerCode,
    customerPhone,
    customerAddress,
    serviceInfo,
    transactions,
  } = input;
  const isSettled = balance <= 0 || status === 'COMPLETED';
  const docTitle = input.isReceiptOnly || isSettled ? 'Payment Receipt & Settled Tax Invoice' : 'Tax Invoice & Payment Receipt';
  const upiPayLink = `upi://pay?pa=7977805245-1@okbizaxis&pn=Extreme%20Sales%20and%20Services&am=${balance.toFixed(2)}&cu=INR&tn=Invoice%20${encodeURIComponent(paymentNumber)}`;
  const subject = `${isSettled ? 'Payment Receipt (Paid)' : 'Tax Invoice'} — ${paymentNumber} | Extreme Sales & Services`;

  const txLines = transactions.map(
    (t) =>
      `• ${new Date(t.created_at).toLocaleDateString('en-IN')}: ₹${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} via ${t.payment_method}${t.external_payment_reference ? ` (Ref: ${t.external_payment_reference})` : ''}`
  );

  const text = [
    `${docTitle} — ${paymentNumber}`,
    `Extreme Sales & Services (Place Your Service Platform)`,
    `Office: 1/1, Samrat Ashok Nagar, Chembur, Mumbai - 400043`,
    `Billing: 204 Kokan Residency, 2nd floor, Vikas Wadi, Nr J P Bar, Devad, New Panvel - 410206`,
    `Tel: +91 7977805245 / 9969423500 | Email: extremess0121@gmail.com | GSTIN: 27ANTPP9778J1ZO`,
    `---`,
    `Billed To: ${customerName} (${customerCode})`,
    `Phone: ${customerPhone}`,
    `Address: ${customerAddress}`,
    `---`,
    `Service Information: ${serviceInfo}`,
    `---`,
    `Total Invoice Amount: INR ${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Includes 18% GST)`,
    `Total Amount Paid:    INR ${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Outstanding Balance:  INR ${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Payment Status:       ${status}`,
    txLines.length ? `\nPayment Transactions Recorded:\n${txLines.join('\n')}` : '',
    `---`,
    `Bank: State Bank of India | Current A/C: 41846055894 | IFSC: SBIN0071073 | UPI: 7977805245-1@okbizaxis`,
    balance > 0 ? `Instant UPI Pay Link: ${upiPayLink}` : 'Invoice fully settled. Thank you!',
  ]
    .filter(Boolean)
    .join('\n\n');

  const bodyHtml = `
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
      <div>
        <h2 style="font-size:18px;color:#0f172a;margin:0;">${escapeEmailHtml(docTitle)}</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Invoice #: <strong>${escapeEmailHtml(paymentNumber)}</strong></p>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Date: ${new Date(createdAt).toLocaleDateString('en-IN')}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:20px;">
      <div>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Customer / Billed To</p>
        <p style="margin:0;font-size:13.5px;font-weight:600;color:#0f172a;">${escapeEmailHtml(customerName)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#475569;">Code: ${escapeEmailHtml(customerCode)} | Phone: ${escapeEmailHtml(customerPhone)}</p>
        <p style="margin:4px 0 0;font-size:11.5px;color:#64748b;">${escapeEmailHtml(customerAddress)}</p>
      </div>
      <div>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Service Details</p>
        <p style="margin:0;font-size:12.5px;color:#334155;line-height:1.45;">${escapeEmailHtml(serviceInfo)}</p>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;text-align:left;">
          <th style="padding:10px 12px;color:#334155;">Description</th>
          <th style="padding:10px 12px;color:#334155;text-align:right;">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 12px;">Total Invoice Amount (Incl. 18% GST)</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;">₹${totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;color:#15803d;">
          <td style="padding:10px 12px;">Total Amount Paid</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;">₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:12px;font-weight:700;font-size:14px;color:#0f172a;">Outstanding Balance Due</td>
          <td style="padding:12px;text-align:right;font-weight:700;font-size:14px;color:${balance > 0 ? '#dc2626' : '#15803d'};">₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>

    ${
      transactions.length > 0
        ? `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;">Payment Transaction History</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;color:#64748b;">
              <th style="padding:6px 8px;">Date</th>
              <th style="padding:6px 8px;">Method</th>
              <th style="padding:6px 8px;">Reference</th>
              <th style="padding:6px 8px;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .map(
                (t) => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:6px 8px;">${new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                <td style="padding:6px 8px;">${escapeEmailHtml(t.payment_method)}</td>
                <td style="padding:6px 8px;color:#64748b;">${escapeEmailHtml(t.external_payment_reference || t.notes || '-')}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:600;">INR ${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
        : ''
    }

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0f172a;">Bank &amp; Payment Settlement Details</p>
      <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">
        Bank: <strong>State Bank of India</strong> | Current A/C No: <strong>41846055894</strong> | IFSC: <strong>SBIN0071073</strong><br>
        Payee: <strong>Extreme Sales And Services</strong> | UPI ID: <strong>7977805245-1@okbizaxis</strong>
      </p>
      ${
        balance > 0
          ? `<div style="margin-top:10px;"><a href="${upiPayLink}" style="display:inline-block;padding:8px 14px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:600;">Pay Balance ₹${balance.toFixed(2)} via UPI</a></div>`
          : ''
      }
    </div>`;

  const html = wrapBrandedEmailLayout({
    title: subject,
    badgeText: status,
    badgeBg: status === 'COMPLETED' ? '#dcfce7' : status === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
    badgeColor: status === 'COMPLETED' ? '#15803d' : status === 'PARTIAL' ? '#b45309' : '#b91c1c',
    bodyHtml,
  });

  return { subject, html, text };
}

export function buildAmcExpiryReminderTemplate(input: {
  contractNumber: string;
  customerName: string;
  endDate: string;
  daysRemaining: number;
  planName?: string | null;
  totalAmount?: number | null;
}) {
  const urgencyLabel = input.daysRemaining <= 7 ? 'FINAL RENEWAL NOTICE' : 'RENEWAL REMINDER';
  const subject = `[${input.daysRemaining}d Left] AMC Renewal Reminder — ${input.contractNumber} | Extreme Sales & Services`;
  const text = [
    `${urgencyLabel}: AMC Contract ${input.contractNumber}`,
    `Dear ${input.customerName},`,
    `Your Annual Maintenance Contract (${input.contractNumber}${input.planName ? ` — ${input.planName}` : ''}) expires on ${input.endDate} (${input.daysRemaining} days remaining).`,
    input.totalAmount ? `Current Contract Value: INR ${Number(input.totalAmount).toLocaleString('en-IN')}` : '',
    `Reply to this email or call +91 7977805245 / 9969423500 to renew without service interruption.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const bodyHtml = `
    <h2 style="font-size:18px;margin:0 0 8px;color:#0f172a;">AMC Contract Renewal Reminder</h2>
    <p style="font-size:13.5px;color:#334155;line-height:1.5;">Dear <strong>${escapeEmailHtml(input.customerName)}</strong>,</p>
    <p style="font-size:13.5px;color:#334155;line-height:1.5;">
      Your Annual Maintenance Contract <strong>${escapeEmailHtml(input.contractNumber)}</strong>
      ${input.planName ? `(${escapeEmailHtml(input.planName)})` : ''} is scheduled to expire on
      <strong>${escapeEmailHtml(input.endDate)}</strong> (<strong>${input.daysRemaining} day(s)</strong> remaining).
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:14px;margin:16px 0;font-size:13px;color:#92400e;">
      Renew before <strong>${escapeEmailHtml(input.endDate)}</strong> to maintain uninterrupted preventive maintenance coverage and priority breakdown support.
    </div>
    <p style="font-size:13px;color:#475569;">Reply directly to this email or contact us at +91 7977805245 for an updated renewal quotation.</p>`;

  const html = wrapBrandedEmailLayout({
    title: subject,
    badgeText: urgencyLabel,
    badgeBg: input.daysRemaining <= 7 ? '#fee2e2' : '#fef3c7',
    badgeColor: input.daysRemaining <= 7 ? '#b91c1c' : '#b45309',
    bodyHtml,
  });

  return { subject, html, text };
}

export function buildDispatchConfirmationTemplate(input: {
  scheduleNumber: string;
  customerName: string;
  scheduledDate: string;
  technicianName: string;
  serviceType: string;
  siteName?: string | null;
}) {
  const subject = `Technician Dispatched (${input.scheduleNumber}) — Scheduled ${input.scheduledDate} | Extreme Sales & Services`;
  const text = [
    `Technician Dispatch Confirmation — ${input.scheduleNumber}`,
    `Dear ${input.customerName},`,
    `Our technician ${input.technicianName} has been assigned/dispatched for your ${input.serviceType} visit on ${input.scheduledDate}${input.siteName ? ` at ${input.siteName}` : ''}.`,
    `For coordination, call +91 7977805245.`,
  ].join('\n\n');

  const bodyHtml = `
    <h2 style="font-size:18px;margin:0 0 8px;color:#0f172a;">Technician Dispatch Confirmation</h2>
    <p style="font-size:13.5px;color:#334155;line-height:1.5;">Dear <strong>${escapeEmailHtml(input.customerName)}</strong>,</p>
    <p style="font-size:13.5px;color:#334155;line-height:1.5;">
      Technician <strong>${escapeEmailHtml(input.technicianName)}</strong> is scheduled/en-route for your
      <strong>${escapeEmailHtml(input.serviceType)}</strong> visit (Schedule <strong>${escapeEmailHtml(input.scheduleNumber)}</strong>) on
      <strong>${escapeEmailHtml(input.scheduledDate)}</strong>${input.siteName ? ` at <strong>${escapeEmailHtml(input.siteName)}</strong>` : ''}.
    </p>`;

  const html = wrapBrandedEmailLayout({
    title: subject,
    badgeText: 'DISPATCHED',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
    bodyHtml,
  });

  return { subject, html, text };
}

export function buildDiagnosticTestEmailTemplate(input: {
  recipientEmail: string;
  sentByEmail?: string | null;
  fromEmail: string;
  replyTo: string;
  sandboxMode: boolean;
}) {
  const subject = 'PYS Resend Email Diagnostic Test — Extreme Sales & Services';
  const text = [
    'This is a diagnostic test email from Place Your Service (PYS).',
    `From: ${input.fromEmail}`,
    `Reply-To: ${input.replyTo}`,
    `Sandbox Mode: ${input.sandboxMode ? 'Yes (@resend.dev)' : 'No (Verified Custom Domain)'}`,
    `Triggered By: ${input.sentByEmail || 'Admin User'}`,
  ].join('\n');

  const bodyHtml = `
    <h2 style="font-size:18px;margin:0 0 8px;color:#0f172a;">Resend Email Diagnostic Verification</h2>
    <p style="font-size:13.5px;color:#334155;">Your PYS backend successfully authenticated and dispatched this test email through Resend.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
      <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Sender</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;"><code>${escapeEmailHtml(input.fromEmail)}</code></td></tr>
      <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Reply-To</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;"><code>${escapeEmailHtml(input.replyTo)}</code></td></tr>
      <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;">Mode</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${input.sandboxMode ? 'Resend Sandbox (@resend.dev)' : 'Production Domain'}</td></tr>
      <tr><td style="padding:6px 8px;color:#64748b;">Recipient</td><td style="padding:6px 8px;">${escapeEmailHtml(input.recipientEmail)}</td></tr>
    </table>`;

  const html = wrapBrandedEmailLayout({
    title: subject,
    badgeText: 'TEST PASSED',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    bodyHtml,
  });

  return { subject, html, text };
}

