/**
 * Breakdown Symptoms & Comprehensive Service Action Types
 *
 * Distinguishes Preventive Maintenance (AMC) from real Breakdown & Repair actions.
 */

export type BreakdownIssueCategory =
  | 'NO_COOLING'
  | 'WATER_LEAKAGE'
  | 'GAS_LEAKAGE'
  | 'ELECTRICAL_TRIPPING'
  | 'NOISE_VIBRATION'
  | 'PCB_FAILURE'
  | 'COMPRESSOR_ISSUE'
  | 'ODOR_SMELL'
  | 'OTHER_BREAKDOWN';

export const BREAKDOWN_CATEGORIES: Array<{ key: BreakdownIssueCategory; label: string; description: string }> = [
  { key: 'NO_COOLING', label: 'No Cooling / Weak Airflow', description: 'AC running but not providing adequate room cooling' },
  { key: 'WATER_LEAKAGE', label: 'Water Dripping / Drain Blocked', description: 'Indoor unit leaking water into room or clogged drain' },
  { key: 'GAS_LEAKAGE', label: 'Gas Leakage / Ice on Coil', description: 'Refrigerant pressure drop, hiss, or copper pipe freezing' },
  { key: 'ELECTRICAL_TRIPPING', label: 'MCB Tripping / Power Short', description: 'Circuit breaker trips instantly upon turning on AC' },
  { key: 'NOISE_VIBRATION', label: 'Abnormal Noise / Vibration', description: 'Blower fan rattling, motor bearing screech, or compressor rattle' },
  { key: 'PCB_FAILURE', label: 'PCB Error / Display Blinking', description: 'Fault error codes on display or indoor unit not responding' },
  { key: 'COMPRESSOR_ISSUE', label: 'Compressor Not Starting', description: 'Condenser fan spins but compressor fails to engage' },
  { key: 'ODOR_SMELL', label: 'Foul Smell / Burning Odor', description: 'Unpleasant mildew or burning electrical smell' },
  { key: 'OTHER_BREAKDOWN', label: 'Other Specific Malfunction', description: 'General mechanical or electrical fault' },
];

export type UnifiedServiceType =
  // Preventive Maintenance (AMC)
  | 'DRY_SERVICE'
  | 'JET_SERVICE'
  | 'JACKET_SERVICE'
  | 'PUMPDOWN_SERVICE'
  // Breakdown & Repair
  | 'DIAGNOSTIC_INSPECTION'
  | 'GAS_RECHARGE'
  | 'CAPACITOR_REPLACE'
  | 'PCB_REPAIR'
  | 'MOTOR_REPAIR'
  | 'COMPRESSOR_REPAIR'
  | 'WATER_LEAK_FIX'
  | 'ELECTRICAL_FIX'
  | 'COIL_BRAZING'
  | 'GENERAL_REPAIR';

export const PM_SERVICE_TYPES: Array<{ key: UnifiedServiceType; label: string; desc: string }> = [
  { key: 'DRY_SERVICE', label: 'Dry Service', desc: 'Routine filter clean & dry coil dust sweep' },
  { key: 'JET_SERVICE', label: 'Jet Service', desc: 'High-pressure wet wash & coil deep cleanse' },
  { key: 'JACKET_SERVICE', label: 'Jacket Deep Clean', desc: 'Full jacket containment chemical wash' },
  { key: 'PUMPDOWN_SERVICE', label: 'Pumpdown Service', desc: 'Refrigerant recovery & unit dismount/overhaul' },
];

export const BREAKDOWN_REPAIR_TYPES: Array<{ key: UnifiedServiceType; label: string; desc: string }> = [
  { key: 'DIAGNOSTIC_INSPECTION', label: 'Diagnostic Inspection', desc: 'Electrical testing & root-cause fault diagnosis' },
  { key: 'GAS_RECHARGE', label: 'Gas Leak Repair & Refill', desc: 'Leak detection, brazing & refrigerant recharging' },
  { key: 'CAPACITOR_REPLACE', label: 'Capacitor Replacement', desc: 'Replacement of failed compressor/fan run capacitor' },
  { key: 'PCB_REPAIR', label: 'PCB Board Repair / Replace', desc: 'Electronic control board repair, sensor or component fix' },
  { key: 'MOTOR_REPAIR', label: 'Fan / Blower Motor Repair', desc: 'Indoor blower or outdoor condenser motor rewind/replace' },
  { key: 'COMPRESSOR_REPAIR', label: 'Compressor Overhaul / Replace', desc: 'Compressor terminal, overload or full unit replacement' },
  { key: 'WATER_LEAK_FIX', label: 'Water Leakage & Drain Clear', desc: 'Drain tray clearing, flushing & gradient correction' },
  { key: 'ELECTRICAL_FIX', label: 'Electrical Wiring & Relay Fix', desc: 'Contactor, terminal block or wiring harness repair' },
  { key: 'COIL_BRAZING', label: 'Coil Leak Brazing', desc: 'Condenser or evaporator copper tube leak brazing' },
  { key: 'GENERAL_REPAIR', label: 'General Breakdown Repair', desc: 'Mechanical, mounting or general breakdown resolution' },
];

export function getServiceTypeCategory(type?: string | null): 'PM' | 'BREAKDOWN' | 'UNKNOWN' {
  if (!type) return 'UNKNOWN';
  if (['DRY_SERVICE', 'JET_SERVICE', 'JACKET_SERVICE', 'PUMPDOWN_SERVICE'].includes(type)) {
    return 'PM';
  }
  return 'BREAKDOWN';
}

export function getServiceTypeDisplayName(type?: string | null): string {
  if (!type) return 'Standard Service';
  const foundPm = PM_SERVICE_TYPES.find((s) => s.key === type);
  if (foundPm) return foundPm.label;
  const foundRepair = BREAKDOWN_REPAIR_TYPES.find((s) => s.key === type);
  if (foundRepair) return foundRepair.label;
  return type.replace(/_/g, ' ');
}

export function getBreakdownCategoryDisplayName(category?: string | null): string {
  if (!category) return 'General Breakdown';
  const found = BREAKDOWN_CATEGORIES.find((c) => c.key === category);
  return found ? found.label : category.replace(/_/g, ' ');
}

// Aliases for compatibility
export const getBreakdownCategoryLabel = getBreakdownCategoryDisplayName;
export const getPlannedServiceTypeLabel = getServiceTypeDisplayName;
