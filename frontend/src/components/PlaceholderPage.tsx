import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Blank page shell for sections that are planned but not built yet. */
export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ icon: Icon, title, description }) => (
  <section className="card placeholder-card">
    <div className="placeholder">
      <div className="placeholder-mark">
        <Icon size={28} />
      </div>
      <h2 className="placeholder-title">{title}</h2>
      <p className="placeholder-desc">{description}</p>
      <span className="soon-chip">Очаквайте скоро</span>
    </div>
  </section>
);
