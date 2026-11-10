/**
 * Server-side Breakdown Symptoms & Service Action Types
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

export type UnifiedServiceType =
  | 'DRY_SERVICE'
  | 'JET_SERVICE'
  | 'JACKET_SERVICE'
  | 'PUMPDOWN_SERVICE'
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

export function isBreakdownServiceType(type?: string | null): boolean {
  if (!type) return false;
  return [
    'DIAGNOSTIC_INSPECTION', 'GAS_RECHARGE', 'CAPACITOR_REPLACE',
    'PCB_REPAIR', 'MOTOR_REPAIR', 'COMPRESSOR_REPAIR',
    'WATER_LEAK_FIX', 'ELECTRICAL_FIX', 'COIL_BRAZING', 'GENERAL_REPAIR'
  ].includes(type);
}

