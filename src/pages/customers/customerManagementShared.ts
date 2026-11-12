import { AcAsset, Customer, CustomerSite, WarrantyStatus } from '@/domain/types';
import { WizardStepItem } from '@/components/ui/ModalStepWizard';
import { calculateWarrantyStatus } from '@/utils/warranty';

export const FLOOR_OPTIONS = [
  'Basement',
  'Ground Floor',
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
  '5th Floor',
  'Terrace',
  'Other',
];

export const getAmcBadgeProps = (
  amc?: { status: string; contractNumber?: string } | null,
): { variant: 'brand' | 'warning' | 'neutral' | 'danger'; label: string } => {
  if (!amc || !amc.status) return { variant: 'neutral', label: 'NO AMC' };
  switch (amc.status) {
    case 'ACTIVE':
      return { variant: 'brand', label: 'ACTIVE' };
    case 'EXPIRING_SOON':
      return { variant: 'warning', label: 'EXPIRING SOON' };
    case 'EXPIRED':
      return { variant: 'neutral', label: 'EXPIRED' };
    case 'CANCELLED':
      return { variant: 'danger', label: 'CANCELLED' };
    default:
      return { variant: 'neutral', label: amc.status.replace('_', ' ') };
  }
};

export const ROOM_OPTIONS = [
  'Reception',
  'Waiting Area',
  'Manager Cabin',
  'Director Cabin',
  'Admin Office',
  'HR Cabin',
  'Accounts Department',
  'Sales Department',
  'Service Department',
  'IT Room',
  'Server Room',
  'Conference Room',
  'Meeting Room',
  'Training Room',
  'Staff Room',
  'Pantry',
  'Kitchen',
  'Cafeteria',
  'Customer Lounge',
  'Showroom',
  'Warehouse',
  'Store Room',
  'Workshop',
  'Technician Room',
  'Security Room',
  'Lobby',
  'Corridor',
  'Bedroom',
  'Living Room',
  'Dining Room',
  'Guest Room',
  'Other',
];

export const AC_TYPE_OPTIONS = [
  'Split AC',
  'Window AC',
  'Cassette AC',
  'Floor Standing AC',
  'Tower AC',
  'Ductable AC',
  'Ceiling Suspended AC',
  'Portable AC',
  'Central AC',
  'Package AC',
  'VRF System',
  'VRV System',
  'AHU / FCU Connected System',
  'Other',
];

export const RATING_OPTIONS = ['5 Star', '4 Star', '3 Star', '2 Star', '1 Star', 'Not Rated', 'Unknown'];

export const REFRIGERANT_OPTIONS = ['R32', 'R410A', 'R22', 'R290', 'Other', 'Unknown'];

export const ASSET_STATUS_OPTIONS = [
  'Active',
  'Under Service',
  'Under Repair',
  'Temporarily Inactive',
  'Decommissioned',
  'Replaced',
  'Scrapped',
];

export const ASSET_CONDITION_OPTIONS = [
  'Excellent',
  'Good',
  'Fair',
  'Needs Maintenance',
  'Poor',
  'Critical',
];

export function computeLiveWarrantyStatus(startDate?: string, endDate?: string): WarrantyStatus {
  return calculateWarrantyStatus(startDate, endDate);
}

export interface CustomersApiResponse {
  customers: Customer[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export interface CustomerApiResponse {
  customer: Customer;
}

export interface SitesApiResponse {
  sites: CustomerSite[];
  total?: number;
}

export interface SiteApiResponse {
  site: CustomerSite;
}

export interface AssetsApiResponse {
  assets: AcAsset[];
  total?: number;
}

export interface AssetApiResponse {
  asset: AcAsset;
}

export interface CustomerListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const ASSET_WIZARD_STEPS: WizardStepItem[] = [
  { id: 'specs', label: '1. Equipment & Specs', description: 'Brand, Model & Specs' },
  { id: 'serials', label: '2. Serials & Location', description: 'IDU/ODU & Room' },
  { id: 'warranty', label: '3. Warranty & Services', description: 'Dates & PM visits' },
];

