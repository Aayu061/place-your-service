/**
 * Place Your Service & Extreme Sales & Services
 * Legal, Privacy, and Compliance Framework
 *
 * Compliant with:
 * - Digital Personal Data Protection Act, 2023 (DPDP Act, India)
 * - Information Technology Act, 2000 (Section 43A, 65B & SPDI Rules 2011)
 * - Goods and Services Tax Act (GST Records Retention)
 */

export interface LegalEntityInfo {
  name: string;
  role: 'DATA_FIDUCIARY' | 'DATA_PROCESSOR';
  description: string;
  addresses: string[];
  gstin?: string;
  email: string;
  phone: string;
}

export const LEGAL_ENTITIES: {
  commercial: LegalEntityInfo;
  platform: LegalEntityInfo;
} = {
  commercial: {
    name: 'Extreme Sales & Services',
    role: 'DATA_FIDUCIARY',
    description:
      'Sole commercial contractor, billing entity, service provider, and Data Fiduciary responsible for customer agreements, AMC warranties, tax invoices, and personal data management.',
    addresses: [
      '1/1, Samrat Ashok Nagar, Shell Colony Road, Chembur, Mumbai - 400071, Maharashtra, India',
      '204, Kokan Residency, Sector 12, Khanda Colony, New Panvel - 410206, Maharashtra, India',
    ],
    gstin: '27ANTPP9778J1ZO',
    email: 'extremess0121@gmail.com',
    phone: '+91 79778 05245 / 9969423500',
  },
  platform: {
    name: 'Place Your Service (PYS)',
    role: 'DATA_PROCESSOR',
    description:
      'Internal proprietary enterprise operating software platform, dispatch coordinator, and Data Processor that manages maintenance scheduling, diagnostic reporting, and inventory tracking.',
    addresses: ['Operating as internal cloud infrastructure for Extreme Sales & Services'],
    email: 'support@placeyourservice.com',
    phone: '+91 79778 05245',
  },
};

export const GRIEVANCE_OFFICER = {
  title: 'Grievance Redressal Officer',
  entity: 'Extreme Sales & Services',
  email: 'extremess0121@gmail.com',
  phone: '+91 79778 05245',
  resolutionTimeframe: '30 calendar days as mandated by DPDP Act 2023',
  address: '1/1, Samrat Ashok Nagar, Shell Colony Road, Chembur, Mumbai - 400071',
};

