import {
  ServiceReportAssetResponse,
  ServiceReportItemResponse,
  ServiceVisitOutcome,
  ServiceVisitReportResponse,
} from '../../types/index.js';
import { normalizeTechnology } from '../../utils/technology.js';

/**
 * Helper to resolve customer ownership for an AC asset.
 * In the database schema, ac_assets belong to customer_sites, which in turn belong to customers.
 * Handles:
 * 1. Joined `customer_sites` object { id, customer_id }
 * 2. Joined `customer_sites` single-element array [{ id, customer_id }]
 * 3. Direct `customer_id` (present on legacy fixtures / mock test objects)
 * 4. Fallback lookup map (when customer_sites join wasn't hydrated by caller or mock)
 */
export function resolveAssetCustomerId(
  asset: any,
  fallbackSiteCustomerMap: Record<string, string> = {},
): string | null {
  if (asset.customer_sites) {
    if (typeof asset.customer_sites === 'object' && !Array.isArray(asset.customer_sites) && asset.customer_sites.customer_id) {
      return asset.customer_sites.customer_id;
    }
    if (Array.isArray(asset.customer_sites) && asset.customer_sites.length > 0 && asset.customer_sites[0]?.customer_id) {
      return asset.customer_sites[0].customer_id;
    }
  }
  if (asset.customer_id) {
    return asset.customer_id;
  }
  if (asset.site_id && fallbackSiteCustomerMap[asset.site_id]) {
    return fallbackSiteCustomerMap[asset.site_id];
  }
  return null;
}

export function normalizeDbPaymentMethod(method?: string | null): 'CASH' | 'ONLINE' | null {
  if (!method) return null;
  const upper = String(method).trim().toUpperCase();
  if (upper === 'CASH') return 'CASH';
  if (['ONLINE', 'UPI', 'CHEQUE', 'NEFT', 'IMPS', 'RTGS', 'BANK_TRANSFER'].includes(upper)) {
    return 'ONLINE';
  }
  return null;
}

export function mapServiceReportAssetRow(a: any): ServiceReportAssetResponse {
  const live = a.ac_assets || {};
  const tech = a.technology || live.technology;
  return {
    id: a.id,
    reportId: a.report_id,
    assetId: a.asset_id,
    assetTag: a.asset_tag || live.asset_tag || null,
    brand: a.brand || live.brand || null,
    modelNumber: a.model_number || live.model_number || null,
    indoorSerialNumber: a.indoor_serial_number || live.indoor_serial_number || null,
    outdoorSerialNumber: a.outdoor_serial_number || live.outdoor_serial_number || null,
    serialNumber: a.serial_number || live.serial_number || null,
    acType: a.ac_type || live.ac_type || null,
    technology: tech ? normalizeTechnology(tech) : null,
    capacityTons: a.capacity_tons != null ? Number(a.capacity_tons) : live.capacity_tons != null ? Number(live.capacity_tons) : null,
    starRating: a.star_rating || live.star_rating || null,
    refrigerantType: a.refrigerant_type || live.refrigerant_type || null,
    floorLocation: a.floor_location || live.floor_location || null,
    roomLocation: a.room_location || live.room_location || null,
    faultReported: a.fault_reported,
    diagnosisFindings: a.diagnosis_findings,
    workPerformed: a.work_performed,
    assetOutcome: a.asset_outcome as ServiceVisitOutcome,
    finalCondition: a.final_condition,
    refrigerantAdded: a.refrigerant_added,
    refrigerantQtyKg: a.refrigerant_qty_kg ? Number(a.refrigerant_qty_kg) : null,
    notes: a.notes,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export function mapServiceReportItemRow(i: any): ServiceReportItemResponse {
  return {
    id: i.id,
    reportId: i.report_id,
    assetId: i.asset_id,
    assetTag: i.ac_assets?.asset_tag || null,
    itemType: i.item_type,
    itemName: i.item_name,
    partNumber: i.part_number,
    quantity: i.quantity,
    reason: i.reason,
    diagnosis: i.diagnosis,
    workCompleted: i.work_completed,
    recommendedAction: i.recommended_action,
    isApprovalRequired: i.is_approval_required,
    isSpecialistRequired: i.is_specialist_required,
    isRevisitRequired: i.is_revisit_required,
    acCondition: i.ac_condition,
    followUpNotes: i.follow_up_notes,
    isResolved: i.is_resolved,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

export function mapServiceReportDetailResponse(
  row: any,
  meta: {
    originatingReportNumber: string | null;
    resolvingReportNumber: string | null;
    followUpScheduleId: string | null;
    followUpScheduleNumber: string | null;
    assets: ServiceReportAssetResponse[];
    items: ServiceReportItemResponse[];
  },
): ServiceVisitReportResponse {
  return {
    id: row.id,
    reportNumber: row.report_number,
    visitType: row.visit_type,
    scheduleId: row.service_schedule_id,
    scheduleNumber: (row.service_schedules as any)?.schedule_number || null,
    serviceRequestId: row.service_request_id,
    serviceRequestNumber: (row.service_requests as any)?.request_number || null,
    amcId: row.amc_id,
    amcContractNumber: (row.amc_contracts as any)?.contract_number || null,
    pmObligationId: row.pm_obligation_id,
    customerId: row.customer_id,
    customerName: (row.customers as any)?.name || null,
    customerCode: (row.customers as any)?.customer_code || null,
    customerPhone: (row.customers as any)?.phone || null,
    customerEmail: (row.customers as any)?.email || null,
    siteId: row.site_id,
    siteName: (row.customer_sites as any)?.site_name || null,
    siteAddress: (row.customer_sites as any)?.address || null,
    technicianId: row.technician_id,
    technicianName: (row.technicians as any)?.name || null,
    technicianCode: (row.technicians as any)?.technician_code || null,
    technicianPhone: null,
    assistantName: row.assistant_name || null,
    serviceDate: row.service_date,
    startTime: row.start_time,
    endTime: row.end_time,
    primaryOutcome: row.primary_outcome as ServiceVisitOutcome,
    plannedServiceType: row.planned_service_type || null,
    performedServiceType: row.performed_service_type || null,
    serviceTypeDeviationReason: row.service_type_deviation_reason || null,
    originatingReportId: row.originating_report_id || null,
    originatingReportNumber: meta.originatingReportNumber,
    resolvingReportId: row.resolving_report_id || null,
    resolvingReportNumber: meta.resolvingReportNumber,
    resolvedAt: row.resolved_at || null,
    resolutionStatus: row.resolution_status || 'OPEN',
    workDescription: row.work_description,
    technicianRemarks: row.technician_remarks,
    customerRepresentative: row.customer_representative,
    customerAcknowledgement: row.customer_acknowledgement,
    customerSignatureUrl: row.customer_signature_url,
    beforePhotoUrl: row.before_photo_url || null,
    afterPhotoUrl: row.after_photo_url || null,
    paymentCollected: row.payment_collected ?? false,
    paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : 0,
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    paymentNotes: row.payment_notes || null,
    paymentId: row.payment_id || null,
    status: row.status,
    followUpScheduleId: meta.followUpScheduleId,
    followUpScheduleNumber: meta.followUpScheduleNumber,
    assets: meta.assets,
    items: meta.items,
    createdBy: row.created_by,
    createdByName: (row.profiles as any)?.full_name || null,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

