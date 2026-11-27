import {
  FileText,
  Gamepad2,
  LayoutGrid,
  Smartphone,
  Ticket,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// Admins choose an icon key, never a URL or a class name, so the storefront
// cannot be broken from the dashboard.
const icons: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  wifi: Wifi,
  ticket: Ticket,
  zap: Zap,
  wallet: Wallet,
  gamepad: Gamepad2,
  filetext: FileText,
  grid: LayoutGrid,
};

export function catalogGroupIcon(iconKey: string | null | undefined): LucideIcon {
  return icons[(iconKey ?? '').toLowerCase()] ?? LayoutGrid;
}

export type CatalogAccentStyle = {
  active: string;
  icon: string;
  ring: string;
};

const accents: Record<string, CatalogAccentStyle> = {
  sky: {
    active: 'border-sky-100 bg-sky-50 text-sky-700',
    icon: 'text-sky-600',
    ring: 'hover:border-sky-300',
  },
  cyan: {
    active: 'border-cyan-100 bg-cyan-50 text-cyan-700',
    icon: 'text-cyan-600',
    ring: 'hover:border-cyan-300',
  },
  emerald: {
    active: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    icon: 'text-emerald-600',
    ring: 'hover:border-emerald-300',
  },
  amber: {
    active: 'border-amber-100 bg-amber-50 text-amber-700',
    icon: 'text-amber-600',
    ring: 'hover:border-amber-300',
  },
  rose: {
    active: 'border-rose-100 bg-rose-50 text-rose-700',
    icon: 'text-rose-600',
    ring: 'hover:border-rose-300',
  },
  blue: {
    active: 'border-blue-100 bg-blue-50 text-blue-700',
    icon: 'text-blue-600',
    ring: 'hover:border-blue-300',
  },
  slate: {
    active: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: 'text-slate-600',
    ring: 'hover:border-slate-300',
  },
};

export function catalogAccent(accent: string | null | undefined): CatalogAccentStyle {
  return accents[(accent ?? '').toLowerCase()] ?? accents.sky;
}