export interface LegalSection {
  id: string;
  title: string;
  summary: string;
  content: string[];
}

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    id: 'fiduciary-processor',
    title: '1. Identity of Data Fiduciary & Data Processor',
    summary: 'Clarification of legal responsibilities for data handling and commercial obligations.',
    content: [
      'Under the Digital Personal Data Protection Act, 2023 (DPDP Act, India), Extreme Sales & Services serves as the "Data Fiduciary" who determines the purpose and means of processing personal data.',
      'Place Your Service (PYS) operates as the "Data Processor" providing the secure cloud platform, diagnostic ticketing engine, and workflow tracking infrastructure.',
      'Neither entity sells, leases, rents, or commercializes customer or asset information to third-party advertisers or data brokers under any circumstances.',
    ],
  },
  {
    id: 'personal-data-collected',
    title: '2. Categories of Personal Data Collected',
    summary: 'Specific items of personal and operational data necessary for service fulfillment.',
    content: [
      'Customer Contact Identifiers: Full Name, Primary Mobile Number, Secondary Contact, and Email Address.',
      'Service Location Data: Complete physical site address, flat/unit numbers, landmarks, building society names, and PIN codes.',
      'Equipment & Asset Details: Air conditioner make, brand, model number, indoor/outdoor serial numbers, tonnage, refrigerant type, and installation history.',
      'Diagnostic & Service Records: Operational sensor logs, amperage and pressure readings, technician observations, spare parts consumed, and physical carbon booklet report references.',
      'Financial & Transaction Records: Invoiced amounts, AMC contract tier and duration, payment transaction modes (UPI, Cash, Cheque, Bank Transfer), reference numbers, and realization dates.',
    ],
  },
  {
    id: 'lawful-basis-purposes',
    title: '3. Lawful Basis and Purpose of Processing',
    summary: 'How and why your data is utilized strictly for service execution.',
    content: [
      'Contractual Performance: Processing is indispensable to fulfill AC maintenance service calls, emergency breakdown dispatch, spare replacement, and scheduled AMC preventive visits.',
      'Statutory & Tax Compliance: Issuing valid GST Tax Invoices under Section 31 of the CGST Act and maintaining accounts for statutory audits as required by Indian law.',
      'Operational Notifications: Delivering appointment confirmations, technician dispatch updates, digital service report summaries, and renewal reminders via SMS, WhatsApp, or Email.',
      'Preventive Health Monitoring: Tracking equipment age, gas recharge cadence, and coil washing history to ensure uninterrupted cooling performance and fire safety.',
    ],
  },
  {
    id: 'technician-privacy',
    title: '4. Technician & Field Staff Privacy Safeguards',
    summary: 'Protection of field staff personal information.',
    content: [
      'To safeguard technician welfare and prevent unauthorized out-of-band communication or harassment, technician personal mobile numbers and home addresses are never published in customer-facing portals, print reports, or public APIs.',
      'All customer communications with field personnel are routed through Extreme Sales & Services official dispatch channels (+91 79778 05245 / 9969423500).',
    ],
  },
  {
    id: 'data-retention-security',
    title: '5. Data Retention & Security Architecture',
    summary: 'Cryptographic protection and retention schedules.',
    content: [
      'Data is hosted in PostgreSQL on Supabase enterprise cloud infrastructure, fortified with AES-256 encryption-at-rest and TLS 1.3 encryption-in-transit.',
      'Database access is governed by strict Row Level Security (RLS) policies where public and anonymous access to business records is completely revoked.',
      'Financial ledgers, invoices, and completed service reports are retained for 6 years in accordance with Section 36 of the CGST Act 2017 and Section 44 of the Income Tax Act 1961.',
      'Inactive customer records without active warranty or AMC obligations may be archived or scrubbed upon verified Data Principal request.',
    ],
  },
  {
    id: 'principal-rights',
    title: '6. Rights of Data Principals & Grievance Redressal',
    summary: 'Your statutory rights under Section 11-14 of the DPDP Act 2023.',
    content: [
      'Right to Access: You have the right to obtain a summary of personal data processed by us and the identities of data processors involved.',
      'Right to Correction & Erasure: You may request correction of inaccurate or outdated contact/site information, or erasure of personal data that is no longer required for statutory or contractual purposes.',
      'Right of Grievance Redressal: If you have queries or concerns regarding personal data processing, you may contact our designated Grievance Officer at extremess0121@gmail.com.',
      'Right to Nominate: In the event of death or incapacity, you have the right to nominate another individual to exercise these rights on your behalf.',
    ],
  },
];

export const TERMS_OF_SERVICE_SECTIONS: LegalSection[] = [
  {
    id: 'service-engagement',
    title: '1. Service Engagement & Booking Scope',
    summary: 'Protocols governing technician dispatch and service agreements.',
    content: [
      'Extreme Sales & Services undertakes air conditioning repair, preventive maintenance, chemical washing, installation, dismantling, and Annual Maintenance Contracts (AMC).',
      'Place Your Service (PYS) coordinates technician assignments and schedules based on field availability, customer preferred windows, and emergency triage priorities.',
      'Bookings are confirmed electronically upon receipt of complete site details and contact information.',
    ],
  },
  {
    id: 'site-access-customer-obligations',
    title: '2. Customer Obligations & Site Safety',
    summary: 'Customer responsibilities to ensure safe technician execution.',
    content: [
      'Electrical Infrastructure: The customer must provide continuous, properly grounded 230V single-phase or 415V three-phase electrical power with adequate MCB protection.',
      'Physical Access: Safe and unobstructed physical access to both Indoor Units (IDU) and Outdoor Units (ODU) must be provided. For high-rise outdoor units mounted on external building walls, the customer or building society must permit safe ladder or scaffolding placement.',
      'Hazardous Site Conditions: Technicians reserve the right to halt work without penalty if extreme weather, unsecured external ledges, live exposed wiring, or unsafe structural hazards pose a threat to physical life and limb.',
    ],
  },
  {
    id: 'pricing-payment-terms',
    title: '3. Pricing, Invoicing & Payment Terms',
    summary: 'Commercial conditions, taxes, and accepted payment channels.',
    content: [
      'All commercial invoices and quotations are issued exclusively in the name of Extreme Sales & Services (GSTIN: 27ANTPP9778J1ZO).',
      'Diagnostic visit inspection charges are payable upon visit completion regardless of whether the customer chooses to proceed with recommended major repairs.',
      'Payments must be remitted via authorized channels: Official UPI QR (UPI ID: 7977805245-1@okbizaxis), crossed Account Payee cheque in favor of "Extreme Sales & Services", or cash with an instantaneous official electronic payment receipt.',
      'AMC contracts become effective only upon receipt of the agreed contract deposit or advance installment.',
    ],
  },
  {
    id: 'warranty-limitations',
    title: '4. Warranty, Spares & Limitation of Liability',
    summary: 'Workmanship guarantees, manufacturer pass-through warranties, and exclusions.',
    content: [
      'Spare Parts Warranty: Replacement compressors, fan motors, PCBs, copper coils, and capacitors carry warranty terms stipulated by their respective original equipment manufacturers (OEM).',
      'Workmanship Guarantee: Routine maintenance and gas leak repair workmanship is guaranteed for 30 days from the reported service date.',
      'Exclusions: Warranties do not cover damage resulting from external grid voltage fluctuations, lightning surges, corrosive coastal atmospheres, rodent or pest damage, or repairs attempted by unauthorized third-party technicians.',
    ],
  },
  {
    id: 'electronic-records',
    title: '5. Electronic Records & Legal Validity',
    summary: 'Statutory validity of computer-generated invoices and service reports.',
    content: [
      'Invoices, Quotations, and Service Visit Reports issued through Place Your Service are authenticated electronic records within the meaning of Section 2(t) and Section 65B of the Information Technology Act, 2000.',
      'These records are valid and enforceable without requiring physical handwritten ink signatures when authenticated by operator credentials and unique sequence numbers.',
    ],
  },
];

