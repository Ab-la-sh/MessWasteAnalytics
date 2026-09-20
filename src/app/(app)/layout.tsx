'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { MessProvider } from '@/lib/mess-context';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Spinner } from '@/components/ui/Skeleton';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Middleware already redirects unauthenticated requests to /login, so this
  // only covers the brief window while /api/auth/me resolves client-side.
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <MessProvider>
      <div className="min-h-screen bg-surface-subtle">
        <Sidebar />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="lg:pl-64">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </MessProvider>
  );
}
