import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin text-brand-500', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}>
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-navy-50">
        <Icon className="h-5 w-5 text-navy-400" />
      </div>
      <p className="text-sm font-medium text-navy-700">{title}</p>
      {description && <p className="max-w-xs text-sm text-navy-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
