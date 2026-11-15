import { MessageSquareText, FileText, BarChart3, History, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/chat', label: 'AI Чат асистент', title: 'AI Чат асистент', icon: MessageSquareText },
  { to: '/documents', label: 'Документи', title: 'Документи', icon: FileText },
  { to: '/statistics', label: 'Статистика', title: 'Статистика', icon: BarChart3 },
  { to: '/history', label: 'История', title: 'История на чатовете', icon: History },
  { to: '/settings', label: 'Настройки', title: 'Настройки', icon: Settings },
];
