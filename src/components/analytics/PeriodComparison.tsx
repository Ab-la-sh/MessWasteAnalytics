'use client';

import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/lib/use-api';
import { deltaPct, formatMetric, previousRange, summarizeSeries, type PeriodTotals } from '@/lib/analytics-client';
import { formatDate } from '@/lib/format';
import type { TrendsResponse } from '@/types/models';
import type { AnalyticsScope } from '@/components/analytics/types';

type MetricKey = 'totalWasteKg' | 'avgWastePerPerson' | 'avgWastePercent' | 'totalCost';

const ROWS: { key: MetricKey; label: string; /** Whether a decrease is unambiguously good news. */ lowerIsBetter: boolean }[] = [
  { key: 'totalWasteKg', label: 'Total waste', lowerIsBetter: true },
  { key: 'avgWastePerPerson', label: 'Waste per person', lowerIsBetter: true },
  { key: 'avgWastePercent', label: 'Waste of prepared', lowerIsBetter: true },
  // Spending less on ingredients isn't inherently good (fewer people, smaller menu), so no red/green here.
  { key: 'totalCost', label: 'Ingredient cost', lowerIsBetter: false },
];

function DeltaBadge({ delta, lowerIsBetter }: { delta: number | null; lowerIsBetter: boolean }) {
  if (delta === null) return <Badge>No baseline</Badge>;
  if (Math.abs(delta) < 0.05) {
    return (
      <Badge>
        <Minus className="mr-0.5 h-3 w-3" />
        0.0%
      </Badge>
    );
  }
  const up = delta > 0;
  const tone = !lowerIsBetter ? 'brand' : up ? 'danger' : 'success';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <Badge tone={tone}>
      <Icon className="mr-0.5 h-3 w-3" />
      {up ? '+' : ''}
      {delta.toFixed(1)}%
    </Badge>
  );
}

export function PeriodComparison({ scope }: { scope: AnalyticsScope | null }) {
  const prev = scope ? previousRange(scope) : null;
  const enabled = scope !== null && prev !== null;

  const current = useApi<TrendsResponse>(
    '/api/analytics/trends',
    enabled ? { messId: scope.messId, dateFrom: scope.dateFrom, dateTo: scope.dateTo, granularity: 'daily' } : null
  );
  const previous = useApi<TrendsResponse>(
    '/api/analytics/trends',
    enabled ? { messId: scope.messId, dateFrom: prev.dateFrom, dateTo: prev.dateTo, granularity: 'daily' } : null
  );

  const failed = current.error || previous.error;
  const cur: PeriodTotals | null = current.data ? summarizeSeries(current.data.series) : null;
  const prv: PeriodTotals | null = previous.data ? summarizeSeries(previous.data.series) : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Period comparison</CardTitle>
          <CardDescription>
            {enabled
              ? `${formatDate(scope.dateFrom)} – ${formatDate(scope.dateTo)} vs the ${formatDate(prev.dateFrom)} – ${formatDate(prev.dateTo)} window before it`
              : 'This period against the equally long period before it'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Pick a bounded date range"
            description="Choose Last 14 / 30 / 90 days, or a custom start and end date, to compare against the previous period."
            className="h-[260px]"
          />
        ) : failed && !(cur && prv) ? (
          <EmptyState icon={ArrowLeftRight} title="Couldn't load the comparison" description={failed ?? undefined} className="h-[260px]" />
        ) : !cur || !prv ? (
          <div className="space-y-3">
            {ROWS.map((r) => (
              <Skeleton key={r.key} className="h-14 w-full" />
            ))}
          </div>
        ) : prv.recordCount === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No earlier records to compare against"
            description={`This period has ${cur.recordCount} records, but the window before it is empty.`}
            className="h-[260px]"
          />
        ) : (
          <>
            <ul className="divide-y divide-navy-50">
              {ROWS.map((row) => {
                const c = cur[row.key];
                const p = prv[row.key];
                return (
                  <li key={row.key} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-navy-500">{row.label}</p>
                      <p className="mt-0.5 text-[20px] font-semibold tracking-tight text-navy-900">
                        {formatMetric(row.key, c)}
                      </p>
                    </div>
                    <div className="text-right">
                      <DeltaBadge delta={deltaPct(c, p)} lowerIsBetter={row.lowerIsBetter} />
                      <p className="mt-1 text-[12px] text-navy-400">was {formatMetric(row.key, p)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] text-navy-400">
              Based on {cur.recordCount.toLocaleString('en-IN')} meals this period vs {prv.recordCount.toLocaleString('en-IN')} before.
              Totals depend on how many meals were logged, so read them alongside the per-person and percentage rows.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
