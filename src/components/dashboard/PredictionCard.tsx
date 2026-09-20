'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Brain, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/utils';
import { formatDate, mealSlotLabel } from '@/lib/format';
import type { ForecastResponse, PredictionConfidence } from '@/types/models';

const CONFIDENCE_TONE: Record<PredictionConfidence, 'neutral' | 'warning' | 'success'> = {
  low: 'warning',
  medium: 'neutral',
  high: 'success',
};

const CONFIDENCE_HINT: Record<PredictionConfidence, string> = {
  low: 'Thin history behind these numbers — treat them as a rough guide.',
  medium: 'Based on a reasonable amount of matching history.',
  high: 'Backed by a solid run of comparable meals.',
};

/**
 * The card that replaced "AI Waste Prediction — Coming Soon".
 *
 * Shows the forecast band (low/expected/high) for the week ahead rather than
 * a single line, because a point estimate with no spread would overstate how
 * precisely a week of mess waste can be called.
 */
export function PredictionCard({
  data,
  loading,
  className,
}: {
  data: ForecastResponse | null;
  loading: boolean;
  className?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daily = data?.daily ?? [];
  const selectedDay = daily.find((d) => d.date === selectedDate) ?? daily[0] ?? null;

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-navy-800">
              <Brain className="h-3.5 w-3.5 text-white" />
            </span>
            AI Waste Prediction
          </CardTitle>
          <CardDescription>
            {data?.startDate
              ? `Forecast for ${data.days} days from ${formatDate(data.startDate)}`
              : 'Forecast for the week ahead'}
          </CardDescription>
        </div>
        {data && !loading && daily.length > 0 && (
          <Badge tone={CONFIDENCE_TONE[data.confidence]} title={CONFIDENCE_HINT[data.confidence]}>
            {data.confidence} confidence
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : daily.length === 0 ? (
          <EmptyState
            title="Not enough history to forecast"
            description={data?.message ?? 'Submit a few weeks of records and the forecast turns on by itself.'}
            icon={Brain}
            className="py-8"
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Metric
                label={`Predicted over ${data?.days ?? 7} days`}
                value={`${formatNumber(data?.totalPredictedKg)} kg`}
              />
              <Metric label="Average per day" value={`${formatNumber(data?.avgPerDayKg)} kg`} />
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={daily}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                onClick={(state: { activeLabel?: string }) => {
                  const clicked = daily.find((d) => d.label === state?.activeLabel);
                  if (clicked) setSelectedDate(clicked.date);
                }}
              >
                <defs>
                  <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#7c81c4' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e9ebf7' }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                  formatter={(value: number, name: string) => [`${value.toFixed(1)} kg`, LABELS[name] ?? name]}
                />
                {/* The band is drawn as "high" filled and "low" masked in white,
                    which is how Recharts expresses a range without a dedicated
                    range series. */}
                <Area
                  type="monotone"
                  dataKey="rangeHighKg"
                  stroke="none"
                  fill="url(#forecastBand)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="rangeLowKg"
                  stroke="none"
                  fill="#ffffff"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="predictedKg"
                  stroke="#5a2fd6"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#5a2fd6' }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>

            {selectedDay && (
              <div className="mt-3 rounded-xl bg-navy-50/60 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-navy-800">{formatDate(selectedDay.date)}</p>
                  <p className="text-[13px] text-navy-500">
                    {formatNumber(selectedDay.rangeLowKg)}–{formatNumber(selectedDay.rangeHighKg)} kg expected
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedDay.byMeal
                    .filter((m) => m.predictedKg > 0)
                    .map((m) => (
                      <span
                        key={m.mealSlot}
                        className="rounded-lg bg-white px-2 py-1 text-[11.5px] text-navy-600 shadow-sm"
                      >
                        {mealSlotLabel(m.mealSlot)} · {formatNumber(m.predictedKg)} kg
                      </span>
                    ))}
                  {selectedDay.eventType !== 'NORMAL' && (
                    <Badge tone="brand">{selectedDay.eventName ?? selectedDay.eventType.replace('_', ' ')}</Badge>
                  )}
                </div>
              </div>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-navy-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Recency-weighted history for each mess, meal and weekday, adjusted for the scheduled menu,
              seasonal weather and the academic calendar. Click a point for that day&apos;s breakdown.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const LABELS: Record<string, string> = {
  predictedKg: 'Predicted',
  rangeHighKg: 'Upper estimate',
  rangeLowKg: 'Lower estimate',
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-navy-100 p-3">
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-navy-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-navy-900">{value}</p>
    </div>
  );
}
