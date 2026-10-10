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

        .pys-signature-box {
          margin-top: 36px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
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
          <table className="pys-table">
            <thead>
              <tr>
                <th>Asset Tag</th>
                <th>Brand / Model</th>
                <th>Location</th>
                <th>Findings / Work Performed</th>
                <th>Outcome</th>
                <th>Condition</th>
              </tr>
            </thead>
            <tbody>
              {report.assets.map((asset, idx) => (
                <tr key={asset.id || idx}>
                  <td style={{ fontWeight: 600 }}>{asset.assetTag || 'N/A'}</td>
                  <td>
                    {asset.brand} {asset.modelNumber || ''}
                  </td>
                  <td>{asset.roomLocation || '-'}</td>
                  <td>
                    {asset.faultReported && (
                      <div style={{ fontSize: '11px', color: '#dc2626' }}>
                        <strong>Reported:</strong> {asset.faultReported}
                      </div>
                    )}
                    {asset.diagnosisFindings && (
                      <div style={{ fontSize: '11px', color: '#475569' }}>
                        <strong>Diagnosis:</strong> {asset.diagnosisFindings}
                      </div>
                    )}
                    {asset.workPerformed && (
                      <div style={{ fontSize: '12px' }}>
                        <strong>Work:</strong> {asset.workPerformed}
                      </div>
                    )}
                    {asset.refrigerantAdded && (
                      <div style={{ fontSize: '11px', color: '#0284c7' }}>
                        Gas Added: {asset.refrigerantQtyKg} kg
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: getOutcomeColor(asset.assetOutcome),
                      }}
                    >
                      {asset.assetOutcome}
                    </span>
                  </td>
                  <td>{asset.finalCondition || 'Normal'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
