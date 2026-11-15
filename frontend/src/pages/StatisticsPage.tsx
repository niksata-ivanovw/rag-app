import React from 'react';
import { BarChart3 } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export const StatisticsPage: React.FC = () => (
  <PlaceholderPage
    icon={BarChart3}
    title="Статистика"
    description="Тук ще се показват анализи за използването на асистента и индексираните документи."
  />
);
