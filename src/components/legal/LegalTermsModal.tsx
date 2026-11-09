import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, Database, PhoneCall, Printer, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  LEGAL_ENTITIES,
  GRIEVANCE_OFFICER,
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_SERVICE_SECTIONS,
  SECURITY_STANDARDS_SECTIONS,
  COOKIE_STORAGE_SECTIONS,
} from '@/config/legalTerms';

export type LegalTab = 'privacy' | 'terms' | 'security' | 'storage' | 'grievance';

export interface LegalTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export function LegalTermsModal({
  isOpen,
  onClose,
  initialTab = 'privacy',
}: LegalTermsModalProps) {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  // Sync initial tab when opened
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Legal, Privacy & Security Framework"
      description="Official compliance framework under DPDP Act 2023 & Information Technology Act 2000."
      maxWidth="860px"
      footer={
        <div className="flex w-full items-center justify-between gap-3 pt-2">
          <div className="text-xs text-brand-secondary">
            Last Updated: November 2026 · Extreme Sales & Services
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4" />
              <span>Print Terms</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Entity Summary Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-surface-raised border border-brand-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase">
                Data Fiduciary & Commercial Entity
              </span>
            </div>
            <p className="text-xs font-bold text-brand-primary">{LEGAL_ENTITIES.commercial.name}</p>
            <p className="text-[11px] text-brand-secondary leading-relaxed">
              GSTIN: <span className="font-mono text-brand-primary">{LEGAL_ENTITIES.commercial.gstin}</span> · {LEGAL_ENTITIES.commercial.phone}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
                Data Processor & Platform
              </span>
            </div>
            <p className="text-xs font-bold text-brand-primary">{LEGAL_ENTITIES.platform.name}</p>
            <p className="text-[11px] text-brand-secondary leading-relaxed">
              Proprietary HVAC field operations and maintenance workflow engine.
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-brand-border">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'privacy'
                ? 'bg-brand-primary text-surface-canvas shadow-sm font-semibold'
                : 'text-brand-secondary hover:text-brand-primary hover:bg-surface-raised'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy Policy (DPDP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'terms'
                ? 'bg-brand-primary text-surface-canvas shadow-sm font-semibold'
                : 'text-brand-secondary hover:text-brand-primary hover:bg-surface-raised'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Terms of Service</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'security'
                ? 'bg-brand-primary text-surface-canvas shadow-sm font-semibold'
                : 'text-brand-secondary hover:text-brand-primary hover:bg-surface-raised'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Security Architecture</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'storage'
                ? 'bg-brand-primary text-surface-canvas shadow-sm font-semibold'
                : 'text-brand-secondary hover:text-brand-primary hover:bg-surface-raised'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Storage & Cookies</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('grievance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'grievance'
                ? 'bg-brand-primary text-surface-canvas shadow-sm font-semibold'
                : 'text-brand-secondary hover:text-brand-primary hover:bg-surface-raised'
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span>Grievance Redressal</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="max-h-[52vh] overflow-y-auto pr-1.5 space-y-4 text-xs leading-relaxed text-brand-primary">
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px] text-brand-primary">
                <p className="font-semibold text-blue-600 dark:text-blue-400 mb-1">
                  Compliance Notice under Digital Personal Data Protection Act, 2023 (DPDP Act)
                </p>
                <p className="text-brand-secondary">
                  This Privacy Policy informs you about what personal data is processed, the lawful grounds of processing, data storage measures, and your legal rights as a Data Principal under Indian law.
                </p>
              </div>

              {PRIVACY_POLICY_SECTIONS.map((sec) => (
                <div key={sec.id} className="p-4 rounded-xl bg-surface-raised border border-brand-border space-y-2">
                  <h4 className="text-xs font-bold text-brand-primary tracking-wide">{sec.title}</h4>
                  <p className="text-[11px] text-brand-secondary italic">{sec.summary}</p>
                  <ul className="space-y-1.5 mt-2">
                    {sec.content.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[11px] text-brand-primary">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                  Commercial Terms & Electronic Agreement
                </p>
                <p className="text-brand-secondary">
                  These terms govern all air conditioning repair, preventive maintenance visits, spare replacements, and AMC contracts executed by Extreme Sales & Services via the Place Your Service platform.
                </p>
              </div>

              {TERMS_OF_SERVICE_SECTIONS.map((sec) => (
                <div key={sec.id} className="p-4 rounded-xl bg-surface-raised border border-brand-border space-y-2">
                  <h4 className="text-xs font-bold text-brand-primary tracking-wide">{sec.title}</h4>
                  <p className="text-[11px] text-brand-secondary italic">{sec.summary}</p>
                  <ul className="space-y-1.5 mt-2">
                    {sec.content.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg text-[11px] text-brand-primary">
                <p className="font-semibold text-purple-600 dark:text-purple-400 mb-1">
                  Defense-in-Depth Information Security Standards
                </p>
                <p className="text-brand-secondary">
                  Technical safeguards implemented across our application layer, REST APIs, database tiers, and field logging systems.
                </p>
              </div>

              {SECURITY_STANDARDS_SECTIONS.map((sec) => (
                <div key={sec.id} className="p-4 rounded-xl bg-surface-raised border border-brand-border space-y-2">
                  <h4 className="text-xs font-bold text-brand-primary tracking-wide">{sec.title}</h4>
                  <p className="text-[11px] text-brand-secondary italic">{sec.summary}</p>
                  <ul className="space-y-1.5 mt-2">
                    {sec.content.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-4">
              {COOKIE_STORAGE_SECTIONS.map((sec) => (
                <div key={sec.id} className="p-4 rounded-xl bg-surface-raised border border-brand-border space-y-2">
                  <h4 className="text-xs font-bold text-brand-primary tracking-wide">{sec.title}</h4>
                  <p className="text-[11px] text-brand-secondary italic">{sec.summary}</p>
                  <ul className="space-y-1.5 mt-2">
                    {sec.content.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-primary shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'grievance' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface-raised border border-brand-border space-y-3">
                <h4 className="text-xs font-bold text-brand-primary tracking-wide flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-blue-500" />
                  <span>Designated Grievance Redressal Officer</span>
                </h4>
                <p className="text-xs text-brand-secondary leading-relaxed">
                  Pursuant to Section 12(3) of the Digital Personal Data Protection Act, 2023, you may address any personal data concerns, correction requests, or grievances to:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-surface-sunken border border-brand-border space-y-1">
                    <p className="text-[10px] font-semibold text-brand-secondary uppercase">Officer Title</p>
                    <p className="text-xs font-bold text-brand-primary">{GRIEVANCE_OFFICER.title}</p>
                    <p className="text-[11px] text-brand-secondary">{GRIEVANCE_OFFICER.entity}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-surface-sunken border border-brand-border space-y-1">
                    <p className="text-[10px] font-semibold text-brand-secondary uppercase">Direct Channels</p>
                    <p className="text-xs font-semibold text-brand-primary">
                      <a href={`mailto:${GRIEVANCE_OFFICER.email}`} className="text-blue-500 hover:underline">
                        {GRIEVANCE_OFFICER.email}
                      </a>
                    </p>
                    <p className="text-[11px] text-brand-secondary">{GRIEVANCE_OFFICER.phone}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-sunken border border-brand-border text-[11px] space-y-1">
                  <p className="font-semibold text-brand-primary">Office Postal Address:</p>
                  <p className="text-brand-secondary">{GRIEVANCE_OFFICER.address}</p>
                  <p className="text-[10px] text-brand-secondary pt-1">
                    Statutory Resolution Window: <span className="font-semibold text-brand-primary">{GRIEVANCE_OFFICER.resolutionTimeframe}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