export const SECURITY_STANDARDS_SECTIONS: LegalSection[] = [
  {
    id: 'api-security',
    title: '1. API Architecture & Defensive Controls',
    summary: 'Technical defenses guarding API endpoints from unauthorized exploitation.',
    content: [
      'Rate Limiting: Dedicated authentication rate limiters (max 10 login attempts per 15 minutes per IP) thwart automated credential stuffing and brute-force attacks.',
      'Role-Based Authorization (RBAC): Every protected endpoint validates server-side user roles (ADMIN, MANAGER, STAFF, TECHNICIAN). Access to financial ledgers, technician management, and master catalogs is strictly partitioned.',
      'Security Headers: Full HTTP security suite powered by Helmet, enforcing strict X-Frame-Options (DENY), nosniff MIME typing, and strict transport security (HSTS).',
      'CORS Whitelist: Cross-Origin Resource Sharing is strictly constrained to authorized domain names, preventing unauthorized cross-site requests.',
    ],
  },
  {
    id: 'pii-sanitization',
    title: '2. PII Redaction & Diagnostic Sanitization',
    summary: 'Zero plaintext leakage of credentials and banking details in logs.',
    content: [
      'All backend server error handlers and access loggers pass through automated PII sanitization filters.',
      'Sensitive keys including passwords, JWT bearer tokens, credit card numbers, and bank account credentials are scrubbed before writing to logs or telemetry streams.',
      'Error stack traces are suppressed in production environments, returning structured, obfuscated error codes to clients.',
    ],
  },
];

export const COOKIE_STORAGE_SECTIONS: LegalSection[] = [
  {
    id: 'local-storage',
    title: '1. Local Storage Usage Disclosure',
    summary: 'Minimal local browser storage strictly required for system operation.',
    content: [
      'Place Your Service utilizes modern browser `localStorage` solely for keeping active authentication tokens (e.g., `pys_auth_token`) and UI preference states (e.g., dark/light theme).',
      'We do not employ third-party advertising cookies, behavioral tracking beacons, or cross-site tracking pixels.',
      'Logging out immediately purges the active authentication token from local browser storage.',
    ],
  },
];

export const LEGAL_DISCLAIMERS = {
  invoiceFooter:
    'This is a computer-generated Tax Invoice issued by Extreme Sales & Services under Section 65B of the IT Act, 2000 and Section 31 of the CGST Act, 2017. All customer records are securely processed via Place Your Service in full compliance with the Digital Personal Data Protection Act, 2023 (DPDP Act).',
  quotationFooter:
    'This commercial quotation is issued by Extreme Sales & Services. Valid for 30 days. Workmanship and warranty terms apply as per our standard Terms of Service and DPDP Act privacy protections.',
  serviceReportFooter:
    'Official Service Visit Record generated by Place Your Service for Extreme Sales & Services. Valid electronic record under Section 65B of the IT Act, 2000. Customer & technician data protected under DPDP Act, 2023.',
};

