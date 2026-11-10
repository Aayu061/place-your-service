/**
 * Client-side GSTIN Decoder for instant UI validation.
 * Must match the server-side implementation.
 */

// Note: Ensure this file is kept in sync with server/src/utils/gstinDecoder.ts
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
  'C': 'Company',
  'P': 'Individual',
  'F': 'Firm',
  'H': 'HUF',
  'A': 'AOP',
  'T': 'Trust',
  'G': 'Government',
  'L': 'Local Authority',
  'J': 'Juridical'
};

export interface GstinInfo {
  gstin: string;
  isValid: boolean;
  state: string;
  entityType: string;
  error?: string;
}

export function decodeGstin(gstin: string): GstinInfo {
  const normalized = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  if (!gstinRegex.test(normalized)) {
    return { gstin: normalized, isValid: false, state: '', entityType: '', error: 'Invalid format' };
  }

  const stateCode = normalized.substring(0, 2);
  const constitutionChar = normalized.charAt(13); // In PAN it is 4th char (index 3), but in GSTIN constitution is 14th char (index 13)!
  
  // Correction: The 14th digit is the constitution type (default Z is 14th).
  // Actually, constitution is at index 13? Let me re-verify.
  // Wait, standard GSTIN: 2-char State, 10-char PAN, 1-char Entity No., 1-char Default 'Z', 1-char Checksum.
  // PAN 4th char is entity type.
  
  const constitutionCharFromPan = normalized.charAt(3); 
  
  return {
    gstin: normalized,
    isValid: true,
    state: STATE_CODES[stateCode] || 'Unknown',
    entityType: ENTITY_TYPES[constitutionCharFromPan] || 'Unknown',
  };
}

