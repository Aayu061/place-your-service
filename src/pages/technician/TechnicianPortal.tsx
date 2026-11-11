import { useState, useEffect } from 'react';
import { technicianApi, TechUser } from '@/services/technicianApi';
import { TechnicianLogin } from './TechnicianLogin';
import { TechnicianLayout } from '@/layouts/TechnicianLayout';
import { TechnicianDashboard } from './TechnicianDashboard';
import { TechnicianServiceReportForm } from './TechnicianServiceReportForm';
import { TechnicianProfile } from './TechnicianProfile';
import { TechnicianAnalytics } from './TechnicianAnalytics';

export interface TechnicianPortalProps {
  onSwitchToAdmin: () => void;
}

export function TechnicianPortal({ onSwitchToAdmin }: TechnicianPortalProps) {
  const [token, setToken] = useState<string | null>(technicianApi.getToken());
  const [tech, setTech] = useState<TechUser | null>(technicianApi.getStoredTech());
  const [currentTab, setCurrentTab] = useState<'jobs' | 'analytics' | 'completed' | 'profile' | 'report'>('jobs');
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    technicianApi
      .getProfile()
      .then((profile) => {
        setTech(profile);
      })
      .catch(() => {
        technicianApi.clearSession();
        setToken(null);
        setTech(null);
      });
  }, [token]);

  const handleLoginSuccess = () => {
    setToken(technicianApi.getToken());
    setTech(technicianApi.getStoredTech());
    setCurrentTab('jobs');
  };

  const handleLogout = () => {
    technicianApi.clearSession();
    setToken(null);
    setTech(null);
    setCurrentTab('jobs');
    setActiveScheduleId(null);
  };

  if (!token || !tech) {
    return (
      <TechnicianLogin
        onLoginSuccess={handleLoginSuccess}
        onSwitchToAdmin={onSwitchToAdmin}
      />
    );
  }

  return (
    <TechnicianLayout
      activeTab={currentTab === 'report' ? 'jobs' : currentTab}
      onTabChange={(tab) => {
        setCurrentTab(tab);
        setActiveScheduleId(null);
      }}
      onLogout={handleLogout}
      tech={tech}
      onTechChange={(updated) => setTech(updated)}
    >
      {currentTab === 'report' && activeScheduleId ? (
        <TechnicianServiceReportForm
          scheduleId={activeScheduleId}
          onBack={() => {
            setActiveScheduleId(null);
            setCurrentTab('jobs');
          }}
          onSuccess={() => {
            setActiveScheduleId(null);
            setCurrentTab('jobs');
          }}
        />
      ) : currentTab === 'profile' ? (
        <TechnicianProfile
          onLogout={handleLogout}
          onBackToJobs={() => setCurrentTab('jobs')}
        />
      ) : currentTab === 'analytics' ? (
        <TechnicianAnalytics />
      ) : (
        <TechnicianDashboard
          filterTab={currentTab === 'completed' ? 'completed' : 'jobs'}
          onStartReport={(scheduleId) => {
            setActiveScheduleId(scheduleId);
            setCurrentTab('report');
          }}
        />
      )}
    </TechnicianLayout>
  );
}
