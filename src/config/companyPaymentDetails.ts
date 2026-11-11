/**
 * Company Payment Configuration
 * Centralized repository for company banking particulars and UPI payment links.
 *
 * NOTE: Configure official company bank details and VPA below. Updating this
 * configuration file automatically updates all forms, print views, invoices,
 * and quotation emails across the platform.
 */

export interface CompanyBankDetails {
  mainCompanyName: string;
  platformBrand: string;
  companyName: string;
  companySubtitle: string;
  officeAddress: string;
  billingAddress: string;
  phone: string;
  altPhone: string;
  email: string;
  gstin: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  accountType: 'CURRENT' | 'SAVINGS';
  upiId: string;
  upiName: string;
  stampImageUrl: string;
  logoImageUrl: string;
  extremeLogoUrl: string;
  pysLogoUrl: string;
  fixedQrImageUrl: string;
}

export const COMPANY_BANK_DETAILS: CompanyBankDetails = {
  mainCompanyName: 'Extreme Sales & Services',
  platformBrand: 'Place Your Service',
  companyName: 'Extreme Sales & Services',
  companySubtitle: 'HVAC Air Conditioning Sales, Installation & Maintenance',
  officeAddress: '1/1, Samrat Ashok Nagar, Chembur, Mumbai, Maharashtra 400043, India',
  billingAddress: '204 Kokan Residency, 2nd floor, Vikas Wadi, Nr J P Bar, Devad, New Panvel - 410206',
  phone: '7977805245',
  altPhone: '9969423500',
  email: 'extremess0121@gmail.com',
  gstin: '27ANTPP9778J1ZO',
  bankName: 'State Bank of India',
  accountHolderName: 'Extreme Sales And Services',
  accountNumber: '41846055894',
  ifscCode: 'SBIN0071073',
  branchName: 'Chembur / Panvel, Mumbai',
  accountType: 'CURRENT',
  upiId: '7977805245-1@okbizaxis',
  upiName: 'Extreme Sales and Services',
  extremeLogoUrl: '/extreme-logo.png',
  pysLogoUrl: '/pys-logo.png',
  stampImageUrl: '/company-stamp.png',
  logoImageUrl: '/extreme-logo.png',
  fixedQrImageUrl: '/company-qr.png',
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

