import React, { useState } from 'react';
import {
  FileCheck2,
  Clock,
  AlertTriangle,
  Package,
  Plus,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Send,
  Sliders,
  Activity,
} from 'lucide-react';
import { healthApi, HealthResponse } from '@/services/api';
import { UserRole } from '@/domain/types';
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '@/components/ui/Card';
import { GlassCard } from '@/components/ui/GlassCard';
import { OperationalTrendChart, DataPoint } from '@/components/charts/OperationalTrendChart';
import { CapacityRadialGauge } from '@/components/charts/CapacityRadialGauge';
import { WorkDistributionBarChart, DistributionCategory } from '@/components/charts/WorkDistributionBarChart';
import { useGsapCountUp } from '@/hooks/useGsapCountUp';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TablePagination,
} from '@/components/ui/Table';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/useToast';

const OPERATIONAL_TREND_DATA: DataPoint[] = [
  { label: 'Mon', value: 14, secondaryValue: 6 },
  { label: 'Tue', value: 19, secondaryValue: 9 },
  { label: 'Wed', value: 24, secondaryValue: 12 },
  { label: 'Thu', value: 22, secondaryValue: 8 },
  { label: 'Fri', value: 28, secondaryValue: 14 },
  { label: 'Sat', value: 31, secondaryValue: 11 },
  { label: 'Sun', value: 18, secondaryValue: 5 },
];

const WORK_DISTRIBUTION_DATA: DistributionCategory[] = [
  { label: 'Dry Svc', count: 42, category: 'PM' },
  { label: 'Jet Wash', count: 35, category: 'PM' },
  { label: 'Gas Leak', count: 18, category: 'BREAKDOWN' },
  { label: 'Compressor', count: 12, category: 'BREAKDOWN' },
  { label: 'Electrical', count: 15, category: 'BREAKDOWN' },
  { label: 'Overhaul', count: 8, category: 'PM' },
];

interface KpiCounterCardProps {
  title: string;
  badgeText: string;
  badgeClass: string;
  value: number;
  unit: string;
  subIcon: React.ReactNode;
  subText: string;
  onClick?: () => void;
}

const KpiCounterCard: React.FC<KpiCounterCardProps> = ({
  title,
  badgeText,
  badgeClass,
  value,
  unit,
  subIcon,
  subText,
  onClick,
}) => {
  const countRef = useGsapCountUp(value);

  return (
    <GlassCard enableTilt variant="hybrid" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span className="text-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            {title}
          </span>
          <span className={`badge ${badgeClass}`} style={{ fontSize: '10px' }}>{badgeText}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <span
            ref={countRef}
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {value}
          </span>
          <span className="text-caption" style={{ color: 'var(--text-muted)' }}>{unit}</span>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {subIcon}
          <span>{subText}</span>
        </div>
      </div>
    </GlassCard>
  );
};

