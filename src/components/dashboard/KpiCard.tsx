import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn, formatTrend } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  trendPct,
  comparedTo,
  icon: Icon,
  loading,
  goodDirection = 'down',
}: {
  label: string;
  value: string;
  trendPct: number | null | undefined;
  comparedTo?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  /** For waste metrics, a decrease is good; flag metrics where increase is good with 'up'. */
  goodDirection?: 'up' | 'down';
}) {
  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-32" />
        <Skeleton className="mt-3 h-4 w-20" />
      </Card>
    );
  }

  const hasTrend = trendPct !== null && trendPct !== undefined;
  const isFlat = hasTrend && Math.abs(trendPct) < 0.05;
  const isGood = hasTrend && !isFlat && (goodDirection === 'down' ? trendPct < 0 : trendPct > 0);

  return (
    <Card hover className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-navy-500">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="h-[18px] w-[18px] text-brand-600" />
        </div>
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-tight text-navy-900">{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {hasTrend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold',
              isFlat
                ? 'bg-navy-100 text-navy-500'
                : isGood
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
            )}
          >
            {isFlat ? <Minus className="h-3 w-3" /> : trendPct! > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {formatTrend(trendPct)}
          </span>
        ) : (
          <span className="text-[11.5px] text-navy-400">No prior data</span>
        )}
        {comparedTo && <span className="text-[11.5px] text-navy-400">vs {comparedTo}</span>}
      </div>
    </Card>
  );
}
