'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Table2,
  LineChart,
  UtensilsCrossed,
  Download,
  Settings2,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/data-collection', label: 'Data Collection', icon: ClipboardList },
  { href: '/records', label: 'Records', icon: Table2 },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/menu-management', label: 'Menu Management', icon: UtensilsCrossed, adminOnly: true },
  { href: '/reports', label: 'Reports / Export', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-navy-950/40 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-up flex-col bg-white shadow-popover">
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-500 hover:bg-navy-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN').map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors',
                  active ? 'bg-brand-50 text-brand-700' : 'text-navy-500 hover:bg-navy-50 hover:text-navy-800'
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-navy-100 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
