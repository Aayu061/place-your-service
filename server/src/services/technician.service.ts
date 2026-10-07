import { getSupabaseClient } from '../lib/supabase.js';
import {
  TechnicianResponse,
  CreateTechnicianPayload,
  UpdateTechnicianPayload,
  UpdateTechnicianStatusPayload,
  TechnicianListQuery,
  TechnicianOperationalStatus,
  TechnicianAvailability,
  WeekDay,
} from '../types/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawTechnicianRecord {
  id: string;
  technician_code: string;
  name: string;
  phone: string;
  email: string | null;
  specializations: string[] | null;
  service_areas: string[] | null;
  status: TechnicianOperationalStatus;
  is_active: boolean;
  max_daily_workload: number;
  current_workload: number;
  joining_date: string | null;
  notes: string | null;
  working_days: WeekDay[] | null;
  working_hours: { start: string; end: string } | null;
  availability: TechnicianAvailability | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_WORKING_DAYS: WeekDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
};

/**
 * Generates a unique, collision-resistant technician code (e.g. TECH-0001).
 */
async function generateTechnicianCode(): Promise<string> {
  const supabase = getSupabaseClient();
  const { count } = await supabase
    .from('technicians')
    .select('id', { count: 'exact', head: true });

  const seq = (count || 0) + 1;
  const candidate = `TECH-${String(seq).padStart(4, '0')}`;

  const { data: existing } = await supabase
    .from('technicians')
    .select('id')
    .eq('technician_code', candidate)
    .maybeSingle();

  if (!existing) {
    return candidate;
  }

  // Fallback with random suffix if collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const code = `TECH-${randomNum}`;
    const { data } = await supabase
      .from('technicians')
      .select('id')
      .eq('technician_code', code)
      .maybeSingle();
    if (!data) {
      return code;
    }
  }

  return `TECH-${Date.now().toString().slice(-4)}`;
}

/**
 * Maps database record to domain response object.
 */
