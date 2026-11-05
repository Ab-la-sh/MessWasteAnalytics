'use client';

import { estimateWasteCost } from '@/lib/waste-cost';
import { formatCurrency } from '@/lib/utils';

export function WasteCostEstimate({ messCode, date, plateWasteKg, counterWasteKg }: {
  messCode?: string; date: string; plateWasteKg: number; counterWasteKg: number;
}) {
  const cost = estimateWasteCost({ messCode, date, plateWasteKg, counterWasteKg });
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3" role="status">
      <p className="text-[13px] font-medium text-navy-700">Estimated food waste cost</p>
      <p className="mt-1 text-lg font-semibold text-navy-900">{formatCurrency(cost.estimatedWasteCost, 2)}</p>
    </div>
  );
}
