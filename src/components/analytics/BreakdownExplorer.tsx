'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useApi } from '@/lib/use-api';
import { BREAKDOWN_METRICS, formatMetric, sortBreakdown, type BreakdownMetric } from '@/lib/analytics-client';
import { cn } from '@/lib/utils';
import type { BreakdownResponse, BreakdownRow } from '@/types/models';
import type { AnalyticsScope } from '@/components/analytics/types';

type Dimension = BreakdownResponse['by'];

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'dayOfWeek', label: 'Day' },
  { value: 'mealSlot', label: 'Meal' },
  { value: 'weekType', label: 'Week' },
  { value: 'eventType', label: 'Event' },
];

export function BreakdownExplorer({ scope }: { scope: AnalyticsScope | null }) {
  const [by, setBy] = useState<Dimension>('dayOfWeek');
  const [metric, setMetric] = useState<BreakdownMetric>('avgWasteKg');

  const { data, loading, error } = useApi<BreakdownResponse>(
    '/api/analytics/breakdown',
    scope ? { ...scope, by } : null
  );

  // Ignore a response for a different dimension (still in flight) so bars never mislabel.
  const rows = useMemo(() => (data && data.by === by ? sortBreakdown(by, data.breakdown) : []), [data, by]);

  const peak = useMemo(
    () =>
      rows.reduce<BreakdownRow | null>((best, r) => (best === null || r[metric] > best[metric] ? r : best), null),
    [rows, metric]
  );

  const metricLabel = BREAKDOWN_METRICS.find((m) => m.value === metric)?.label ?? '';
  const showSkeleton = rows.length === 0 && !error && (loading || !data);

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Where waste concentrates</CardTitle>
          <CardDescription>Compare days, meals, week types, and event types</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="sm" options={DIMENSIONS} value={by} onChange={setBy} />
          <Select
            aria-label="Metric"
            className="h-8 w-[190px] text-[13px]"
            value={metric}
            onChange={(e) => setMetric(e.target.value as BreakdownMetric)}
          >
            {BREAKDOWN_METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {showSkeleton ? (
          <Skeleton className="h-[260px] w-full" />
        ) : error && rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load the breakdown" description={error} className="h-[260px]" />
        ) : rows.length === 0 ? (
          <EmptyState title="No records in this range" className="h-[260px]" />
        ) : (
          <div className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#7c81c4' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e9ebf7' }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  cursor={{ fill: 'rgba(124, 92, 255, 0.06)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                  formatter={(value: number) => [formatMetric(metric, value), metricLabel]}
                />
                <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {rows.map((r) => (
                    <Cell key={r.key} fill={peak && r.key === peak.key ? '#5a2fd6' : '#bcb1ff'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {peak && (
              <p className="mt-2 text-center text-[12.5px] text-navy-500">
                Highest: <span className="font-semibold text-navy-800">{peak.label}</span> at{' '}
                <span className="font-semibold text-navy-800">{formatMetric(metric, peak[metric])}</span>
                <span className="text-navy-400"> · across {peak.recordCount} meals</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
