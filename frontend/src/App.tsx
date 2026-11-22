import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { RagProvider } from './context/RagContext';
import { RequireAuth, PublicOnly } from './components/RouteGuards';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

/** The app behind login. Keyed by the token, so switching accounts starts from a clean state. */
const AppShell: React.FC = () => {
  const { token } = useAuth();
  return (
    <RagProvider key={token}>
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <Topbar />
          <main className="page-area">
            <Outlet />
          </main>
        </div>
      </div>
    </RagProvider>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
