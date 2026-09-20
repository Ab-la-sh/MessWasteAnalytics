'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, CalendarX, Check, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { Spinner } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { AppNotification, NotificationsResponse, NotificationType } from '@/types/models';

// Alerts are derived server-side on every read (see src/lib/notifications.ts),
// so "seen" state has nowhere on the server to live without a new table and a
// migration. It's kept per-browser against each notification's deterministic
// id instead — dismissing an alert keeps it dismissed, and an alert that
// disappears because its record was fixed never comes back.
const SEEN_STORAGE_KEY = 'messwaste:seenNotifications';

/** Cap on stored ids, so a long-running browser profile can't grow this forever. */
const MAX_SEEN_IDS = 400;

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  'high-waste': AlertTriangle,
  'missing-entry': CalendarX,
  'trend-improvement': TrendingDown,
  'trend-regression': TrendingUp,
};

const SEVERITY_STYLES: Record<AppNotification['severity'], string> = {
  critical: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-brand-50 text-brand-600',
};

function readSeen(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Corrupt or unavailable storage (private mode) — degrade to "nothing seen"
    // rather than breaking the whole top bar.
    return [];
  }
}

function writeSeen(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(ids.slice(-MAX_SEEN_IDS)));
  } catch {
    // Ignore — a failed write just means the badge reappears next load.
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { selectedMessId, loading: messLoading } = useMess();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const { data, loading } = useApi<NotificationsResponse>(
    '/api/notifications',
    messLoading ? null : { messId: selectedMessId === ALL_MESSES ? undefined : selectedMessId }
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const unreadCount = notifications.filter((n) => !seenSet.has(n.id)).length;

  // Close on outside click and on Escape — the panel is a popover, not a modal,
  // so it shouldn't trap focus or block the page behind it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markSeen = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = [...new Set([...prev, ...ids])];
      writeSeen(next);
      return next;
    });
  }, []);

  function handleOpen(next: boolean) {
    setOpen(next);
  }

  function handleClick(notification: AppNotification) {
    markSeen([notification.id]);
    setOpen(false);
    if (notification.href) router.push(notification.href);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => handleOpen(!open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-navy-50',
          open && 'bg-navy-50 text-navy-800'
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card-hover">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-navy-900">Alerts</p>
              {data?.asOfDate && (
                <p className="text-[11.5px] text-navy-400">Up to {formatDate(data.asOfDate)}</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markSeen(notifications.map((n) => n.id))}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-brand-600 hover:bg-brand-50"
              >
                <Check className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-navy-400">
                <Spinner className="h-4 w-4" />
                Checking for alerts…
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-medium text-navy-700">Nothing needs attention</p>
                <p className="mt-1 text-[12px] text-navy-400">
                  High-waste spikes and missing entries will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-navy-100">
                {notifications.map((n) => {
                  const Icon = ICONS[n.type];
                  const isUnread = !seenSet.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-50/70',
                          isUnread && 'bg-brand-50/30'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                            SEVERITY_STYLES[n.severity]
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-navy-900">{n.title}</span>
                            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-relaxed text-navy-500">{n.body}</span>
                          <span className="mt-1 block text-[11px] text-navy-400">{formatDate(n.date)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
