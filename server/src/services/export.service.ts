import ExcelJS from 'exceljs';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError } from '../utils/errors.js';

export type ExportKind = 'customers' | 'schedules' | 'service-reports' | 'amc-expiry';
export interface ExportFilters { from?: string; to?: string; status?: string; customerId?: string; search?: string }

const EXPORTS: Record<ExportKind, { table: string; columns: Array<{ key: string; header: string }>; dateField: string; searchField: string }> = {
  customers: {
    table: 'customers', dateField: 'created_at', searchField: 'name',
    columns: [
      { key: 'customer_code', header: 'Customer code' }, { key: 'name', header: 'Name' },
      { key: 'company_name', header: 'Company' }, { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' }, { key: 'customer_type', header: 'Type' },
      { key: 'city', header: 'City' }, { key: 'state', header: 'State' },
      { key: 'is_active', header: 'Active' }, { key: 'created_at', header: 'Created at' },
    ],
  },
  schedules: {
    table: 'service_schedules', dateField: 'scheduled_date', searchField: 'schedule_number',
    columns: [
      { key: 'schedule_number', header: 'Schedule number' }, { key: 'scheduled_date', header: 'Scheduled date' },
      { key: 'start_time', header: 'Start time' }, { key: 'end_time', header: 'End time' },
      { key: 'status', header: 'Status' }, { key: 'planned_service_type', header: 'Planned service' },
      { key: 'customer_id', header: 'Customer ID' }, { key: 'site_id', header: 'Site ID' },
      { key: 'asset_id', header: 'Asset ID' }, { key: 'technician_id', header: 'Technician ID' },
      { key: 'notes', header: 'Notes' },
    ],
  },
  'service-reports': {
    table: 'service_reports', dateField: 'service_date', searchField: 'report_number',
    columns: [
      { key: 'report_number', header: 'Report number' }, { key: 'service_date', header: 'Service date' },
      { key: 'primary_outcome', header: 'Outcome' }, { key: 'resolution_status', header: 'Resolution' },
      { key: 'status', header: 'Status' }, { key: 'customer_id', header: 'Customer ID' },
      { key: 'site_id', header: 'Site ID' }, { key: 'service_schedule_id', header: 'Schedule ID' },
      { key: 'technician_id', header: 'Technician ID' }, { key: 'work_description', header: 'Work description' },
      { key: 'technician_remarks', header: 'Technician remarks' },
    ],
  },
  'amc-expiry': {
    table: 'amc_contracts', dateField: 'end_date', searchField: 'contract_number',
    columns: [
      { key: 'contract_number', header: 'Contract number' }, { key: 'end_date', header: 'Expiry date' },
      { key: 'status', header: 'Status' }, { key: 'customer_id', header: 'Customer ID' },
      { key: 'start_date', header: 'Start date' }, { key: 'coverage_type', header: 'Coverage' },
      { key: 'total_amount', header: 'Contract amount' },
    ],
  },
};

function safeCell(value: unknown) {
  if (typeof value !== 'string') return value ?? '';
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function createXlsxExport(kind: ExportKind, filters: ExportFilters): Promise<Buffer> {
  const definition = EXPORTS[kind];
  if (!definition) throw new BadRequestError('Unsupported export type.');
  const supabase = getSupabaseClient();
  const selectedColumns = definition.columns.map((column) => column.key).join(',');
  const allRows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;
  const maxDataRows = 1_048_575;

  for (let page = 0; ; page += 1) {
    let query: any = supabase.from(definition.table).select(selectedColumns).order(definition.dateField, { ascending: false });
    if (filters.from) query = query.gte(definition.dateField, filters.from);
    if (filters.to) {
      if (kind === 'customers') {
        const exclusiveEnd = new Date(`${filters.to}T00:00:00.000Z`);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
        query = query.lt(definition.dateField, exclusiveEnd.toISOString());
      } else query = query.lte(definition.dateField, filters.to);
    }
    if (filters.status) {
      if (kind === 'customers') {
        if (!['ACTIVE', 'INACTIVE'].includes(filters.status)) throw new BadRequestError('Customer export status must be ACTIVE or INACTIVE.');
        query = query.eq('is_active', filters.status === 'ACTIVE');
      } else query = query.eq('status', filters.status);
    }
    if (filters.customerId && kind !== 'customers') query = query.eq('customer_id', filters.customerId);
    if (filters.search) query = query.ilike(definition.searchField, `%${filters.search}%`);
    const { data, error } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new BadRequestError(`Could not export ${kind}: ${error.message}`);
    allRows.push(...(data || []));
    if (allRows.length > maxDataRows) throw new BadRequestError('This export exceeds Excel’s worksheet row limit. Narrow the selected filters and try again.');
    if (!data || data.length < pageSize) break;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PYS Operations';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(kind === 'amc-expiry' ? 'AMC expiry' : kind.replace('-', ' '));
  sheet.columns = definition.columns.map((column) => ({ key: column.key, header: column.header, width: Math.min(42, Math.max(14, column.header.length + 3)) }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + definition.columns.length)}1` };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203B5A' } };
  for (const row of allRows) sheet.addRow(Object.fromEntries(definition.columns.map((column) => [column.key, safeCell(row[column.key])] as const)));
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
