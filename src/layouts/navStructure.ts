import React from 'react';
import {
  LayoutDashboard,
  Users,
  Wrench,
  CalendarDays,
  HardHat,
  FileCheck2,
  Package,
  Boxes,
  Receipt,
  Bell,
  History,
  ShieldCheck,
  Settings,
} from 'lucide-react';

export interface NavItemDef {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

export interface NavGroupDef {
  group: string;
  adminOnly?: boolean;
  items: NavItemDef[];
}

export const NAV_STRUCTURE: NavGroupDef[] = [
  {
    group: 'OVERVIEW',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    group: 'OPERATIONS',
    items: [
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'service-requests', label: 'Service Requests', icon: Wrench },
      { id: 'service-schedule', label: 'Service Schedule', icon: CalendarDays },
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
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'activity-logs', label: 'Activity Log', icon: History },
    ],
  },
  {
    group: 'ADMIN AREA',
    adminOnly: true,
    items: [
      { id: 'staff', label: 'Staff Management', icon: ShieldCheck, adminOnly: true },
      { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
    ],
  },
];
