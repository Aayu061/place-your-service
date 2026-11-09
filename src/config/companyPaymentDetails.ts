/**
 * Company Payment Configuration
 * Centralized repository for company banking particulars and UPI payment links.
 *
 * NOTE: Replace these demo values with official company bank details and VPA
 * when available. Updating this configuration file automatically updates
 * all forms, print views, invoices, and quotation emails across the platform.
 */

export interface CompanyBankDetails {
  companyName: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  accountType: 'CURRENT' | 'SAVINGS';
  upiId: string;
  upiName: string;
}

export const COMPANY_BANK_DETAILS: CompanyBankDetails = {
  companyName: 'Place Your Service Private Limited',
  bankName: 'HDFC Bank',
  accountHolderName: 'Place Your Service Pvt Ltd',
  accountNumber: '50200098765432',
  ifscCode: 'HDFC0001234',
  branchName: 'Kandivali West, Mumbai',
  accountType: 'CURRENT',
  upiId: 'placeyourservice@icici',
  upiName: 'Place Your Service',
};

/**
 * Builds a standardized NPCI UPI Payment URI
 * e.g., upi://pay?pa=placeyourservice@icici&pn=Place%20Your%20Service&am=1500.00&cu=INR&tn=Invoice%20XYZ
 *
 * @param amount Exact payable amount in INR
 * @param transactionNote Transaction description / identifier
 */
export function buildUpiPaymentUri(amount?: number | null, transactionNote?: string): string {
  const params = new URLSearchParams();
  params.set('pa', COMPANY_BANK_DETAILS.upiId);
  params.set('pn', COMPANY_BANK_DETAILS.upiName);
  params.set('cu', 'INR');

  if (amount != null && Number(amount) > 0) {
    params.set('am', Number(amount).toFixed(2));
  }

  if (transactionNote) {
    // UPI notes should be concise and alphanumeric-friendly
    params.set('tn', transactionNote.slice(0, 50));
  }

  return `upi://pay?${params.toString()}`;
}

