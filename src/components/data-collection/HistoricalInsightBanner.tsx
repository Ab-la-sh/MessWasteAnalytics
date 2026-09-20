import { Lightbulb, Loader2 } from 'lucide-react';
import type { HistoricalAverageResponse } from '@/types/models';

export function HistoricalInsightBanner({
  data,
  loading,
}: {
  data: HistoricalAverageResponse | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
      </div>
      <p className="text-[13px] leading-relaxed text-brand-800">
        {loading
          ? 'Looking up historical average for this day and meal…'
          : (data?.label ?? 'Select a mess, date, and meal slot to see the historical average.')}
        {!loading && data && data.sampleSize > 0 && (
          <span className="ml-1.5 text-brand-500">(based on {data.sampleSize} past record{data.sampleSize === 1 ? '' : 's'})</span>
        )}
      </p>
    </div>
  );
}
