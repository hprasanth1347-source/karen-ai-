import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './contexts/AuthContext';
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

import OverviewPage from './pages/OverviewPage';
import AIChatPage from './pages/AIChatPage';
import WhatsAppPage from './pages/WhatsAppPage';
import InstagramPage from './pages/InstagramPage';
import GmailPage from './pages/GmailPage';
import DrivePage from './pages/DrivePage';
import MemoryPage from './pages/MemoryPage';
import DocumentsPage from './pages/DocumentsPage';
import VoicePage from './pages/VoicePage';
import TelegramPage from './pages/TelegramPage';
import NotificationsPage from './pages/NotificationsPage';
import ContactsPage from './pages/ContactsPage';
import AutomationPage from './pages/AutomationPage';
import TasksPage from './pages/TasksPage';
import RemindersPage from './pages/RemindersPage';
import SecurityPage from './pages/SecurityPage';
import ApiManagementPage from './pages/ApiManagementPage';
import DatabasePage from './pages/DatabasePage';
import MonitorPage from './pages/MonitorPage';
import ActivityPage from './pages/ActivityPage';
import SettingsPage from './pages/SettingsPage';
import AuthPage from './pages/AuthPage';
import NotFoundPage from './pages/NotFoundPage';

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/*"
              element={
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
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
