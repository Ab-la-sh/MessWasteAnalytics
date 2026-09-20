'use client';

import { useState } from 'react';
import { Brain, ChevronDown, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Prediction, PredictionConfidence } from '@/types/models';

const CONFIDENCE_TONE: Record<PredictionConfidence, 'neutral' | 'warning' | 'success'> = {
  low: 'warning',
  medium: 'neutral',
  high: 'success',
};

/**
 * Live prediction for the meal being entered, shown next to the historical
 * average so the coordinator has an expected figure BEFORE weighing anything.
 *
 * Also does the thing that makes a prediction useful at the counter: once a
 * total has been typed in, it says how far off the expectation the actual
 * meal landed, which is the earliest possible moment to catch a bad day.
 */
export function PredictionBanner({
  prediction,
  loading,
  actualTotalWasteKg,
}: {
  prediction: Prediction | null;
  loading: boolean;
  /** The live total from the form, or null while it's still empty. */
  actualTotalWasteKg: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-4 py-3 text-[13px] text-navy-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Estimating expected waste for this meal…
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="rounded-xl border border-navy-100 bg-white px-4 py-3 text-[13px] text-navy-500">
        Not enough history at this mess yet to predict expected waste. It turns on automatically once a
        few weeks of records exist.
      </div>
    );
  }

  const variance =
    actualTotalWasteKg != null && actualTotalWasteKg > 0 && prediction.predictedTotalWasteKg > 0
      ? ((actualTotalWasteKg - prediction.predictedTotalWasteKg) / prediction.predictedTotalWasteKg) * 100
      : null;

  const overBand = actualTotalWasteKg != null && actualTotalWasteKg > prediction.rangeHighKg;
  const underBand = actualTotalWasteKg != null && actualTotalWasteKg > 0 && actualTotalWasteKg < prediction.rangeLowKg;

  return (
    <div className="rounded-xl border border-navy-100 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-navy-800">
          <Brain className="h-3.5 w-3.5 text-white" />
        </span>

        <p className="flex-1 text-[13px] leading-relaxed text-navy-700">
          Expected waste for this meal:{' '}
          <strong className="font-semibold text-navy-900">
            {formatNumber(prediction.predictedTotalWasteKg)} kg
          </strong>{' '}
          <span className="text-navy-400">
            ({formatNumber(prediction.rangeLowKg)}–{formatNumber(prediction.rangeHighKg)} kg
            {prediction.headcountSource === 'historical'
              ? `, assuming ~${prediction.expectedHeadcount} diners`
              : ''}
            )
          </span>
        </p>

        <Badge tone={CONFIDENCE_TONE[prediction.confidence]}>{prediction.confidence} confidence</Badge>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-brand-600 hover:bg-brand-50"
          aria-expanded={expanded}
        >
          Why
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {(overBand || underBand) && (
        <div
          className={cn(
            'flex items-center gap-2 border-t px-4 py-2.5 text-[12.5px]',
            overBand ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'
          )}
        >
          {overBand ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {overBand
            ? `That's above the expected range${variance != null ? ` (${variance > 0 ? '+' : ''}${variance.toFixed(0)}%)` : ''} — worth a note below on what happened.`
            : `That's below the expected range${variance != null ? ` (${variance.toFixed(0)}%)` : ''} — nice result, worth noting what changed.`}
        </div>
      )}

      {expanded && (
        <div className="border-t border-navy-100 px-4 py-3">
          <p className="text-[12.5px] text-navy-600">
            Base level from {prediction.baseline.sampleSize} past record
            {prediction.baseline.sampleSize === 1 ? '' : 's'} — {prediction.baseline.label} — averaging{' '}
            {formatNumber(prediction.baseline.avgWastePerPerson, 2)} kg per person.
          </p>

          {prediction.drivers.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {prediction.drivers.map((driver) => (
                <li key={driver.key} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-navy-600">{driver.label}</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      driver.impactPct > 0 ? 'text-amber-700' : 'text-emerald-700'
                    )}
                  >
                    {driver.impactPct > 0 ? '+' : ''}
                    {driver.impactPct.toFixed(0)}%
                    <span className="ml-1 font-normal text-navy-400">({driver.sampleSize} records)</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-navy-400">
              No weather, calendar or menu conditions materially shifted the estimate for this meal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
