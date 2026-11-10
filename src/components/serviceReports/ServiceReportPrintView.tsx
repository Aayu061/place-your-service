import React from 'react';
import { ServiceVisitReport } from '@/domain/types';
import { formatDate } from '@/utils/formatters';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { UpiQrCode } from '@/components/common/UpiQrCode';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';
import { LEGAL_DISCLAIMERS } from '@/config/legalTerms';
import { getPlannedServiceTypeLabel } from '@/domain/breakdownTypes';

interface ServiceReportPrintViewProps {
  report: ServiceVisitReport;
  onClose: () => void;
}

export const ServiceReportPrintView: React.FC<ServiceReportPrintViewProps> = ({ report, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const getOutcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'COMPLETED':
        return 'SERVICE COMPLETED';
      case 'PENDING_PARTS':
        return 'PENDING FOR PARTS';
      case 'PENDING_REPAIRS':
        return 'PENDING FOR REPAIRS';
      default:
        return outcome;
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'COMPLETED':
        return '#16a34a';
      case 'PENDING_PARTS':
        return '#d97706';
      case 'PENDING_REPAIRS':
        return '#dc2626';
      default:
        return '#4b5563';
    }
  };

  const getServiceTypeLabel = (type?: string | null) => {
    return getPlannedServiceTypeLabel(type);
  };

  return (
    <div className="pys-print-modal-overlay">
      <style>{`
        .pys-print-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          overflow-y: auto;
        }

        .pys-print-actions-bar {
          width: 100%;
          max-width: 800px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 16px;
        }

        .pys-print-document {
          width: 100%;
          max-width: 800px;
          background: #ffffff;
          color: #0f172a;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          padding: 40px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.5;
        }

        .pys-print-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }

        .pys-company-title {
          font-size: 24px;
          font-weight: 700;
          color: #0284c7;
          letter-spacing: -0.5px;
          margin: 0 0 4px 0;
        }

        .pys-company-sub {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }

        .pys-report-meta {
          text-align: right;
        }

        .pys-report-num {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
        }

        .pys-report-type-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 4px;
          background: #f1f5f9;
          color: #334155;
          margin-bottom: 4px;
        }

        .pys-section-title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          color: #475569;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          margin: 24px 0 12px 0;
        }

        .pys-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .pys-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
        }

        .pys-field-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        .pys-field-value {
          font-size: 14px;
          font-weight: 500;
          color: #0f172a;
        }

        .pys-outcome-banner {
          margin: 16px 0;
          padding: 12px 16px;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pys-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 13px;
        }

        .pys-table th {
          background: #f8fafc;
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid #cbd5e1;
          color: #475569;
          font-weight: 600;
        }

        .pys-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #e2e8f0;
          color: #1e293b;
        }

        .pys-asset-cards-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 10px;
        }

        .pys-asset-print-card {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          overflow: hidden;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .pys-asset-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
          padding: 8px 12px;
          border-bottom: 1px solid #e2e8f0;
          gap: 8px;
        }

        .pys-asset-card-tag {
          font-family: monospace, ui-monospace;
          font-weight: 700;
          color: #0284c7;
          font-size: 13px;
        }

        .pys-asset-card-model {
          font-weight: 600;
          color: #0f172a;
          font-size: 13px;
        }

        .pys-asset-location-pill {
          font-size: 11px;
          background: #f1f5f9;
          color: #475569;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }

        .pys-asset-outcome-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid;
          white-space: nowrap;
        }

        .pys-asset-condition-pill {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          background: #f1f5f9;
          color: #475569;
          white-space: nowrap;
        }

        .pys-asset-card-body {
          padding: 10px 12px;
        }

        .pys-serial-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pys-serial-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 6px 10px;
        }

        .pys-serial-label {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .pys-serial-val {
          font-family: monospace, ui-monospace;
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
          word-break: break-all;
        }

        .pys-asset-specs-bar {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          background: #f1f5f9;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 11px;
          margin-bottom: 8px;
          border: 1px solid #e2e8f0;
        }

        .pys-spec-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .pys-spec-k {
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 10px;
        }

        .pys-spec-v {
          color: #1e293b;
          font-weight: 600;
        }

        .pys-asset-findings-box {
          padding-top: 2px;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pys-finding-row {
          line-height: 1.4;
          color: #334155;
        }

        .pys-signature-box {
          margin-top: 36px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .pys-sig-line {
          margin-top: 40px;
          border-top: 1px dashed #94a3b8;
          padding-top: 4px;
          font-size: 12px;
          color: #64748b;
          text-align: center;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body * {
            visibility: hidden;
          }
          .pys-print-modal-overlay {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .pys-print-actions-bar {
            display: none !important;
          }
          .pys-print-document,
          .pys-print-document * {
            visibility: visible;
          }
          .pys-print-document {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            box-shadow: none !important;
            padding: 10px 14px !important;
            border-radius: 0 !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
          }
          .pys-company-title {
            font-size: 18px !important;
            margin: 0 0 2px 0 !important;
          }
          .pys-print-header {
            padding-bottom: 8px !important;
            margin-bottom: 8px !important;
          }
          .pys-outcome-banner {
            margin: 6px 0 !important;
            padding: 5px 10px !important;
          }
          .pys-section-title {
            font-size: 11px !important;
            margin: 8px 0 4px 0 !important;
            padding-bottom: 3px !important;
          }
          .pys-grid-2, .pys-grid-3 {
            gap: 8px !important;
          }
          .pys-field-label {
            font-size: 9px !important;
          }
          .pys-field-value {
            font-size: 11px !important;
          }
          .pys-asset-cards-container {
            gap: 6px !important;
            margin-top: 6px !important;
          }
          .pys-asset-card-header {
            padding: 4px 8px !important;
          }
          .pys-asset-card-body {
            padding: 6px 8px !important;
          }
          .pys-serial-grid {
            gap: 6px !important;
            margin-bottom: 4px !important;
          }
          .pys-serial-box {
            padding: 3px 6px !important;
          }
          .pys-asset-specs-bar {
            padding: 3px 6px !important;
            margin-bottom: 4px !important;
            gap: 8px !important;
            font-size: 10px !important;
          }
          .pys-asset-print-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .pys-signature-box {
            margin-top: 12px !important;
            padding-top: 6px !important;
            page-break-inside: avoid;
            break-inside: avoid;
            gap: 20px !important;
          }
          .pys-sig-line {
            margin-top: 22px !important;
          }
        }
      `}</style>

      <div className="pys-print-actions-bar">
        <Button variant="secondary" onClick={onClose}>
          <X size={16} className="mr-1" /> Close
        </Button>
        <Button variant="primary" onClick={handlePrint}>
          <Printer size={16} className="mr-1" /> Print / Save as PDF
        </Button>
      </div>

      <div className="pys-print-document" id="pys-report-printable-content">
        {/* Header */}
        <div className="pys-print-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src={COMPANY_BANK_DETAILS.pysLogoUrl}
              alt="Place Your Service"
              style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <h1 className="pys-company-title">PLACE YOUR SERVICE</h1>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img
                  src={COMPANY_BANK_DETAILS.extremeLogoUrl}
                  alt={COMPANY_BANK_DETAILS.mainCompanyName}
                  style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                />
                <span>{COMPANY_BANK_DETAILS.mainCompanyName}</span>
              </div>
              <p className="pys-company-sub">HVAC Preventive Maintenance &amp; Technical Service Report</p>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '3px 0 0 0' }}>
                Office: {COMPANY_BANK_DETAILS.officeAddress} | Tel: +91 {COMPANY_BANK_DETAILS.phone} / +91 {COMPANY_BANK_DETAILS.altPhone}
              </p>
            </div>
          </div>
          <div className="pys-report-meta">
            <span className="pys-report-type-badge">
              {report.visitType === 'PREVENTIVE' ? 'AMC Preventive Maintenance' : 'Customer Service Request'}
            </span>
            <div className="pys-report-num">Report #{report.reportNumber}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Date: {formatDate(report.serviceDate)} {report.startTime && `| ${report.startTime}`}
              {report.endTime && ` - ${report.endTime}`}
            </div>
            {report.scheduleNumber && (
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Ref Appt: {report.scheduleNumber}
              </div>
            )}
            <div style={{ marginTop: '6px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Planned Service: </span>
                <span style={{ fontWeight: 700, color: '#334155' }}>{getServiceTypeLabel(report.plannedServiceType)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Performed Service: </span>
                <span style={{ fontWeight: 700, color: '#0284c7' }}>{getServiceTypeLabel(report.performedServiceType)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Outcome Banner */}
        <div
          className="pys-outcome-banner"
          style={{
            backgroundColor: `${getOutcomeColor(report.primaryOutcome)}15`,
            borderLeft: `4px solid ${getOutcomeColor(report.primaryOutcome)}`,
          }}
        >
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Primary Outcome:
            </span>
            <span
              style={{
                marginLeft: '8px',
                fontSize: '15px',
                fontWeight: 700,
                color: getOutcomeColor(report.primaryOutcome),
              }}
            >
              {getOutcomeLabel(report.primaryOutcome)}
            </span>
          </div>
          {report.followUpScheduleNumber && (
            <div style={{ fontSize: '12px', color: '#0284c7', fontWeight: 600 }}>
              Follow-up Scheduled: #{report.followUpScheduleNumber}
            </div>
          )}
        </div>

        {/* Originating / Resolving Follow-up Linkage Banner */}
        {(report.originatingReportNumber || report.resolvingReportNumber) && (
          <div
            style={{
              margin: '8px 0 16px 0',
              padding: '8px 14px',
              borderRadius: '6px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              fontSize: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            {report.originatingReportNumber && (
              <div>
                <span style={{ color: '#0369a1', fontWeight: 700 }}>Follow-up Revisit: </span>
                <span style={{ color: '#0c4a6e' }}>Addresses pending items from Report #{report.originatingReportNumber}</span>
              </div>
            )}
            {report.resolvingReportNumber && (
              <div>
                <span style={{ color: '#15803d', fontWeight: 700 }}>Resolved by Revisit: </span>
                <span style={{ color: '#14532d' }}>Report #{report.resolvingReportNumber}</span>
              </div>
            )}
          </div>
        )}

        {/* Service Type Deviation Justification */}
        {report.serviceTypeDeviationReason && (
          <div
            style={{
              margin: '12px 0 16px 0',
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderLeft: '4px solid #d97706',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Service Type Deviation Justification
            </div>
            <div style={{ fontSize: '12px', color: '#78350f', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.5 }}>
              &ldquo;{report.serviceTypeDeviationReason}&rdquo;
            </div>
          </div>
        )}

        {/* Customer & Technician Details */}
        <div className="pys-section-title">Customer & Service Attribution</div>
        <div className="pys-grid-2">
          <div>
            <div className="pys-field-label">Customer / Business Name</div>
            <div className="pys-field-value">
              {(report as any).companyName ? (
                <>
                  <div style={{ fontWeight: 800, color: '#0369a1' }}>{(report as any).companyName}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Attn: {report.customerName} {report.customerCode && `(${report.customerCode})`}
                  </div>
                </>
              ) : (
                <>
                  {report.customerName || 'N/A'}{' '}
                  {report.customerCode && <span style={{ color: '#64748b' }}>({report.customerCode})</span>}
                </>
              )}
            </div>
            {((report as any).gstNumber || (report as any).customerGstNumber) && (
              <div style={{ fontSize: '11.5px', color: '#0f172a', fontWeight: 700, marginTop: '2px' }}>
                GSTIN: <span style={{ color: '#0284c7', fontFamily: 'monospace' }}>{(report as any).gstNumber || (report as any).customerGstNumber}</span>
              </div>
            )}
            {(report.customerPhone || report.customerEmail) && (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {[report.customerPhone, report.customerEmail].filter(Boolean).join(' • ')}
              </div>
            )}
            <div className="pys-field-label" style={{ marginTop: '8px' }}>
              Site & Address
            </div>
            <div className="pys-field-value">{report.siteName}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{report.siteAddress}</div>
          </div>
          <div>
            <div className="pys-field-label">Assigned Technician</div>
            <div className="pys-field-value">
              {report.technicianName || 'N/A'}{' '}
              {report.technicianCode && <span style={{ color: '#64748b' }}>[{report.technicianCode}]</span>}
            </div>

            {report.assistantName && (
              <div style={{ marginTop: '8px' }}>
                <div className="pys-field-label">Assistant / Helper</div>
                <div className="pys-field-value">{report.assistantName}</div>
              </div>
            )}

            {report.amcContractNumber && (
              <div style={{ marginTop: '8px' }}>
                <div className="pys-field-label">Linked AMC Contract</div>
                <div className="pys-field-value">{report.amcContractNumber}</div>
              </div>
            )}
            {report.serviceRequestNumber && (
              <div style={{ marginTop: '8px' }}>
                <div className="pys-field-label">Service Request Ticket</div>
                <div className="pys-field-value">{report.serviceRequestNumber}</div>
              </div>
            )}
          </div>
        </div>

        {/* Covered AC Assets */}
        <div className="pys-section-title">AC Assets & Inspection Findings</div>
        {report.assets && report.assets.length > 0 ? (
          <div className="pys-asset-cards-container">
            {report.assets.map((asset, idx) => (
              <div key={asset.id || idx} className="pys-asset-print-card">
                <div className="pys-asset-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="pys-asset-card-tag">{asset.assetTag || 'N/A'}</span>
                    <span className="pys-asset-card-model">
                      {asset.brand} {asset.modelNumber || ''}
                    </span>
                    {(asset.floorLocation || asset.roomLocation) && (
                      <span className="pys-asset-location-pill">
                        {[asset.floorLocation, asset.roomLocation].filter(Boolean).join(' • ')}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className="pys-asset-outcome-pill"
                      style={{
                        backgroundColor: `${getOutcomeColor(asset.assetOutcome)}15`,
                        color: getOutcomeColor(asset.assetOutcome),
                        borderColor: `${getOutcomeColor(asset.assetOutcome)}40`,
                      }}
                    >
                      {asset.assetOutcome}
                    </span>
                    {asset.finalCondition && (
                      <span className="pys-asset-condition-pill">
                        Condition: {asset.finalCondition}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pys-asset-card-body">
                  {/* Equipment Identification (Highest Priority) */}
                  <div className="pys-serial-grid">
                    <div className="pys-serial-box">
                      <div className="pys-serial-label">Indoor Unit (IDU) Serial #</div>
                      <div className="pys-serial-val">
                        {asset.indoorSerialNumber || (asset.serialNumber && !asset.outdoorSerialNumber ? asset.serialNumber : 'Not recorded')}
                      </div>
                    </div>
                    <div className="pys-serial-box">
                      <div className="pys-serial-label">Outdoor Unit (ODU) Serial #</div>
                      <div className="pys-serial-val">
                        {asset.outdoorSerialNumber || 'Not recorded'}
                      </div>
                    </div>
                  </div>

                  {/* Technical Specifications Bar */}
                  <div className="pys-asset-specs-bar">
                    <div className="pys-spec-item">
                      <span className="pys-spec-k">Type / Tech:</span>
                      <span className="pys-spec-v">
                        {[asset.acType, asset.technology].filter(Boolean).join(' • ') || 'Standard AC'}
                      </span>
                    </div>
                    <div className="pys-spec-item">
                      <span className="pys-spec-k">Capacity / Rating:</span>
                      <span className="pys-spec-v">
                        {[asset.capacityTons ? `${asset.capacityTons} TR` : null, asset.starRating].filter(Boolean).join(' • ') || '-'}
                      </span>
                    </div>
                    <div className="pys-spec-item">
                      <span className="pys-spec-k">Refrigerant:</span>
                      <span className="pys-spec-v">{asset.refrigerantType || '-'}</span>
                    </div>
                  </div>

                  {/* Findings and Work Performed */}
                  <div className="pys-asset-findings-box">
                    {asset.faultReported && (
                      <div className="pys-finding-row">
                        <strong style={{ color: '#dc2626' }}>Reported Complaint:</strong> {asset.faultReported}
                      </div>
                    )}
                    {asset.diagnosisFindings && (
                      <div className="pys-finding-row">
                        <strong>Inspection Diagnosis:</strong> {asset.diagnosisFindings}
                      </div>
                    )}
                    {asset.workPerformed && (
                      <div className="pys-finding-row">
                        <strong>Work Performed:</strong> {asset.workPerformed}
                      </div>
                    )}
                    {asset.refrigerantAdded && (
                      <div className="pys-finding-row" style={{ color: '#0284c7', fontWeight: 600 }}>
                        Gas Top-up Added: {asset.refrigerantQtyKg ?? 0} kg
                      </div>
                    )}
                    {asset.notes && (
                      <div className="pys-finding-row" style={{ color: '#64748b', fontStyle: 'italic' }}>
                        <strong>Notes:</strong> {asset.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#64748b' }}>No asset-specific details recorded.</div>
        )}

        {/* Work Description / Summary */}
        {report.workDescription && (
          <>
            <div className="pys-section-title">Work Description & Observations</div>
            <p style={{ fontSize: '13px', margin: '4px 0', whiteSpace: 'pre-line' }}>{report.workDescription}</p>
          </>
        )}

        {/* Outcome Details: Pending Parts */}
        {report.primaryOutcome === 'PENDING_PARTS' && report.items && report.items.length > 0 && (
          <>
            <div className="pys-section-title" style={{ color: '#d97706' }}>
              Pending Parts Requirement
            </div>
            <table className="pys-table">
              <thead>
                <tr>
                  <th>Part Name</th>
                  <th>Part #</th>
                  <th>Qty</th>
                  <th>Reason Required</th>
                  <th>Condition</th>
                  <th>Revisit Required</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                    <td>{item.partNumber || '-'}</td>
                    <td>{item.quantity}</td>
                    <td>{item.reason}</td>
                    <td>{item.acCondition || '-'}</td>
                    <td>{item.isRevisitRequired ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Outcome Details: Pending Repairs */}
        {report.primaryOutcome === 'PENDING_REPAIRS' && report.items && report.items.length > 0 && (
          <>
            <div className="pys-section-title" style={{ color: '#dc2626' }}>
              Pending Repairs & Action Items
            </div>
            <table className="pys-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Fault / Repair Required</th>
                  <th style={{ width: '40%' }}>Reason Pending</th>
                  <th style={{ width: '25%' }}>Approvals & Requirements</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ fontWeight: 600 }}>{item.itemName || item.diagnosis || '-'}</td>
                    <td>{item.reason}</td>
                    <td>
                      {item.isApprovalRequired && <span style={{ color: '#d97706' }}>Approval Required; </span>}
                      {item.isSpecialistRequired && <span style={{ color: '#6366f1' }}>Specialist Required; </span>}
                      {item.isRevisitRequired && <span style={{ color: '#2563eb' }}>Revisit Required</span>}
                      {!item.isApprovalRequired && !item.isSpecialistRequired && !item.isRevisitRequired && 'Standard Revisit'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Technician Remarks */}
        {report.technicianRemarks && (
          <>
            <div className="pys-section-title">Technician Remarks & Recommendations</div>
            <p style={{ fontSize: '12px', margin: '3px 0', whiteSpace: 'pre-line' }}>{report.technicianRemarks}</p>
          </>
        )}

        {/* Payment & Settlement Details */}
        <div className="pys-section-title">Payment & Settlement Details</div>
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            backgroundColor: '#f8fafc',
            padding: '6px 10px',
            display: 'grid',
            gridTemplateColumns: '1.4fr 1.6fr auto',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          {/* Col 1: Settlement Status & Amounts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
            <div>
              <div className="pys-field-label">Status</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '1px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: report.paymentCollected
                      ? '#dcfce7'
                      : report.paymentAmount && report.paymentAmount > 0
                      ? '#fef3c7'
                      : '#f1f5f9',
                    color: report.paymentCollected
                      ? '#15803d'
                      : report.paymentAmount && report.paymentAmount > 0
                      ? '#b45309'
                      : '#475569',
                    border: `1px solid ${
                      report.paymentCollected
                        ? '#bbf7d0'
                        : report.paymentAmount && report.paymentAmount > 0
                        ? '#fde68a'
                        : '#e2e8f0'
                    }`,
                  }}
                >
                  {report.paymentCollected
                    ? 'PAID ON SITE'
                    : report.paymentAmount && report.paymentAmount > 0
                    ? 'PENDING / BALANCED'
                    : 'INCLUDED IN AMC'}
                </span>
              </div>
            </div>

            <div>
              <div className="pys-field-label">Total Amount</div>
              <div className="pys-field-value" style={{ fontWeight: 700, color: '#0f172a', fontSize: '12px' }}>
                ₹{(report.paymentAmount != null ? Number(report.paymentAmount) : 0).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            <div>
              <div className="pys-field-label">Payment Method</div>
              <div className="pys-field-value" style={{ fontSize: '11px' }}>
                {report.paymentCollected
                  ? report.paymentMethod === 'ONLINE'
                    ? `Online / UPI ${report.paymentReference ? `(${report.paymentReference})` : ''}`
                    : 'Cash Payment'
                  : report.paymentAmount && report.paymentAmount > 0
                  ? 'Awaiting Collection'
                  : 'Covered under Contract'}
              </div>
            </div>

            <div>
              <div className="pys-field-label">Balance Remaining</div>
              <div
                className="pys-field-value"
                style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color:
                    report.paymentCollected || !report.paymentAmount || report.paymentAmount === 0
                      ? '#16a34a'
                      : '#dc2626',
                }}
              >
                ₹
                {report.paymentCollected || !report.paymentAmount || report.paymentAmount === 0
                  ? '0.00'
                  : Number(report.paymentAmount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
              </div>
            </div>
          </div>

          {/* Col 2: Company Demo Bank Details */}
          <div
            style={{
              borderLeft: '1px solid #e2e8f0',
              paddingLeft: '10px',
              fontSize: '10.5px',
              color: '#334155',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700, color: '#0284c7', marginBottom: '2px', fontSize: '11px' }}>
              Company Bank & UPI Details
            </div>
            <div>
              <strong>A/C:</strong> {COMPANY_BANK_DETAILS.accountNumber} ({COMPANY_BANK_DETAILS.bankName})
            </div>
            <div>
              <strong>IFSC:</strong> {COMPANY_BANK_DETAILS.ifscCode} | <strong>Branch:</strong> {COMPANY_BANK_DETAILS.branchName}
            </div>
            <div>
              <strong>UPI ID:</strong> <span style={{ fontWeight: 600, color: '#0284c7' }}>{COMPANY_BANK_DETAILS.upiId}</span>
            </div>
          </div>

          {/* Col 3: Dynamic Amount-Encoded UPI QR Code */}
          <div
            style={{
              borderLeft: '1px solid #e2e8f0',
              paddingLeft: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UpiQrCode
              amount={
                report.paymentCollected || !report.paymentAmount || report.paymentAmount === 0
                  ? 0
                  : Number(report.paymentAmount)
              }
              note={`Report #${report.reportNumber || 'PYS'}`}
              size={64}
              showScanText={true}
              showDetails={false}
            />
          </div>
        </div>

        {/* Signatures & Customer Acknowledgement */}
        <div className="pys-signature-box">
          <div>
            <div className="pys-field-label">Customer / Site Representative</div>
            <div className="pys-field-value">{report.customerRepresentative || 'Not specified'}</div>
            {report.customerAcknowledgement && (
              <div style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic', marginTop: '4px' }}>
                "{report.customerAcknowledgement}"
              </div>
            )}
            <div className="pys-sig-line">Customer / Client Sign-off</div>
          </div>
          <div>
            <div className="pys-field-label">Attending Service Technician</div>
            <div className="pys-field-value">{report.technicianName || 'N/A'}</div>
            {report.assistantName && (
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                Assistant: {report.assistantName}
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Place Your Service Operational Staff
            </div>
            <div className="pys-sig-line">Technician Signature & Stamp</div>
          </div>
        </div>

        {/* Footer timestamp & legal disclaimer */}
        <div
          style={{
            marginTop: '30px',
            fontSize: '10px',
            color: '#64748b',
            textAlign: 'center',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '8px',
            lineHeight: 1.45,
          }}
        >
          <div>{LEGAL_DISCLAIMERS.serviceReportFooter}</div>
          <div style={{ marginTop: '3px', color: '#94a3b8' }}>
            Generated on {new Date().toLocaleString()} by {report.createdByName || 'System'} | Place Your Service
            Enterprise Platform · Extreme Sales &amp; Services
          </div>
        </div>
      </div>
    </div>
  );
};
