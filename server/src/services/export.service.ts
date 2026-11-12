import ExcelJS from 'exceljs';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError } from '../utils/errors.js';
import { addDaysIstIso } from '../utils/date.js';

export type ExportKind =
  | 'customers'
  | 'schedules'
  | 'service-reports'
  | 'amc-expiry'
  | 'service-requests'
  | 'payments'
  | 'inventory'
  | 'technicians';

export interface ExportFilters {
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  search?: string;
}

interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  getValue?: (row: Record<string, any>) => unknown;
}

interface ExportDefinition {
  table: string;
  select: string;
  dateField: string;
  searchField: string;
  hasCustomerId?: boolean;
  columns: ExportColumn[];
}

function relName(rel: any, field = 'name'): string {
  const item = Array.isArray(rel) ? rel[0] : rel;
  return item?.[field] ? String(item[field]) : '';
}

function assetLabel(rel: any): string {
  const item = Array.isArray(rel) ? rel[0] : rel;
  if (!item) return '';
  return [item.asset_tag, item.brand, item.model_number].filter(Boolean).join(' · ');
}

const EXPORTS: Record<ExportKind, ExportDefinition> = {
  customers: {
    table: 'customers',
    select: 'customer_code,name,company_name,email,phone,gst_number,customer_type,city,state,is_active,created_at',
    dateField: 'created_at',
    searchField: 'name',
    columns: [
      { key: 'customer_code', header: 'Customer Code', width: 16 },
      { key: 'name', header: 'Customer Name', width: 26 },
      { key: 'company_name', header: 'Company', width: 24 },
      { key: 'email', header: 'Email', width: 28 },
      { key: 'phone', header: 'Phone', width: 16 },
      { key: 'gst_number', header: 'GSTIN', width: 18 },
      { key: 'customer_type', header: 'Type', width: 14 },
      { key: 'city', header: 'City', width: 16 },
      { key: 'state', header: 'State', width: 16 },
      { key: 'is_active', header: 'Active', width: 10 },
      { key: 'created_at', header: 'Created At', width: 22 },
    ],
  },
  schedules: {
    table: 'service_schedules',
    select:
      'schedule_number,scheduled_date,start_time,end_time,status,planned_service_type,notes,customers(name),customer_sites(site_name),ac_assets(asset_tag,brand,model_number),technicians(name)',
    dateField: 'scheduled_date',
    searchField: 'schedule_number',
    hasCustomerId: true,
    columns: [
      { key: 'schedule_number', header: 'Schedule Number', width: 18 },
      { key: 'scheduled_date', header: 'Scheduled Date', width: 15 },
      { key: 'start_time', header: 'Start Time', width: 12 },
      { key: 'end_time', header: 'End Time', width: 12 },
      { key: 'status', header: 'Status', width: 14 },
      { key: 'planned_service_type', header: 'Service Type', width: 16 },
      { key: 'customer_name', header: 'Customer', width: 24, getValue: (r) => relName(r.customers) },
      { key: 'site_name', header: 'Site', width: 22, getValue: (r) => relName(r.customer_sites, 'site_name') },
      { key: 'asset', header: 'AC Unit', width: 24, getValue: (r) => assetLabel(r.ac_assets) },
      { key: 'technician_name', header: 'Technician', width: 22, getValue: (r) => relName(r.technicians) },
      { key: 'notes', header: 'Notes', width: 32 },
    ],
  },
  'service-reports': {
    table: 'service_reports',
    select:
      'report_number,service_date,primary_outcome,resolution_status,status,payment_collected,payment_amount,payment_method,work_description,technician_remarks,customers(name),customer_sites(site_name),technicians(name),service_schedules(schedule_number)',
    dateField: 'service_date',
    searchField: 'report_number',
    hasCustomerId: true,
    columns: [
      { key: 'report_number', header: 'Report Number', width: 18 },
      { key: 'service_date', header: 'Service Date', width: 14 },
      { key: 'primary_outcome', header: 'Outcome', width: 18 },
      { key: 'resolution_status', header: 'Resolution Status', width: 18 },
      { key: 'status', header: 'Approval Status', width: 16 },
      { key: 'customer_name', header: 'Customer', width: 24, getValue: (r) => relName(r.customers) },
      { key: 'site_name', header: 'Site', width: 22, getValue: (r) => relName(r.customer_sites, 'site_name') },
      { key: 'schedule_number', header: 'Schedule #', width: 16, getValue: (r) => relName(r.service_schedules, 'schedule_number') },
      { key: 'technician_name', header: 'Technician', width: 20, getValue: (r) => relName(r.technicians) },
      { key: 'payment_collected', header: 'Payment Collected', width: 16 },
      { key: 'payment_amount', header: 'Payment Amount', width: 15 },
      { key: 'payment_method', header: 'Payment Method', width: 15 },
      { key: 'work_description', header: 'Work Description', width: 36 },
      { key: 'technician_remarks', header: 'Technician Remarks', width: 32 },
    ],
  },
  'amc-expiry': {
    table: 'amc_contracts',
    select:
      'contract_number,status,frequency,start_date,end_date,total_visits,total_amount,customers(name),amc_plans(name)',
    dateField: 'end_date',
    searchField: 'contract_number',
    hasCustomerId: true,
    columns: [
      { key: 'contract_number', header: 'Contract Number', width: 18 },
      { key: 'customer_name', header: 'Customer', width: 24, getValue: (r) => relName(r.customers) },
      { key: 'plan_name', header: 'Plan', width: 20, getValue: (r) => relName(r.amc_plans) },
      { key: 'status', header: 'Status', width: 14 },
      { key: 'frequency', header: 'Frequency', width: 14 },
      { key: 'start_date', header: 'Start Date', width: 14 },
      { key: 'end_date', header: 'End Date', width: 14 },
      { key: 'total_visits', header: 'Total Visits', width: 12 },
      { key: 'total_amount', header: 'Total Amount', width: 16 },
    ],
  },
  'service-requests': {
    table: 'service_requests',
    select:
      'request_number,request_type,priority,status,issue_category,source_channel,reported_date,description,customers(name),customer_sites(site_name),ac_assets(asset_tag,brand,model_number)',
    dateField: 'reported_date',
    searchField: 'request_number',
    hasCustomerId: true,
    columns: [
      { key: 'request_number', header: 'Request Number', width: 18 },
      { key: 'reported_date', header: 'Reported Date', width: 14 },
      { key: 'request_type', header: 'Type', width: 16 },
      { key: 'priority', header: 'Priority', width: 12 },
      { key: 'status', header: 'Status', width: 16 },
      { key: 'issue_category', header: 'Issue Category', width: 18 },
      { key: 'source_channel', header: 'Source Channel', width: 16 },
      { key: 'customer_name', header: 'Customer', width: 24, getValue: (r) => relName(r.customers) },
      { key: 'site_name', header: 'Site', width: 22, getValue: (r) => relName(r.customer_sites, 'site_name') },
      { key: 'asset', header: 'AC Unit', width: 24, getValue: (r) => assetLabel(r.ac_assets) },
      { key: 'description', header: 'Description', width: 36 },
    ],
  },
  payments: {
    table: 'payments',
    select:
      'payment_number,status,total_amount_due,total_amount_paid,created_at,customers(name,phone),service_requests(request_number),amc_contracts(contract_number)',
    dateField: 'created_at',
    searchField: 'payment_number',
    hasCustomerId: true,
    columns: [
      { key: 'payment_number', header: 'Invoice / Payment #', width: 20 },
      { key: 'customer_name', header: 'Customer', width: 24, getValue: (r) => relName(r.customers) },
      { key: 'customer_phone', header: 'Phone', width: 16, getValue: (r) => relName(r.customers, 'phone') },
      { key: 'status', header: 'Status', width: 16 },
      { key: 'total_amount_due', header: 'Amount Due (INR)', width: 18 },
      { key: 'total_amount_paid', header: 'Amount Paid (INR)', width: 18 },
      {
        key: 'balance_due',
        header: 'Outstanding Balance',
        width: 18,
        getValue: (r) => Math.max(0, Number(r.total_amount_due || 0) - Number(r.total_amount_paid || 0)),
      },
      { key: 'request_number', header: 'Service Request #', width: 18, getValue: (r) => relName(r.service_requests, 'request_number') },
      { key: 'contract_number', header: 'AMC Contract #', width: 18, getValue: (r) => relName(r.amc_contracts, 'contract_number') },
      { key: 'created_at', header: 'Created At', width: 22 },
    ],
  },
  inventory: {
    table: 'parts',
    select: 'part_code,name,category,unit_of_measure,current_stock,low_stock_threshold,unit_cost,unit_price,is_active,created_at',
    dateField: 'created_at',
    searchField: 'name',
    columns: [
      { key: 'part_code', header: 'Part Code', width: 16 },
      { key: 'name', header: 'Part Name', width: 28 },
      { key: 'category', header: 'Category', width: 18 },
      { key: 'unit_of_measure', header: 'Unit', width: 10 },
      { key: 'current_stock', header: 'Current Stock', width: 14 },
      { key: 'low_stock_threshold', header: 'Low Stock Alert', width: 15 },
      { key: 'unit_cost', header: 'Unit Cost (INR)', width: 15 },
      { key: 'unit_price', header: 'Unit Price (INR)', width: 15 },
      { key: 'is_active', header: 'Active', width: 10 },
    ],
  },
  technicians: {
    table: 'technicians',
    select: 'technician_code,name,phone,email,status,specialization,is_active,created_at',
    dateField: 'created_at',
    searchField: 'name',
    columns: [
      { key: 'technician_code', header: 'Technician Code', width: 16 },
      { key: 'name', header: 'Technician Name', width: 26 },
      { key: 'phone', header: 'Phone', width: 16 },
      { key: 'email', header: 'Email', width: 26 },
      { key: 'status', header: 'Duty Status', width: 14 },
      { key: 'specialization', header: 'Specialization', width: 24 },
      { key: 'is_active', header: 'Active', width: 10 },
      { key: 'created_at', header: 'Created At', width: 22 },
    ],
  },
};

