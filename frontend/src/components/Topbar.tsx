import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, User } from 'lucide-react';
import { useRag } from '../context/useRag';
import { NAV_ITEMS } from './navItems';

interface TopbarProps {
  onMenuClick: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const { backendOnline } = useRag();
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.to));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn menu-btn" onClick={onMenuClick} aria-label="Отвори менюто">
          <Menu size={20} />
        </button>
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
        <span className="user-avatar" aria-hidden="true">
          <User size={18} />
        </span>
      </div>
    </header>
  );
};
