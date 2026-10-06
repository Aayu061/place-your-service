import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface ModuleShellPlaceholderProps {
  moduleId: string;
  moduleName: string;
  category: string;
  plannedPhase: string;
  description: string;
  plannedFeatures: string[];
  onBackToDashboard: () => void;
}

export const ModuleShellPlaceholder: React.FC<ModuleShellPlaceholderProps> = ({
  moduleName,
  category,
  plannedPhase,
  description,
  plannedFeatures,
  onBackToDashboard,
}) => {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Navigation breadcrumb and back button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToDashboard}
            leftIcon={<ArrowLeft size={16} />}
          >
            Back to Dashboard
          </Button>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <Badge variant="neutral">{category}</Badge>
          <Badge variant="brand">{plannedPhase}</Badge>
        </div>
      </div>

      {/* Main Announcement Card */}
      <Card variant="default">
        <CardHeader>
          <div>
            <CardTitle>{moduleName} Workspace</CardTitle>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
              Architectural Shell Ready — Scheduled for implementation in {plannedPhase}.
            </div>
          </div>
          <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            <span>Awaiting Backend Integration</span>
          </span>
        </CardHeader>
        <CardBody>
          <p style={{ marginBottom: 'var(--space-6)', maxWidth: '720px' }}>
            {description}
          </p>

          <div
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
              Planned Capabilities from DOCS Specification:
            </h4>
            <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-2)' }}>
              {plannedFeatures.map((feat, idx) => (
                <li
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-brand)' }} />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            style={{
              padding: 'var(--space-4)',
              borderLeft: '3px solid var(--color-warning-solid)',
              backgroundColor: 'var(--color-warning-bg)',
              borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-warning-text)',
            }}
          >
            <strong>Zero-Fake-Functionality Principle:</strong> In accordance with project policy, no synthetic business data or mock records are presented. Real PostgreSQL schemas and APIs will populate this interface in future development phases.
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
