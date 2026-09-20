import { cn } from '@/lib/utils';

export function Logo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 via-brand-600 to-navy-800 shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" style={{ height: '1.125rem', width: '1.125rem' }}>
          <path
            d="M4 4h4v7a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4Z"
            stroke="white"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M6 4v16" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M14 4c-1.5 2-1.5 5 0 7 1 .8 1.5 1.6 1.5 3v6"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {!iconOnly && (
        <span className="text-[15px] font-semibold tracking-tight text-navy-900">
          MessWaste <span className="text-brand-600">Analytics</span>
        </span>
      )}
    </div>
  );
}
