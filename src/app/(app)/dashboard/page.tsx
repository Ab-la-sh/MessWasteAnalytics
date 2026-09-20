'use client';

import { useEffect, useState } from 'react';
import { Scale, Users, Wallet, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { BreakdownBarChart } from '@/components/dashboard/BreakdownBarChart';
import { CompositionChart } from '@/components/dashboard/CompositionChart';
import { CorrelationChart, type CorrelationPoint } from '@/components/dashboard/CorrelationChart';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { PredictionCard } from '@/components/dashboard/PredictionCard';
import { formatNumber, formatCurrency } from '@/lib/utils';
import type {
  SummaryResponse,
  TrendPoint,
  BreakdownRow,
  CompositionResponse,
  Insight,
  ForecastResponse,
} from '@/types/models';

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedMessId, selectedMess, loading: messLoading } = useMess();

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [byMeal, setByMeal] = useState<BreakdownRow[]>([]);
  const [byDay, setByDay] = useState<BreakdownRow[]>([]);
  const [composition, setComposition] = useState<CompositionResponse | null>(null);
  const [correlation, setCorrelation] = useState<{ points: CorrelationPoint[]; correlation: number | null }>({
    points: [],
    correlation: null,
  });
  const [insights, setInsights] = useState<Insight[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (messLoading) return;
    const messId = selectedMessId === ALL_MESSES ? undefined : selectedMessId;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.get<SummaryResponse>('/api/analytics/summary', { messId }),
      api.get<{ series: TrendPoint[] }>('/api/analytics/trends', { messId, granularity: 'daily' }),
      api.get<{ breakdown: BreakdownRow[] }>('/api/analytics/breakdown', { messId, by: 'mealSlot' }),
      api.get<{ breakdown: BreakdownRow[] }>('/api/analytics/breakdown', { messId, by: 'dayOfWeek' }),
      api.get<CompositionResponse>('/api/analytics/composition', { messId }),
      api.get<{ points: CorrelationPoint[]; correlation: number | null }>('/api/analytics/correlation', {
        messId,
        metric: 'quantityPrepared',
        limit: 150,
      }),
      api.get<{ insights: Insight[] }>('/api/analytics/insights', { messId }),
      api.get<ForecastResponse>('/api/predict/forecast', { messId, days: 7 }),
    ])
      .then(([s, t, m, d, c, corr, i, f]) => {
        if (cancelled) return;
        setSummary(s);
        setTrend(t.series);
        setByMeal(m.breakdown);
        setByDay(sortByDayOfWeek(d.breakdown));
        setComposition(c);
        setCorrelation(corr);
        setInsights(i.insights);
        setForecast(f);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMessId, messLoading]);

  const scopeLabel = selectedMessId === ALL_MESSES ? 'across all messes' : selectedMess?.name ?? '';

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? ''}`}
        description={
          summary?.asOfDate
            ? `Showing data as of ${summary.asOfDate}${scopeLabel ? ` · ${scopeLabel}` : ''}`
            : `Overview ${scopeLabel}`
        }
      />

      {!loading && summary?.message && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {summary.message} Submit your first entry from Data Collection to populate this dashboard.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Waste Today"
          value={summary?.totalWasteToday?.valueKg != null ? `${formatNumber(summary.totalWasteToday.valueKg)} kg` : '—'}
          trendPct={summary?.totalWasteToday?.trendPct}
          comparedTo={summary?.totalWasteToday?.comparedTo}
          icon={Scale}
          loading={loading}
        />
        <KpiCard
          label="Waste per Person"
          value={
            summary?.wastePerPersonToday?.valueKg != null
              ? `${formatNumber(summary.wastePerPersonToday.valueKg, 2)} kg`
              : '—'
          }
          trendPct={summary?.wastePerPersonToday?.trendPct}
          comparedTo={summary?.wastePerPersonToday?.comparedTo}
          icon={Users}
          loading={loading}
        />
        <KpiCard
          label="Estimated Cost Wasted"
          value={summary?.costWastedToday?.valueRupees != null ? formatCurrency(summary.costWastedToday.valueRupees) : '—'}
          trendPct={summary?.costWastedToday?.trendPct}
          comparedTo={summary?.costWastedToday?.comparedTo}
          icon={Wallet}
          loading={loading}
        />
        <KpiCard
          label="Average Weekly Waste"
          value={summary?.avgWeeklyWaste?.valueKg != null ? `${formatNumber(summary.avgWeeklyWaste.valueKg)} kg` : '—'}
          trendPct={summary?.avgWeeklyWaste?.trendPct}
          comparedTo={summary?.avgWeeklyWaste?.comparedTo}
          icon={CalendarDays}
          loading={loading}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TrendChart data={trend} loading={loading} />
        <InsightsCard insights={insights} loading={loading} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownBarChart title="Waste by Meal Slot" description="Total waste per meal slot" data={byMeal} loading={loading} />
        <BreakdownBarChart title="Waste by Day of Week" description="Total waste per day of week" data={byDay} loading={loading} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompositionChart data={composition} loading={loading} />
        <CorrelationChart
          points={correlation.points}
          correlation={correlation.correlation}
          loading={loading}
          xLabel="Quantity Prepared"
          yLabel="Total Waste (kg)"
        />
      </div>

      <div className="mt-4">
        <PredictionCard data={forecast} loading={loading} />
      </div>
    </div>
  );
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
function sortByDayOfWeek(rows: BreakdownRow[]): BreakdownRow[] {
  return [...rows].sort((a, b) => DAY_ORDER.indexOf(a.key) - DAY_ORDER.indexOf(b.key));
}
