import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReadOnlyField({
  value,
  suffix,
  loading,
  failed,
  fallbackText = 'Unavailable — will retry on save',
  className,
}: {
  value: string | number | null;
  suffix?: string;
  loading?: boolean;
  failed?: boolean;
  fallbackText?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-lg border border-dashed border-navy-200 bg-navy-50/60 px-3 text-sm',
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-navy-400" />
          <span className="text-navy-400">Fetching…</span>
        </>
      ) : failed ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-amber-600">{fallbackText}</span>
        </>
      ) : value === null || value === undefined || value === '' ? (
        <span className="text-navy-400">—</span>
      ) : (
        <span className="font-medium text-navy-800">
          {value}
          {suffix ? ` ${suffix}` : ''}
        </span>
      )}
    </div>
  );
}
