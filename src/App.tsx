import React from 'react';
import { AppShell } from '@/layouts/AppShell';
import { PhaseZeroOverview } from '@/pages/PhaseZeroOverview';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppShell>
        {({ currentRole }) => <PhaseZeroOverview currentRole={currentRole} />}
      </AppShell>
    </ErrorBoundary>
  );
};

export default App;
