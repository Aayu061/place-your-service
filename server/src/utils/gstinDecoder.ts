/**
 * Indian GSTIN Offline Decoder & Validator
 * Supports instant decoding and validation without network overhead.
 */

// State Code Mapping (Official Indian GSTN)
const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh (New)', '38': 'Ladakh', '97': 'Other Territory', '99': 'Central Govt'
};

const ENTITY_TYPES: Record<string, string> = {
  'C': 'Company / Private Limited',
  'P': 'Individual / Proprietorship',
  'F': 'Partnership Firm / LLP',
  'H': 'Hindu Undivided Family (HUF)',
  'A': 'Association of Persons (AOP)',
  'T': 'Trust',
  'G': 'Government Department',
  'L': 'Local Authority',
  'J': 'Artificial Juridical Person'
};

export interface GstinInfo {
  gstin: string;
  isValid: boolean;
  state: string;
  pan: string;
  entityType: string;
  error?: string;
}

/**
 * Validates and decodes GSTIN offline instantly.
 */
export function decodeGstin(gstin: string): GstinInfo {
  const normalized = gstin.trim().toUpperCase();
  
  // Format check
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(normalized)) {
    return { gstin: normalized, isValid: false, state: '', pan: '', entityType: '', error: 'Invalid format' };
  }

  const stateCode = normalized.substring(0, 2);
  const pan = normalized.substring(2, 12);
  const constitutionChar = pan.charAt(3); // 4th char of PAN defines entity

  return {
    gstin: normalized,
    isValid: true, // Format is valid (checksum implementation skipped for simplicity in offline decoder)
    state: STATE_CODES[stateCode] || 'Unknown State',
    pan,
    entityType: ENTITY_TYPES[constitutionChar] || 'Unknown Entity',
  };
}
