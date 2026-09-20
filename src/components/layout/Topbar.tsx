'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Menu } from 'lucide-react';
import { MessSelector } from '@/components/layout/MessSelector';
import { NotificationBell } from '@/components/layout/NotificationBell';

const today = new Date();

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  // Search hands off to the Records page, which owns the real filtering.
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/records?search=${encodeURIComponent(q)}` : '/records');
  }

  const dateLabel = today.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-navy-100 bg-white/80 px-4 backdrop-blur lg:px-6">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-500 hover:bg-navy-50 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <form onSubmit={handleSearch} role="search" className="relative hidden max-w-xs flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search records"
          placeholder="Search records — press Enter"
          className="h-9 w-full rounded-lg border border-navy-200 bg-navy-50/50 pl-9 pr-3 text-[13px] text-navy-700 placeholder:text-navy-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </form>

      <div className="flex flex-1 items-center justify-end gap-2.5">
        <span className="hidden text-[13px] text-navy-400 md:block">{dateLabel}</span>

        <NotificationBell />

        <div className="hidden h-6 w-px bg-navy-100 sm:block" />

        <MessSelector />
      </div>
    </header>
  );
}