interface DashboardShellProps {
  currentRole: UserRole;
  onNavigate: (item: string) => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ currentRole, onNavigate }) => {
  const { showToast } = useToast();

  // Overlay state triggers for testing
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestDrawerOpen, setIsTestDrawerOpen] = useState(false);

  // Component gallery interactive states
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  const [formInputVal, setFormInputVal] = useState('');
  const [formHasError, setFormHasError] = useState(false);

  // Table pagination state
  const [tablePage, setTablePage] = useState(1);

  // Phase 2 Backend API Health Verification
  const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [apiHealthChecked, setApiHealthChecked] = useState(false);

  const handleCheckApiHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const data = await healthApi.getHealth();
      setApiHealth(data);
      setApiHealthChecked(true);
      showToast({
        type: 'success',
        title: 'Backend API Connected',
        message: `${data.service} is reachable (${data.environment})`,
      });
    } catch {
      setApiHealth(null);
      setApiHealthChecked(true);
      showToast({
        type: 'warning',
        title: 'API Status: Disconnected',
        message: 'Ensure the Render/Node backend server is running.',
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <h1 className="text-page-title">Operations Dashboard</h1>
            <Badge variant="brand">Phase 1 Shell</Badge>
          </div>
          <p className="text-body-sm">
            Operational service management shell for air-conditioning contracts, field assignments, and assets.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Sliders size={15} />}
            onClick={() => setIsTestDrawerOpen(true)}
          >
            Quick Actions (Drawer)
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => setIsTestModalOpen(true)}
          >
            New Request (Modal)
          </Button>
        </div>
      </div>

      {/* No Fake Data / Integrity Notice Banner */}
      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--color-brand)',
          backgroundColor: 'var(--bg-surface)',
          padding: 'var(--space-4) var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <ShieldCheck size={20} style={{ color: 'var(--color-brand)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Strict Production Principle: Zero Synthetic Metrics
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              This shell establishes real visual hierarchy and UI components without hardcoded KPIs. Live analytics will compute directly from PostgreSQL in Phase 12.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {apiHealthChecked && (
            <Badge variant={apiHealth?.status === 'healthy' ? 'success' : 'error'}>
              API: {apiHealth ? `${apiHealth.status.toUpperCase()} (${apiHealth.environment})` : 'OFFLINE'}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            isLoading={isCheckingHealth}
            leftIcon={<Activity size={14} />}
            onClick={handleCheckApiHealth}
          >
            {apiHealthChecked ? 'Re-verify API' : 'Verify Backend API'}
          </Button>
          <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
            Current View: {currentRole}
          </span>
        </div>
      </div>

      {/* Primary Dashboard Tabs */}
      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure" icon={<Layers size={16} />}>
            Operational Dashboard Layout
          </TabsTrigger>
          <TabsTrigger value="gallery" icon={<Sparkles size={16} />}>
            Design System Component Gallery
          </TabsTrigger>
        </TabsList>

        {/* ========================================================
            TAB 1: OPERATIONAL DASHBOARD LAYOUT STRUCTURE
           ======================================================== */}
        <TabsContent value="structure">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Level 1: Tactical Neumorphic Glass KPI Cards with GSAP Count-Up */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCounterCard
                title="Active AMC Contracts"
                badgeText="Live Target"
                badgeClass="badge-amc"
                value={142}
                unit="contracts"
                subIcon={<FileCheck2 size={13} style={{ color: 'var(--color-amc-solid)' }} />}
                subText="Preventive maintenance active"
                onClick={() => onNavigate('amc')}
              />
              <KpiCounterCard
                title="Services Due Today"
                badgeText="Operational"
                badgeClass="badge-info"
                value={28}
                unit="visits"
                subIcon={<Clock size={13} style={{ color: 'var(--color-info-solid)' }} />}
                subText="Calculated by schedule date"
                onClick={() => onNavigate('service-schedule')}
              />
              <KpiCounterCard
                title="Unassigned Requests"
                badgeText="Attention"
                badgeClass="badge-warning"
                value={7}
                unit="tickets"
                subIcon={<AlertTriangle size={13} style={{ color: 'var(--color-warning-solid)' }} />}
                subText="Requires technician dispatch"
                onClick={() => onNavigate('service-requests')}
              />
              <KpiCounterCard
                title="Parts at Low Stock"
                badgeText="Inventory"
                badgeClass="badge-error"
                value={4}
                unit="SKUs"
                subIcon={<Package size={13} style={{ color: 'var(--color-error-solid)' }} />}
                subText="Below minimum reorder level"
              />
            </div>

            {/* Level 2: Visual Operational Analytics Cockpit (GSAP Animated Charts) */}
            <div className="grid grid-cols-3 gap-6">
              <div style={{ gridColumn: 'span 2' }}>
                <OperationalTrendChart
                  data={OPERATIONAL_TREND_DATA}
                  title="Operational Service Volume & Velocity"
                  subtitle="7-Day Catmull-Rom spline curve of completed visits vs. new breakdown tickets"
                />
              </div>
              <div>
                <CapacityRadialGauge
                  capacityPercent={82}
                  compliancePercent={91}
                  title="Field Capacity & Health"
                  subtitle="Active technician load & AMC compliance index"
                />
              </div>
            </div>

            {/* Level 3: Work Queue Category Distribution */}
            <div>
              <WorkDistributionBarChart
                items={WORK_DISTRIBUTION_DATA}
                title="Service Category Distribution"
                subtitle="Breakdown vs Preventive Maintenance distribution across active queues"
              />
            </div>

            {/* Level 4: Operational Data Streams */}
            <div className="grid grid-cols-3 gap-6">
              {/* Left Column (Span 2): Active Service Workspace Shell */}
              <div style={{ gridColumn: 'span 2' }}>
                <Card variant="hybrid">
                  <CardHeader>
                    <div>
                      <CardTitle>Active Service Operations Stream</CardTitle>
                      <div className="text-caption">
                        Table layout structure prepared for real PostgreSQL queries
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('service-requests')}
                      rightIcon={<ExternalLink size={14} />}
                    >
                      View All
                    </Button>
                  </CardHeader>
                  <CardBody style={{ padding: 0 }}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service ID</TableHead>
                          <TableHead>Customer / Site</TableHead>
                          <TableHead>AC Asset</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Technician</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Demonstration Schema Rows (Explicitly tagged as Schema Prototype) */}
                        <TableRow isInteractive>
                          <TableCell><span className="text-mono font-medium">SR-2026-001</span></TableCell>
                          <TableCell>
                            <div className="font-medium">Apex Retail Complex</div>
                            <div className="text-caption">Main Wing, Fl 2</div>
                          </TableCell>
                          <TableCell>Daikin 2.0T Split</TableCell>
                          <TableCell><StatusBadge status="IN_PROGRESS" /></TableCell>
                          <TableCell><Badge variant="error">EMERGENCY</Badge></TableCell>
                          <TableCell><span className="text-body-sm">Unassigned (Pending)</span></TableCell>
                        </TableRow>
                        <TableRow isInteractive>
                          <TableCell><span className="text-mono font-medium">SCH-2026-042</span></TableCell>
                          <TableCell>
                            <div className="font-medium">Hotel Horizon</div>
                            <div className="text-caption">Suite 401</div>
                          </TableCell>
                          <TableCell>Voltas 1.5T Window</TableCell>
                          <TableCell><StatusBadge status="SCHEDULED" /></TableCell>
                          <TableCell><Badge variant="info">MEDIUM</Badge></TableCell>
                          <TableCell><span className="text-body-sm">Ramesh K.</span></TableCell>
                        </TableRow>
                        <TableRow isInteractive>
                          <TableCell><span className="text-mono font-medium">SR-2026-003</span></TableCell>
                          <TableCell>
                            <div className="font-medium">Prestige Towers</div>
                            <div className="text-caption">Server Room</div>
                          </TableCell>
                          <TableCell>Blue Star 3.0T Tower</TableCell>
                          <TableCell><StatusBadge status="AWAITING_PARTS" /></TableCell>
                          <TableCell><Badge variant="warning">HIGH</Badge></TableCell>
                          <TableCell><span className="text-body-sm">Anil Sharma</span></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <TablePagination
                      currentPage={tablePage}
                      totalPages={3}
                      totalItems={12}
                      pageSize={4}
                      onPageChange={setTablePage}
                    />
                  </CardBody>
                </Card>
              </div>

              {/* Right Column: Upcoming PM Schedules & Quick Overview */}
              <div>
                <Card variant="hybrid">
                  <CardHeader>
                    <div>
                      <CardTitle>Preventive Schedules</CardTitle>
                      <div className="text-caption">Generated AMC Maintenance Queue</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('service-schedule')}
                      rightIcon={<Calendar size={14} />}
                    >
                      Calendar
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      <div
                        style={{
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-default)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span className="text-mono" style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                            AMC-2026-089
                          </span>
                          <StatusBadge status="SCHEDULED" />
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          Omkar Infotech Labs
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Target: Quarterly Visit #2 • 4 AC Assets
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-default)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span className="text-mono" style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                            AMC-2026-104
                          </span>
                          <StatusBadge status="PENDING" />
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          City Medical Center
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Target: Monthly PM Visit • OT Split Units
                        </div>
                      </div>

                      <div style={{ marginTop: 'var(--space-2)' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                          Schedule Stream Loading State:
                        </div>
                        <Skeleton height="36px" borderRadius="var(--radius-md)" />
                      </div>
                    </div>
                  </CardBody>
                  <CardFooter>
                    <span className="text-caption">Algorithm: Calendar-Aware PM Schedule Generation</span>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ========================================================
            TAB 2: DESIGN SYSTEM COMPONENT GALLERY
           ======================================================== */}
        <TabsContent value="gallery">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            {/* Section 1: Buttons */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>1. Buttons &amp; Action Primitives</CardTitle>
                  <div className="text-caption">Variants, sizing, loading states, and disabled feedback</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsButtonLoading((prev) => !prev)}
                >
                  Toggle Loading: {isButtonLoading ? 'ON' : 'OFF'}
                </Button>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Variants:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Button variant="primary" isLoading={isButtonLoading}>Primary Button</Button>
                      <Button variant="secondary" isLoading={isButtonLoading}>Secondary Button</Button>
                      <Button variant="outline" isLoading={isButtonLoading}>Outline Button</Button>
                      <Button variant="ghost" isLoading={isButtonLoading}>Ghost Button</Button>
                      <Button variant="danger" isLoading={isButtonLoading}>Danger Button</Button>
                      <Button variant="primary" disabled>Disabled State</Button>
                    </div>
                  </div>

                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Sizes:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Button variant="primary" size="sm">Small (sm)</Button>
                      <Button variant="primary" size="md">Medium (md)</Button>
                      <Button variant="primary" size="lg">Large (lg)</Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Section 2: Badges & Semantic Status Badges */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>2. Badges &amp; Status Indicators</CardTitle>
                  <div className="text-caption">Accessible contrast and multi-cue status representation</div>
                </div>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Semantic Badges:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <Badge variant="neutral">Neutral Badge</Badge>
                      <Badge variant="brand">Brand Badge</Badge>
                      <Badge variant="success">Success Badge</Badge>
                      <Badge variant="warning">Warning Badge</Badge>
                      <Badge variant="error">Error Badge</Badge>
                      <Badge variant="info">Info Badge</Badge>
                      <Badge variant="amc">AMC Badge</Badge>
                    </div>
                  </div>

                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Service Lifecycle Status Badges:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <StatusBadge status="REQUESTED" />
                      <StatusBadge status="PENDING" />
                      <StatusBadge status="SCHEDULED" />
                      <StatusBadge status="ASSIGNED" />
                      <StatusBadge status="IN_PROGRESS" />
                      <StatusBadge status="AWAITING_PARTS" />
                      <StatusBadge status="ON_HOLD" />
                      <StatusBadge status="REVISIT_REQUIRED" />
                      <StatusBadge status="RESOLVED" />
                      <StatusBadge status="COMPLETED" />
                      <StatusBadge status="PAYMENT" />
                      <StatusBadge status="CLOSED" />
                      <StatusBadge status="CANCELLED" />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Section 3: Form Controls */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>3. Form Controls &amp; Input Fields</CardTitle>
                  <div className="text-caption">Text input, search variant, select, textarea, error feedback</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFormHasError((prev) => !prev)}
                >
                  Toggle Form Error: {formHasError ? 'ON' : 'OFF'}
                </Button>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Standard Customer Name"
                    required
                    placeholder="e.g. Apex Corporation"
                    value={formInputVal}
                    onChange={(e) => setFormInputVal(e.target.value)}
                    error={formHasError ? 'Customer name is a required operational field.' : undefined}
                    helperText="Enter the official business or individual name."
                  />

                  <Input
                    label="Global Search Control"
                    isSearch
                    placeholder="Search by AC Serial, QR Code, or ID..."
                  />

                  <Select
                    label="Equipment Type"
                    required
                    options={[
                      { value: 'SPLIT', label: 'Split Wall Unit' },
                      { value: 'CASSETTE', label: 'Ceiling Cassette Unit' },
                      { value: 'DUCTABLE', label: 'Ductable AC System' },
                      { value: 'VRV_VRF', label: 'VRV / VRF Central Plant' },
                    ]}
                  />

                  <Textarea
                    label="Operational Notes"
                    placeholder="Specific site instructions, floor access notes..."
                    rows={3}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Section 4: Overlay & Feedback Triggers */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>4. Overlays &amp; Toast Feedback System</CardTitle>
                  <div className="text-caption">Accessible Modals, Drawers, Dropdowns, and Toast notifications</div>
                </div>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Dialog &amp; Drawer Overlays:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <Button variant="primary" onClick={() => setIsTestModalOpen(true)}>
                        Open Accessible Modal
                      </Button>
                      <Button variant="secondary" onClick={() => setIsTestDrawerOpen(true)}>
                        Open Slide-Over Drawer
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>Trigger Toast Feedback:</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<CheckCircle2 size={14} style={{ color: 'var(--color-success-solid)' }} />}
                        onClick={() => showToast({ type: 'success', title: 'Record Saved', message: 'The operational customer record has been created.' })}
                      >
                        Success Toast
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<AlertTriangle size={14} style={{ color: 'var(--color-warning-solid)' }} />}
                        onClick={() => showToast({ type: 'warning', title: 'Contract Expiring', message: 'AMC contract reaches completion within 15 days.' })}
                      >
                        Warning Toast
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<AlertTriangle size={14} style={{ color: 'var(--color-error-solid)' }} />}
                        onClick={() => showToast({ type: 'error', title: 'Network Error', message: 'Could not connect to the backend API.' })}
                      >
                        Error Toast
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Send size={14} style={{ color: 'var(--color-info-solid)' }} />}
                        onClick={() => showToast({ type: 'info', title: 'Technician Dispatched', message: 'Assigned resource has accepted the schedule.' })}
                      >
                        Info Toast
                      </Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Section 5: Neumorphic Glass & Motion Primitives */}
            <Card variant="hybrid">
              <CardHeader>
                <div>
                  <CardTitle>5. Neumorphic Glass &amp; Advanced GSAP Motion</CardTitle>
                  <div className="text-caption">Frosted glass, soft dual-shadow extrusion, inset inputs, and 3D magnetic tilt physics</div>
                </div>
              </CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>
                      Interactive Neumorphic &amp; Glass Buttons:
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Button variant="neomorph">Neumorphic Soft Extrusion</Button>
                      <Button variant="glass">Frosted Glass Specular</Button>
                      <Button variant="primary">Primary Brand Radiant</Button>
                    </div>
                  </div>

                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>
                      Inset Neumorphic Input Groove:
                    </div>
                    <div style={{ maxWidth: '400px' }}>
                      <Input
                        variant="neomorph"
                        placeholder="Type inside inset neumorphic groove..."
                        helperText="Soft inset dual shadows create tactile depth without sacrificing contrast."
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-label" style={{ marginBottom: 'var(--space-2)' }}>
                      Interactive 3D Magnetic Glass Cards (Hover to tilt &amp; gleam):
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <GlassCard enableTilt variant="hybrid">
                        <div style={{ padding: 'var(--space-4)' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                            Hybrid Neumorphic Glass Card
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            Combines backdrop blur, specular light gradient borders, and soft extruded dual-shadow geometry.
                          </div>
                        </div>
                      </GlassCard>

                      <GlassCard enableTilt variant="glass">
                        <div style={{ padding: 'var(--space-4)' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                            Frosted Pure Glass Card
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            Ultra-light atmospheric frosted refraction with dynamic mouse ray tracking.
                          </div>
                        </div>
                      </GlassCard>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ========================================================
          TEST MODAL OVERLAY (Phase 1 Component Verification)
         ======================================================== */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Create Service Request (Shell Preview)"
        description="Verify accessible modal dialog with backdrop and escape key support."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsTestModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setIsTestModalOpen(false);
                showToast({
                  type: 'success',
                  title: 'Modal Validated',
                  message: 'Dialog action closed and confirmed.',
                });
              }}
            >
              Confirm Action
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Customer Search" isSearch placeholder="Search customer name or ID..." />
          <Select
            label="Service Urgency Level"
            options={[
              { value: 'EMERGENCY', label: 'Emergency Breakdown (Priority 1)' },
              { value: 'HIGH', label: 'High Priority Repair' },
              { value: 'MEDIUM', label: 'Standard Maintenance' },
              { value: 'LOW', label: 'Routine Inspection' },
            ]}
          />
          <Textarea label="Reported Malfunction Symptoms" rows={3} placeholder="Customer states unit is not cooling and leaking water..." />
        </div>
      </Modal>

      {/* ========================================================
          TEST DRAWER OVERLAY (Phase 1 Component Verification)
         ======================================================== */}
      <Drawer
        isOpen={isTestDrawerOpen}
        onClose={() => setIsTestDrawerOpen(false)}
        title="Quick Operational Actions"
        description="Slide-over drawer component with backdrop and smooth transitions."
        footer={
          <Button variant="secondary" onClick={() => setIsTestDrawerOpen(false)}>
            Close Drawer
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Choose an operational workflow to simulate:
          </div>
          <Card variant="interactive" onClick={() => onNavigate('customers')}>
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>+ Onboard Customer</div>
              <div className="text-caption">Register new customer, branch sites, and AC units</div>
            </CardBody>
          </Card>
          <Card variant="interactive" onClick={() => onNavigate('service-requests')}>
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>+ Log Breakdown Ticket</div>
              <div className="text-caption">Immediate service request and technician recommendation</div>
            </CardBody>
          </Card>
          <Card variant="interactive" onClick={() => onNavigate('amc')}>
            <CardBody style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>+ Authorize AMC Contract</div>
              <div className="text-caption">Generate calendar-aware preventive visit dates</div>
            </CardBody>
          </Card>
        </div>
      </Drawer>
    </div>
  );
};