export async function createXlsxExport(kind: ExportKind, filters: ExportFilters): Promise<Buffer> {
  const definition = EXPORTS[kind];
  if (!definition) throw new BadRequestError('Unsupported export type.');

  const supabase = getSupabaseClient();
  const allRows: Record<string, any>[] = [];
  const pageSize = 1000;
  const maxDataRows = 1_048_575;
  const isTimestampDate = definition.dateField === 'created_at';

  for (let page = 0; ; page += 1) {
    let query: any = supabase
      .from(definition.table)
      .select(definition.select)
      .order(definition.dateField, { ascending: false });

    if (filters.from) {
      query = query.gte(
        definition.dateField,
        isTimestampDate ? `${filters.from}T00:00:00+05:30` : filters.from
      );
    }
    if (filters.to) {
      if (isTimestampDate) {
        query = query.lt(definition.dateField, `${addDaysIstIso(filters.to, 1)}T00:00:00+05:30`);
      } else {
        query = query.lte(definition.dateField, filters.to);
      }
    }
    if (filters.status) {
      if (kind === 'customers' || kind === 'inventory') {
        if (!['ACTIVE', 'INACTIVE'].includes(filters.status)) {
          throw new BadRequestError(`${kind} export status must be ACTIVE or INACTIVE.`);
        }
        query = query.eq('is_active', filters.status === 'ACTIVE');
      } else {
        query = query.eq('status', filters.status);
      }
    }
    if (filters.customerId && definition.hasCustomerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters.search) {
      query = query.ilike(definition.searchField, `%${filters.search}%`);
    }

    const { data, error } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new BadRequestError(`Could not export ${kind}: ${error.message}`);
    allRows.push(...(data || []));
    if (allRows.length > maxDataRows) {
      throw new BadRequestError('This export exceeds Excel’s worksheet row limit. Narrow your date range first.');
    }
    if (!data || data.length < pageSize) break;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PYS Operations';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(kind === 'amc-expiry' ? 'AMC Expiry' : kind.replace(/-/g, ' '));
  sheet.columns = definition.columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width || Math.max(column.header.length + 4, 16),
  }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + definition.columns.length)}1`,
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203B5A' } };

  for (const row of allRows) {
    sheet.addRow(
      Object.fromEntries(
        definition.columns.map((column) => [
          column.key,
          column.getValue ? column.getValue(row) : row[column.key] ?? '',
        ])
      )
    );
  }

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
