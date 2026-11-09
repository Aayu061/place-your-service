import { apiClient } from '@/services/api/client';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PartRecord {
  id: string;
  part_code: string;
  name: string;
  category: string | null;
  unit_of_measure: string;
  current_stock: number;
  low_stock_threshold: number;
  unit_cost: number;
  unit_price: number;
  is_active: boolean;
}

export interface PaymentRecord {
  id: string;
  payment_number: string;
  customer_id: string;
  service_request_id?: string | null;
  amc_id?: string | null;
  total_amount_due: number;
  total_amount_paid: number;
  status: string;
  created_at: string;
  customers?: { name: string; customer_code: string };
  service_requests?: { request_number: string } | null;
  amc_contracts?: { contract_number: string } | null;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  is_read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface InventoryTransactionRecord {
  id: string;
  part_id: string;
  transaction_type: string;
  quantity: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  parts?: { part_code: string; name: string } | null;
}

export interface PaymentTransactionRecord {
  id: string;
  payment_id: string;
  entry_type: string;
  payment_method: string;
  amount: number;
  payment_status: string;
  transaction_reference: string | null;
  external_payment_reference: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export interface ActivityLogRecord {
  id: string;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export interface SearchRecord {
  record_type: string;
  record_id: string;
  context_id: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  occurred_at: string | null;
}

export const operationsApi = {
  listParts: (params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<PartRecord>>('/inventory/parts', { params }),
  createPart: (body: Record<string, unknown>) => apiClient.post<{ part: PartRecord }>('/inventory/parts', body),
  updatePart: (id: string, body: Record<string, unknown>) => apiClient.patch<{ part: PartRecord }>(`/inventory/parts/${id}`, body),
  listInventoryTransactions: (params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<InventoryTransactionRecord>>('/inventory/transactions', { params }),
  recordInventoryTransaction: (body: Record<string, unknown>) => apiClient.post<{ transaction: unknown }>('/inventory/transactions', body),
  listPayments: (params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<PaymentRecord>>('/payments', { params }),
  createPayment: (body: Record<string, unknown>) => apiClient.post<{ paymentId: string }>('/payments', body),
  listPaymentTransactions: (id: string, params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<PaymentTransactionRecord>>(`/payments/${id}/transactions`, { params }),
  recordPayment: (id: string, body: Record<string, unknown>) => apiClient.post<{ transactionId: string }>(`/payments/${id}/transactions`, body),
  reversePayment: (transactionId: string, body: Record<string, unknown>) => apiClient.post<{ reversalId: string }>(`/payment-transactions/${transactionId}/reversals`, body),
  listNotifications: (params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<NotificationRecord>>('/notifications', { params }),
  markNotificationRead: (id: string, isRead = true) => apiClient.patch<{ notification: NotificationRecord }>(`/notifications/${id}/read`, { isRead }),
  generateNotifications: () => apiClient.post<{ created: number }>('/notifications/generate'),
  listActivityLogs: (params: Record<string, string | number | undefined> = {}) => apiClient.get<PageResult<ActivityLogRecord>>('/activity-logs', { params }),
  search: (q: string, limit = 50) => apiClient.get<{ results: SearchRecord[] }>('/search', { params: { q, limit } }),
  exportXlsx: (kind: 'customers' | 'schedules' | 'service-reports' | 'amc-expiry', params: Record<string, string | undefined> = {}) => apiClient.download(`/exports/${kind}`, params),
};
