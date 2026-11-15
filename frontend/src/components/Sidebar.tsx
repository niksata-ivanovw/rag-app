import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LogOut, Sparkles, X } from 'lucide-react';
import { useRag } from '../context/useRag';
import { NAV_ITEMS } from './navItems';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { documents } = useRag();

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <Link to="/chat" className="brand" onClick={onClose}>
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span className="brand-name">RAG Assistant</span>
        </Link>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Затвори менюто">
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} />
            <span>{label}</span>
            {to === '/documents' && documents.length > 0 && (
              <span className="nav-count">{documents.length}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        {/* Log out: intentionally no functionality yet */}
        <button type="button" className="nav-item logout-btn">
          <LogOut size={19} />
          <span>Изход</span>
        </button>
      </div>
    </aside>
  );
};