function mapTechnicianRecord(record: RawTechnicianRecord, activeAssignmentsCount = 0): TechnicianResponse {
  const specs = record.specializations || [];
  const areas = record.service_areas || [];
  const days = record.working_days || DEFAULT_WORKING_DAYS;
  const hours = record.working_hours || DEFAULT_WORKING_HOURS;
  const avail = record.availability || {
    workingDays: days,
    workingHours: hours,
  };

  return {
    id: record.id,
    technicianCode: record.technician_code,
    name: record.name,
    phone: record.phone,
    email: record.email || null,
    specializations: specs,
    skills: specs,
    serviceAreas: areas,
    serviceArea: areas[0] || '',
    status: record.status,
    isActive: record.is_active,
    maxDailyWorkload: record.max_daily_workload,
    currentWorkload: activeAssignmentsCount > 0 ? activeAssignmentsCount : (record.current_workload || 0),
    joiningDate: record.joining_date || null,
    notes: record.notes || null,
    workingDays: days,
    workingHours: hours,
    availability: avail,
    activeAssignmentsCount,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export class TechnicianService {
  /**
   * List technicians with server-side filtering, searching, and pagination.
   */
  public async listTechnicians(query: TechnicianListQuery = {}): Promise<{
    technicians: TechnicianResponse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const supabase = getSupabaseClient();
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    let dbQuery = supabase
      .from('technicians')
      .select('*', { count: 'exact' });

    // Status filter
    if (query.status && query.status !== 'ALL') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    // Active lifecycle filter
    if (query.isActive !== undefined && query.isActive !== 'ALL') {
      const activeBool = String(query.isActive) === 'true';
      dbQuery = dbQuery.eq('is_active', activeBool);
    }

    // Skill filter
    if (query.skill && query.skill.trim()) {
      dbQuery = dbQuery.contains('specializations', [query.skill.trim()]);
    }

    // Service Area filter
    if (query.serviceArea && query.serviceArea.trim()) {
      dbQuery = dbQuery.contains('service_areas', [query.serviceArea.trim()]);
    }

    // Search filter across code, name, phone, email
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      dbQuery = dbQuery.or(
        `technician_code.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    dbQuery = dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      logger.error('Failed to list technicians', { error: error.message, query });
      throw new BadRequestError(`Failed to fetch technicians: ${error.message}`);
    }

    const records = (data as RawTechnicianRecord[]) || [];
    const technicianIds = records.map((t) => t.id);

    // Fetch real active assignments counts if any technicians returned
    const assignmentCounts: Record<string, number> = {};
    if (technicianIds.length > 0) {
      const { data: assignments } = await supabase
        .from('service_assignments')
        .select('technician_id, status')
        .in('technician_id', technicianIds)
        .in('status', ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS']);

      if (assignments) {
        for (const a of assignments) {
          assignmentCounts[a.technician_id] = (assignmentCounts[a.technician_id] || 0) + 1;
        }
      }
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    const technicians = records.map((record) =>
      mapTechnicianRecord(record, assignmentCounts[record.id] || 0)
    );

    return {
      technicians,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Get single technician by UUID, including live workload computation.
   */
  public async getTechnicianById(id: string): Promise<TechnicianResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch technician by ID', { id, error: error.message });
      throw new BadRequestError(`Failed to fetch technician: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundError(`Technician with ID '${id}' not found`);
    }

    // Query active assignments for true derived workload
    const { count: activeCount } = await supabase
      .from('service_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', id)
      .in('status', ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS']);

    return mapTechnicianRecord(data as RawTechnicianRecord, activeCount || 0);
  }

  /**
   * Create a new technician record.
   */
  public async createTechnician(
    payload: CreateTechnicianPayload,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<TechnicianResponse> {
    const supabase = getSupabaseClient();
    const cleanPhone = payload.phone.trim();
    const cleanEmail = payload.email?.trim() || null;

    // 1. Duplicate check: Phone number uniqueness
    const { data: phoneMatch } = await supabase
      .from('technicians')
      .select('id, technician_code, name, phone')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (phoneMatch) {
      throw new ConflictError(
        `A technician with phone number '${cleanPhone}' already exists (${phoneMatch.technician_code} — ${phoneMatch.name}).`,
        { code: 'DUPLICATE_PHONE', existingTechnicianCode: phoneMatch.technician_code }
      );
    }

    // 2. Duplicate check: Email uniqueness if supplied
    if (cleanEmail) {
      const { data: emailMatch } = await supabase
        .from('technicians')
        .select('id, technician_code, name, email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (emailMatch) {
        throw new ConflictError(
          `A technician with email '${cleanEmail}' already exists (${emailMatch.technician_code} — ${emailMatch.name}).`,
          { code: 'DUPLICATE_EMAIL', existingTechnicianCode: emailMatch.technician_code }
        );
      }
    }

    // 3. Generate unique sequential technician code
    const technicianCode = await generateTechnicianCode();

    // 4. Normalize skills and service areas
    const specializations = Array.from(
      new Set(
        (payload.specializations || payload.skills || [])
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      )
    );

    const serviceAreas = Array.from(
      new Set(
        (payload.serviceAreas || [])
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
      )
    );

    // 5. Structure availability
    const workingDays = payload.availability?.workingDays || payload.workingDays || DEFAULT_WORKING_DAYS;
    const workingHours = payload.availability?.workingHours || payload.workingHours || DEFAULT_WORKING_HOURS;
    const availability: TechnicianAvailability = {
      workingDays,
      workingHours,
      notes: payload.availability?.notes || undefined,
    };

    const initialStatus = payload.status || 'AVAILABLE';
    const isActive = initialStatus !== 'INACTIVE';

    const insertData = {
      technician_code: technicianCode,
      name: payload.name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      specializations,
      service_areas: serviceAreas,
      status: initialStatus,
      is_active: isActive,
      max_daily_workload: payload.maxDailyWorkload || 5,
      current_workload: 0,
      joining_date: payload.joiningDate || null,
      notes: payload.notes?.trim() || null,
      working_days: workingDays,
      working_hours: workingHours,
      availability,
      created_by: actorProfileId || null,
      updated_by: actorProfileId || null,
    };

    const { data, error } = await supabase
      .from('technicians')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to create technician in DB', { error: error.message, payload });
      throw new BadRequestError(`Failed to create technician: ${error.message}`);
    }

    const createdRecord = data as RawTechnicianRecord;

    // 6. Audit logging
    await logActivity({
      actorProfileId,
      action: 'TECHNICIAN_CREATED',
      entityType: 'technician',
      entityId: createdRecord.id,
      details: {
        technicianCode: createdRecord.technician_code,
        name: createdRecord.name,
        phone: createdRecord.phone,
        status: createdRecord.status,
        specializations,
        serviceAreas,
      },
      ipAddress,
    });

    return mapTechnicianRecord(createdRecord, 0);
  }

  /**
   * Update technician profile information.
   */
  public async updateTechnician(
    id: string,
    payload: UpdateTechnicianPayload,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<TechnicianResponse> {
    const supabase = getSupabaseClient();

    // 1. Fetch existing technician
    const { data: existing, error: fetchErr } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      throw new BadRequestError(`Failed to fetch technician: ${fetchErr.message}`);
    }
    if (!existing) {
      throw new NotFoundError(`Technician with ID '${id}' not found`);
    }

    const existingRecord = existing as RawTechnicianRecord;
    const updateData: Record<string, unknown> = {
      updated_by: actorProfileId || null,
      updated_at: new Date().toISOString(),
    };

    // 2. Duplicate validation for phone
    if (payload.phone !== undefined) {
      const cleanPhone = payload.phone.trim();
      if (cleanPhone !== existingRecord.phone) {
        const { data: phoneMatch } = await supabase
          .from('technicians')
          .select('id, technician_code, name')
          .eq('phone', cleanPhone)
          .neq('id', id)
          .maybeSingle();

        if (phoneMatch) {
          throw new ConflictError(
            `Phone number '${cleanPhone}' is already in use by technician ${phoneMatch.technician_code} (${phoneMatch.name}).`,
            { code: 'DUPLICATE_PHONE' }
          );
        }
        updateData.phone = cleanPhone;
      }
    }

    // 3. Duplicate validation for email
    if (payload.email !== undefined) {
      const cleanEmail = payload.email?.trim() || null;
      if (cleanEmail && cleanEmail !== existingRecord.email) {
        const { data: emailMatch } = await supabase
          .from('technicians')
          .select('id, technician_code, name')
          .eq('email', cleanEmail)
          .neq('id', id)
          .maybeSingle();

        if (emailMatch) {
          throw new ConflictError(
            `Email address '${cleanEmail}' is already in use by technician ${emailMatch.technician_code} (${emailMatch.name}).`,
            { code: 'DUPLICATE_EMAIL' }
          );
        }
      }
      updateData.email = cleanEmail;
    }

    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.maxDailyWorkload !== undefined) updateData.max_daily_workload = payload.maxDailyWorkload;
    if (payload.joiningDate !== undefined) updateData.joining_date = payload.joiningDate || null;
    if (payload.notes !== undefined) updateData.notes = payload.notes?.trim() || null;

    // 4. Skills update
    let skillsChanged = false;
    if (payload.specializations !== undefined || payload.skills !== undefined) {
      const newSpecs = Array.from(
        new Set(
          (payload.specializations || payload.skills || [])
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        )
      );
      updateData.specializations = newSpecs;
      skillsChanged = true;
    }

    // 5. Service Areas update
    let areasChanged = false;
    if (payload.serviceAreas !== undefined) {
      const newAreas = Array.from(
        new Set(payload.serviceAreas.map((a) => a.trim()).filter((a) => a.length > 0))
      );
      updateData.service_areas = newAreas;
      areasChanged = true;
    }

    // 6. Availability update
    if (payload.availability || payload.workingDays || payload.workingHours) {
      const workingDays = payload.availability?.workingDays || payload.workingDays || existingRecord.working_days || DEFAULT_WORKING_DAYS;
      const workingHours = payload.availability?.workingHours || payload.workingHours || existingRecord.working_hours || DEFAULT_WORKING_HOURS;
      updateData.working_days = workingDays;
      updateData.working_hours = workingHours;
      updateData.availability = {
        workingDays,
        workingHours,
        notes: payload.availability?.notes || (existingRecord.availability?.notes ?? undefined),
      };
    }

    // 7. Status & deactivation safety
    if (payload.status !== undefined) {
      if (payload.status === 'INACTIVE' && existingRecord.is_active) {
        // Deactivation check
        await this.assertNoActiveAssignments(id, existingRecord.name, existingRecord.technician_code);
        updateData.is_active = false;
      } else if (payload.status !== 'INACTIVE' && !existingRecord.is_active) {
        updateData.is_active = true;
      }
      updateData.status = payload.status;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('technicians')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      logger.error('Failed to update technician in DB', { id, error: updateErr.message });
      throw new BadRequestError(`Failed to update technician: ${updateErr.message}`);
    }

    const updatedRecord = updated as RawTechnicianRecord;

    // 8. Audit logging
    await logActivity({
      actorProfileId,
      action: 'TECHNICIAN_UPDATED',
      entityType: 'technician',
      entityId: id,
      details: {
        technicianCode: updatedRecord.technician_code,
        changes: Object.keys(updateData),
      },
      ipAddress,
    });

    if (skillsChanged) {
      await logActivity({
        actorProfileId,
        action: 'TECHNICIAN_SKILLS_UPDATED',
        entityType: 'technician',
        entityId: id,
        details: {
          previousSkills: existingRecord.specializations,
          newSkills: updatedRecord.specializations,
        },
        ipAddress,
      });
    }

    if (areasChanged) {
      await logActivity({
        actorProfileId,
        action: 'TECHNICIAN_SERVICE_AREAS_UPDATED',
        entityType: 'technician',
        entityId: id,
        details: {
          previousAreas: existingRecord.service_areas,
          newAreas: updatedRecord.service_areas,
        },
        ipAddress,
      });
    }

    return mapTechnicianRecord(updatedRecord);
  }

  /**
   * Update technician operational status or administrative activation.
   */
  public async updateStatus(
    id: string,
    payload: UpdateTechnicianStatusPayload,
    actorProfileId?: string,
    ipAddress?: string
  ): Promise<TechnicianResponse> {
    const supabase = getSupabaseClient();

    const { data: existing, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestError(`Failed to fetch technician: ${error.message}`);
    }
    if (!existing) {
      throw new NotFoundError(`Technician with ID '${id}' not found`);
    }

    const existingRecord = existing as RawTechnicianRecord;
    const isDeactivating =
      payload.isActive === false || payload.status === 'INACTIVE';

    if (isDeactivating && existingRecord.is_active) {
      await this.assertNoActiveAssignments(id, existingRecord.name, existingRecord.technician_code);
    }

    const targetStatus = payload.status || (isDeactivating ? 'INACTIVE' : existingRecord.status === 'INACTIVE' ? 'AVAILABLE' : existingRecord.status);
    const targetIsActive = payload.isActive !== undefined ? payload.isActive : targetStatus !== 'INACTIVE';

    // Idempotency check: if already in target status and activation state
    if (existingRecord.status === targetStatus && existingRecord.is_active === targetIsActive) {
      return mapTechnicianRecord(existingRecord);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('technicians')
      .update({
        status: targetStatus,
        is_active: targetIsActive,
        updated_by: actorProfileId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      throw new BadRequestError(`Failed to update technician status: ${updateErr.message}`);
    }

    const updatedRecord = updated as RawTechnicianRecord;

    await logActivity({
      actorProfileId,
      action: isDeactivating ? 'TECHNICIAN_DEACTIVATED' : targetIsActive && !existingRecord.is_active ? 'TECHNICIAN_ACTIVATED' : 'TECHNICIAN_STATUS_CHANGED',
      entityType: 'technician',
      entityId: id,
      details: {
        technicianCode: updatedRecord.technician_code,
        previousStatus: existingRecord.status,
        newStatus: targetStatus,
        previousIsActive: existingRecord.is_active,
        newIsActive: targetIsActive,
        reason: payload.reason || null,
      },
      ipAddress,
    });

    return mapTechnicianRecord(updatedRecord);
  }

  /**
   * Helper to verify that a technician has no active service assignments prior to deactivation.
   */
  private async assertNoActiveAssignments(id: string, name: string, code: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: activeAssignments } = await supabase
      .from('service_assignments')
      .select('id, status')
      .eq('technician_id', id)
      .in('status', ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS']);

    if (activeAssignments && activeAssignments.length > 0) {
      throw new ConflictError(
        `Cannot deactivate technician ${name} (${code}): ${activeAssignments.length} active assignment(s) are currently in progress. Reassign or complete active work before deactivating.`,
        {
          code: 'TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS',
          activeAssignmentsCount: activeAssignments.length,
        }
      );
    }
  }
}

export const technicianService = new TechnicianService();
