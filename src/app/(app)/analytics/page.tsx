'use client';

import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { resolveRange, type RangePreset } from '@/lib/analytics-client';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CorrelationChart } from '@/components/dashboard/CorrelationChart';
import { TrendExplorer } from '@/components/analytics/TrendExplorer';
import { BreakdownExplorer } from '@/components/analytics/BreakdownExplorer';
import { PeriodComparison } from '@/components/analytics/PeriodComparison';
import { AnomalyTable } from '@/components/analytics/AnomalyTable';
import type { AnalyticsScope } from '@/components/analytics/types';
import type { CorrelationResponse, SummaryResponse } from '@/types/models';

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { selectedMessId, selectedMess, loading: messLoading } = useMess();
  const isAdmin = user?.role === 'ADMIN';

  const messId = selectedMessId === ALL_MESSES ? undefined : selectedMessId;
  const scopeLabel = messId ? (selectedMess?.name ?? 'This mess') : 'All messes';

  const [preset, setPreset] = useState<RangePreset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });

  // Presets are anchored to the newest record (same convention as the Dashboard KPIs),
  // so a dataset that ends in the past still fills a "Last 30 days" window.
  const summary = useApi<SummaryResponse>('/api/analytics/summary', messLoading ? null : { messId });
  const asOf = summary.data?.asOfDate ?? null;

  const range = useMemo(() => resolveRange(preset, asOf, custom), [preset, asOf, custom]);

  const customInvalid = preset === 'custom' && !!custom.from && !!custom.to && custom.from > custom.to;
  const anchorPending = (preset === '14d' || preset === '30d' || preset === '90d') && summary.loading;
  const ready = !messLoading && !anchorPending && !customInvalid;

  // One scope object shared by every card; `null` holds them all back until it's resolved.
  const scope: AnalyticsScope | null = useMemo(
    () => (ready ? { messId, ...range } : null),
    [ready, messId, range]
  );

  const quantity = useApi<CorrelationResponse>(
    '/api/analytics/correlation',
    scope ? { ...scope, metric: 'quantityPrepared', limit: 300 } : null
  );
  const cost = useApi<CorrelationResponse>(
    '/api/analytics/correlation',
    scope ? { ...scope, metric: 'totalIngredientCost', limit: 300 } : null
  );

  let rangeCaption: string;
  if (preset === 'all') rangeCaption = 'Every record on file';
  else if (customInvalid) rangeCaption = 'The start date must be on or before the end date';
  else if (range.dateFrom && range.dateTo) {
    rangeCaption = `${formatDate(range.dateFrom)} – ${formatDate(range.dateTo)}${preset !== 'custom' ? ' · counted back from the latest record' : ''}`;
  } else if (preset === 'custom') rangeCaption = 'Leave a date blank for an open-ended range';
  else rangeCaption = 'No records yet';

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Trends, comparisons, correlations, and unusual waste — ${scopeLabel.toLowerCase()}.`}
      />

      <div className="space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl options={PRESETS} value={preset} onChange={setPreset} />
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="Start date"
                  className="h-9 w-[150px]"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
                <span className="text-navy-400">to</span>
                <Input
                  type="date"
                  aria-label="End date"
                  className="h-9 w-[150px]"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </div>
            )}
          </div>
          <p className={customInvalid ? 'flex items-center gap-1.5 text-[13px] text-red-600' : 'flex items-center gap-1.5 text-[13px] text-navy-500'}>
            <CalendarRange className="h-4 w-4 text-navy-400" />
            {rangeCaption}
          </p>
        </Card>

        <TrendExplorer scope={scope} canSplit={isAdmin && !messId} primaryLabel={scopeLabel} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <BreakdownExplorer scope={scope} />
          <PeriodComparison scope={scope} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CorrelationChart
            points={quantity.data?.points ?? []}
            correlation={quantity.data?.correlation ?? null}
            loading={!quantity.data && !quantity.error}
            xLabel="Quantity Prepared"
            yLabel="Total Waste (kg)"
          />
          <CorrelationChart
            points={cost.data?.points ?? []}
            correlation={cost.data?.correlation ?? null}
            loading={!cost.data && !cost.error}
            xLabel="Ingredient Cost (₹)"
            yLabel="Total Waste (kg)"
          />
        </div>

        <AnomalyTable scope={scope} />
      </div>
    </div>
  );
}
