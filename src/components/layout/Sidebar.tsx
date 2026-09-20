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

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-navy-100 bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN').map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-navy-500 hover:bg-navy-50 hover:text-navy-800'
              )}
            >
              <Icon className={cn('h-[18px] w-[18px]', active ? 'text-brand-600' : 'text-navy-400 group-hover:text-navy-600')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-navy-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-navy-700 text-xs font-semibold text-white">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-navy-800">{user?.name}</p>
            <p className="truncate text-[11px] text-navy-400">
              {user?.role === 'ADMIN' ? 'Administrator' : user?.mess?.name ?? 'Data Collector'}
            </p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-md text-navy-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
