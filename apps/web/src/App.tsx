import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { useAuthContext } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-6 font-sans text-ink">
          <div className="max-w-lg w-full bg-white border-3 border-ink p-6 shadow-brutal space-y-4">
            <h1 className="text-xl font-black text-coral">Karen AI — RECOVERY MODE</h1>
            <p className="text-xs font-mono bg-cream-100 border-2 border-ink p-3 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-coral text-xs"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const AIChatPage = lazy(() => import('./pages/AIChatPage'));
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'));
const InstagramPage = lazy(() => import('./pages/InstagramPage'));
const GmailPage = lazy(() => import('./pages/GmailPage'));
const DrivePage = lazy(() => import('./pages/DrivePage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const VoicePage = lazy(() => import('./pages/VoicePage'));
const TelegramPage = lazy(() => import('./pages/TelegramPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const RemindersPage = lazy(() => import('./pages/RemindersPage'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const ApiManagementPage = lazy(() => import('./pages/ApiManagementPage'));
const DatabasePage = lazy(() => import('./pages/DatabasePage'));
const MonitorPage = lazy(() => import('./pages/MonitorPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const LoveModePage = lazy(() => import('./pages/LoveModePage'));
const ClassroomPage = lazy(() => import('./pages/ClassroomPage'));

// ─── Auth Guard ──────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-2xl font-black text-ink animate-pulse">Karen AI</div>
        <div className="text-xs font-mono text-ink/50">Loading...</div>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<OverviewPage />} />
                      <Route path="/ai-chat" element={<AIChatPage />} />
                      <Route path="/whatsapp" element={<WhatsAppPage />} />
                      <Route path="/instagram" element={<InstagramPage />} />
                      <Route path="/gmail" element={<GmailPage />} />
                      <Route path="/drive" element={<DrivePage />} />
                      <Route path="/memory" element={<MemoryPage />} />
                      <Route path="/documents" element={<DocumentsPage />} />
                      <Route path="/voice" element={<VoicePage />} />
                      <Route path="/telegram" element={<TelegramPage />} />
                      <Route path="/notifications" element={<NotificationsPage />} />
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/automation" element={<AutomationPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/reminders" element={<RemindersPage />} />
                      <Route path="/security" element={<SecurityPage />} />
                      <Route path="/api-management" element={<ApiManagementPage />} />
                      <Route path="/database" element={<DatabasePage />} />
                      <Route path="/monitor" element={<MonitorPage />} />
                      <Route path="/activity" element={<ActivityPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/love-mode" element={<LoveModePage />} />
                      <Route path="/classroom" element={<ClassroomPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </AppLayout>
                </RequireAuth>
              }
            />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
