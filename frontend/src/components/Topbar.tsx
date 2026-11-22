import React from 'react';
import { useLocation } from 'react-router-dom';
import { User } from 'lucide-react';
import { useRag } from '../context/useRag';
import { useAuth } from '../context/useAuth';
import { NAV_ITEMS } from './navItems';

export const Topbar: React.FC = () => {
  const { backendOnline } = useRag();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.to));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{current?.title ?? 'RAG Assistant'}</h1>
      </div>

      <div className="topbar-right">
        <span
          className={`status-pill ${backendOnline ? 'online' : 'offline'}`}
          title={backendOnline ? 'Backend API е достъпен' : 'Няма връзка с Backend API'}
        >
          <span className="status-pill-dot" />
          {backendOnline ? 'Онлайн' : 'Офлайн'}
        </span>
        {user && <span className="topbar-user">{user.email}</span>}
        <span className="user-avatar" title={user?.email} aria-hidden="true">
          {user ? user.email.charAt(0).toUpperCase() : <User size={18} />}
        </span>
      </div>
    </header>
  );
};
