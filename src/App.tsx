import { useState } from 'react';
import { AppShell, type NavTabId } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useAcademyData } from './hooks/useAcademyData';
import { ChatView } from './views/ChatView';
import { CommunicationsResourcesView } from './views/CommunicationsResourcesView';
import { CrmAuditView } from './views/CrmAuditView';
import { EarningsView } from './views/EarningsView';
import { LoginView } from './views/LoginView';
import { MembersView } from './views/MembersView';
import { NoAccessView } from './views/NoAccessView';
import { OverviewView } from './views/OverviewView';
import { SessionsEvaluationsView } from './views/SessionsEvaluationsView';
import { StudentsGroupsView } from './views/StudentsGroupsView';

function AcademyRouter() {
  const { actor, accessState } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const data = useAcademyData(accessState === 'authorized' ? actor : null);

  if (accessState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        جاري التحقق من الجلسة وصلاحيات الأكاديمية...
      </div>
    );
  }

  if (accessState === 'unauthenticated') {
    return <LoginView />;
  }

  if (accessState === 'no_academy' || accessState === 'disabled' || !actor) {
    return <NoAccessView />;
  }

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      notifications={data.notifications}
    >
      {activeTab === 'overview' && <OverviewView data={data} onNavigate={setActiveTab} />}
      {activeTab === 'members' && <MembersView data={data} />}
      {activeTab === 'students_groups' && <StudentsGroupsView data={data} />}
      {activeTab === 'sessions_evals' && <SessionsEvaluationsView data={data} />}
      {activeTab === 'crm_audit' && <CrmAuditView data={data} />}
      {activeTab === 'earnings' && <EarningsView />}
      {activeTab === 'chat' && <ChatView data={data} />}
      {activeTab === 'comms_resources' && <CommunicationsResourcesView data={data} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AcademyRouter />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
