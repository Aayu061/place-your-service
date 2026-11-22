import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Wrench,
  CalendarDays,
  HardHat,
  FileCheck2,
  FileText,
  Package,
  Boxes,
  Receipt,
  Bell,
  History,
  ShieldCheck,
  Settings,
  Server,
  Store,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import { config } from '@/config/env';

export interface NavItemDef {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  /** External address: rendered as a new-tab link, never as a PYS page. */
  href?: string;
}

export interface NavGroupDef {
  group: string;
  adminOnly?: boolean;
  items: NavItemDef[];
}

export const NAV_STRUCTURE: NavGroupDef[] = [
  {
    group: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'analytics', label: 'Overall Analytics', icon: TrendingUp },
    ],
  },
  {
    group: 'OPERATIONS',
    items: [
      { id: 'approval-inbox', label: 'Approval Inbox', icon: Inbox },
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'service-requests', label: 'Service Requests', icon: Wrench },
      { id: 'service-schedule', label: 'Service Schedule', icon: CalendarDays },
      { id: 'service-reports', label: 'Service Reports', icon: FileText },
      { id: 'technicians', label: 'Technicians', icon: HardHat },
    ],
  },
  {
    group: 'CONTRACTS',
    items: [{ id: 'amc', label: 'AMC Contracts', icon: FileCheck2 }],
  },
  {
    group: 'INVENTORY',
    items: [
      { id: 'parts', label: 'Parts', icon: Package },
      { id: 'inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    group: 'FINANCE',
    items: [{ id: 'payments', label: 'Payments', icon: Receipt }],
  },
  {
    group: 'SYSTEM',
    items: [
      { id: 'notifications', label: 'Notifications & Alerts', icon: Bell },
      { id: 'activity-logs', label: 'Activity Log', icon: History },
    ],
  },
  {
    group: 'ADMIN AREA',
    adminOnly: true,
    items: [
      { id: 'ac-master', label: 'AC Master Data', icon: Boxes, adminOnly: true },
      { id: 'server-management', label: 'Server & Database', icon: Server, adminOnly: true },
      { id: 'ess-management', label: 'Extreme S&S Portal', icon: Store, adminOnly: true },
      { id: 'ess-admin-link', label: 'ESS website admin', icon: ExternalLink, adminOnly: true, href: config.essAdminUrl },
      { id: 'staff', label: 'Staff Management', icon: ShieldCheck, adminOnly: true },
      { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
    ],
  },
];
