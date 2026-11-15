import React from 'react';
import { Settings } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export const SettingsPage: React.FC = () => (
  <PlaceholderPage
    icon={Settings}
    title="Настройки"
    description="Тук ще можете да настройвате модела, параметрите на търсенето и външния вид на приложението."
  />
);
