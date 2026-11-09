import { useState, useEffect } from 'react';
import { Phone, Mail, LogOut, ArrowLeft } from 'lucide-react';
import { technicianApi } from '@/services/technicianApi';

export interface TechnicianProfileProps {
  onLogout: () => void;
  onBackToJobs?: () => void;
}

export function TechnicianProfile({ onLogout, onBackToJobs }: TechnicianProfileProps) {
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    technicianApi
      .getProfile()
      .then((data) => setProfile(data))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogout = () => {
    technicianApi.clearSession();
    onLogout();
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Loading technician profile...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {onBackToJobs && (
        <button
          type="button"
          onClick={onBackToJobs}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Jobs</span>
        </button>
      )}

      {/* Profile Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xs)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-brand)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 'var(--text-2xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {profile?.name ? profile.name.charAt(0).toUpperCase() : 'T'}
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {profile?.name}
          </h2>
          <span
            style={{
              display: 'inline-block',
              marginTop: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'rgba(168, 72, 28, 0.1)',
              color: 'var(--color-brand)',
            }}
          >
            {profile?.technician_code || profile?.technicianCode}
          </span>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Extreme Sales &amp; Services Field Staff
          </p>
        </div>
      </div>

      {/* Details List */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          fontSize: 'var(--text-xs)',
        }}
      >
        <h3
          style={{
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: '10px',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          Contact &amp; Identity
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Phone size={16} style={{ color: '#16a34a' }} />
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Registered Mobile</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{profile?.phone || 'Not available'}</span>
          </div>
        </div>

        {profile?.email && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
            }}
          >
            <Mail size={16} style={{ color: '#2563eb' }} />
            <div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>Email</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{profile.email}</span>
            </div>
          </div>
        )}

        {profile?.specializations?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Specializations</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {profile.specializations.map((spec: string, i: number) => (
                <span
                  key={i}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Logout Action */}
      <button
        type="button"
        onClick={handleLogout}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-error-border)',
          backgroundColor: 'var(--color-error-bg)',
          color: 'var(--color-error-text)',
          fontWeight: 700,
          fontSize: 'var(--text-xs)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <LogOut size={16} />
        <span>Sign Out of Field Portal</span>
      </button>
    </div>
  );
}
