import React from 'react';
import { Sparkles } from 'lucide-react';

/** Centered card shared by the login and register pages */
export const AuthLayout: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="auth-page">
    <div className="auth-card card">
      <div className="auth-brand">
        <span className="brand-mark">
          <Sparkles size={18} />
        </span>
        <span className="brand-name">RAG Assistant</span>
      </div>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </div>
  </div>
);
