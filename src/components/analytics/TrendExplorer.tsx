'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useApi } from '@/lib/use-api';
import { TREND_METRICS, buildTrendRows, formatMetric, type TrendMetric } from '@/lib/analytics-client';
import { cn } from '@/lib/utils';
import type { Granularity, TrendsResponse } from '@/types/models';
import type { AnalyticsScope } from '@/components/analytics/types';

// First colour is the combined/primary line; the rest are per-mess lines.
const LINE_COLORS = ['#5a2fd6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#64748b'];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function TrendExplorer({
  scope,
  canSplit,
  primaryLabel,
}: {
  scope: AnalyticsScope | null;
  /** True for Admins viewing the combined (all-mess) scope — the only case the API can split by mess. */
  canSplit: boolean;
  primaryLabel: string;
}) {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [metric, setMetric] = useState<TrendMetric>('totalWasteKg');
  const [split, setSplit] = useState(false);
  const splitActive = canSplit && split;

  const { data, loading, error } = useApi<TrendsResponse>(
    '/api/analytics/trends',
    scope ? { ...scope, granularity, splitByMess: splitActive ? 'true' : undefined } : null
  );

  const { rows, seriesKeys } = useMemo(
    () =>
      data
        ? buildTrendRows(data.series, splitActive ? data.byMess : undefined, metric, primaryLabel)
        : { rows: [], seriesKeys: [primaryLabel] },
    [data, splitActive, metric, primaryLabel]
  );

  const showSkeleton = !data && !error;

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Trend explorer</CardTitle>
          <CardDescription>How waste moves over time — switch the period, metric, or split by mess</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="sm" options={GRANULARITIES} value={granularity} onChange={setGranularity} />
          <Select
            aria-label="Metric"
            className="h-8 w-[190px] text-[13px]"
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
          >
            {TREND_METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          {canSplit && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-navy-600">
              <Switch checked={split} onCheckedChange={setSplit} />
              By mess
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showSkeleton ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error && !data ? (
          <EmptyState icon={LineChartIcon} title="Couldn't load the trend" description={error} className="h-[300px]" />
        ) : rows.length === 0 ? (
          <EmptyState title="No records in this range" description="Try a wider date range." className="h-[300px]" />
        ) : (
          <div className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#7c81c4' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e9ebf7' }}
                  minTickGap={28}
                />
                <YAxis tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                  formatter={(value: number, name: string) => [formatMetric(metric, value), name]}
                />
                {seriesKeys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
                {seriesKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={i === 0 ? 2.75 : 1.75}
                    strokeDasharray={splitActive && i === 0 ? '5 4' : undefined}
                    dot={rows.length <= 45 ? { r: 2.5 } : false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
