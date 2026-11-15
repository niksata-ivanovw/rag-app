import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RagProvider } from './context/RagContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <RagProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <Topbar />
            <main className="page-area">
              <Routes>
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/statistics" element={<StatisticsPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="*" element={<Navigate to="/chat" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </RagProvider>
  );
};

export default App;
