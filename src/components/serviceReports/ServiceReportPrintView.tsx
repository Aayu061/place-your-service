import React from 'react';
import { ServiceVisitReport } from '@/domain/types';
import { formatDate } from '@/utils/formatters';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

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
    switch (type) {
      case 'DRY_SERVICE':
        return 'Dry Service';
      case 'JET_SERVICE':
        return 'Jet Service';
      case 'PUMPDOWN_SERVICE':
        return 'Pumpdown Service';
      default:
        return 'Not specified';
    }
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
            padding: 20px !important;
            border-radius: 0 !important;
          }
          .pys-asset-print-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .pys-signature-box {
            page-break-inside: avoid;
            break-inside: avoid;
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
          <div>
            <h1 className="pys-company-title">PLACE YOUR SERVICE</h1>
            <p className="pys-company-sub">HVAC Preventive Maintenance & Technical Service Report</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
              Service Operations Desk | ISO Compliant Maintenance Logs
            </p>
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
            <div className="pys-field-label">Customer Name & Code</div>
            <div className="pys-field-value">
              {report.customerName || 'N/A'}{' '}
              {report.customerCode && <span style={{ color: '#64748b' }}>({report.customerCode})</span>}
            </div>
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
            <p style={{ fontSize: '13px', margin: '4px 0', whiteSpace: 'pre-line' }}>{report.technicianRemarks}</p>
          </>
        )}

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
            <div className="pys-field-value">{report.technicianName}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Place Your Service Operational Staff
            </div>
            <div className="pys-sig-line">Technician Signature & Stamp</div>
          </div>
        </div>

        {/* Footer timestamp */}
        <div
          style={{
            marginTop: '30px',
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            borderTop: '1px solid #f1f5f9',
            paddingTop: '8px',
          }}
        >
          Generated on {new Date().toLocaleString()} by {report.createdByName || 'System'} | Place Your Service
          Enterprise Platform
        </div>
      </div>
    </div>
  );
};
