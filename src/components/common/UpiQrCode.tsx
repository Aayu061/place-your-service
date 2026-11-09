import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildUpiPaymentUri, COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';

export interface UpiQrCodeProps {
  amount?: number | null;
  note?: string;
  size?: number;
  className?: string;
  showScanText?: boolean;
  showDetails?: boolean;
}

export const UpiQrCode: React.FC<UpiQrCodeProps> = ({
  amount,
  note,
  size = 110,
  className = '',
  showScanText = true,
  showDetails = false,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numAmount = amount != null && !isNaN(Number(amount)) ? Number(amount) : 0;
  const upiUri = buildUpiPaymentUri(numAmount, note);

  useEffect(() => {
    let isMounted = true;

    QRCode.toDataURL(upiUri, {
      width: size * 2, // render at 2x for sharp retina / high-DPI print
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to generate UPI QR code:', err);
          setError('Unable to render QR');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [upiUri, size]);

  return (
    <div
      className={`pys-upi-qr-container ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: '#ffffff',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          padding: '4px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`Scan & Pay ₹${numAmount > 0 ? numAmount.toFixed(2) : ''} via UPI`}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'contain',
            }}
          />
        ) : error ? (
          <div style={{ fontSize: '10px', color: '#dc2626', padding: '4px' }}>{error}</div>
        ) : (
          <div style={{ fontSize: '10px', color: '#64748b' }}>Generating...</div>
        )}
      </div>

      {showScanText && (
        <div style={{ marginTop: '4px', fontSize: '10px', fontWeight: 600, color: '#334155' }}>
          {numAmount > 0 ? `Scan & Pay ₹${numAmount.toLocaleString('en-IN')}` : 'Scan to Pay via UPI'}
        </div>
      )}

      {showDetails && (
        <div style={{ marginTop: '2px', fontSize: '9px', color: '#64748b' }}>
          UPI: {COMPANY_BANK_DETAILS.upiId}
        </div>
      )}
    </div>
  );
};

