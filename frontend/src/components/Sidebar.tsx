import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { LogOut, Sparkles } from 'lucide-react';
import { useRag } from '../context/useRag';
import { NAV_ITEMS } from './navItems';

export const Sidebar: React.FC = () => {
  const { documents } = useRag();

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Link to="/chat" className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span className="brand-name">RAG Assistant</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} />
            <span className="nav-label">{label}</span>
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
          <span className="nav-label">Изход</span>
        </button>
      </div>
    </aside>
  );
};
