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
      <div className="p-8 text-center text-xs text-brand-secondary">
        Loading technician profile...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onBackToJobs && (
        <button
          type="button"
          onClick={onBackToJobs}
          className="flex items-center gap-1.5 text-xs text-brand-secondary hover:text-brand-primary transition-colors font-medium cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Jobs</span>
        </button>
      )}

      {/* Profile Card */}
      <div className="bg-surface-raised border border-brand-border rounded-2xl p-5 shadow-xs text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-linear-to-tr from-brand-primary to-orange-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
          {profile?.name ? profile.name.charAt(0).toUpperCase() : 'T'}
        </div>
        <div>
          <h2 className="text-base font-extrabold text-brand-primary">{profile?.name}</h2>
          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-brand-primary/10 text-brand-primary">
            {profile?.technician_code || profile?.technicianCode}
          </span>
          <p className="text-xs text-brand-secondary mt-1">Extreme Sales &amp; Services Field Staff</p>
        </div>
      </div>

      {/* Details List */}
      <div className="bg-surface-raised border border-brand-border rounded-2xl p-4 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold text-brand-primary uppercase text-[10px] tracking-wider text-brand-secondary">
          Contact &amp; Identity
        </h3>

        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-sunken border border-brand-border">
          <Phone className="w-4 h-4 text-emerald-500" />
          <div>
            <span className="text-[10px] text-brand-secondary block">Registered Mobile</span>
            <span className="font-bold text-brand-primary">{profile?.phone || 'Not available'}</span>
          </div>
        </div>

        {profile?.email && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-sunken border border-brand-border">
            <Mail className="w-4 h-4 text-blue-500" />
            <div>
              <span className="text-[10px] text-brand-secondary block">Email</span>
              <span className="font-bold text-brand-primary">{profile.email}</span>
            </div>
          </div>
        )}

        {profile?.specializations?.length > 0 && (
          <div className="space-y-1 pt-1">
            <span className="text-[10px] text-brand-secondary block font-semibold">Specializations</span>
            <div className="flex flex-wrap gap-1">
              {profile.specializations.map((spec: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[11px] bg-surface-sunken border border-brand-border text-brand-primary"
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
        className="w-full py-3 px-4 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out of Field Portal</span>
      </button>
    </div>
  );
}
