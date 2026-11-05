// User-approved rough cooked-food rates, INR/kg. These are estimates, not invoice prices.
// Monday through Sunday. The same daily rate applies to each meal slot.
export const WASTE_COST_RATES = {
  north_veg: [41.23, 43.67, 54.82, 44.19, 46.38, 39.54, 52.76],
  north_nonveg: [46.58, 42.31, 71.36, 45.73, 55.92, 41.27, 63.84],
  south_veg: [34.72, 30.84, 46.93, 36.42, 39.76, 35.18, 54.37],
  south_nonveg: [39.46, 32.17, 51.28, 38.64, 41.53, 36.89, 56.72],
} as const;

export type CostMenuType = keyof typeof WASTE_COST_RATES;
export const MESS_COST_MENU_TYPES: Record<string, CostMenuType | undefined> = {
  M1: 'north_veg', M2: 'north_nonveg', M3: 'south_veg', M4: 'south_nonveg',
};


export interface WasteCostEstimate {
  estimatedWasteCost: number | null;
  estimatedCostPerKg: number | null;
  foodWasteKg: number;
}

export function estimateWasteCost(input: {
  messCode?: string; date: Date | string; plateWasteKg: number; counterWasteKg: number;
}): WasteCostEstimate {
  const foodWasteKg = Math.round((input.plateWasteKg + input.counterWasteKg) * 100) / 100;
  const costMenuType = MESS_COST_MENU_TYPES[input.messCode?.trim().toUpperCase() ?? ''] ?? null;
  // Meal dates are calendar dates, never the browser's local day or the date of entry.
  const date = input.date instanceof Date ? input.date : new Date(`${input.date.slice(0, 10)}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  const rate = costMenuType && Number.isFinite(date.getTime())
    ? WASTE_COST_RATES[costMenuType][weekday] : null;
  return {
    foodWasteKg, estimatedCostPerKg: rate,
    estimatedWasteCost: rate === null || !Number.isFinite(foodWasteKg) || foodWasteKg < 0
      ? null : Math.round(foodWasteKg * rate * 100) / 100,
  };
}

export function withWasteCost<T extends {
  date: Date | string; plateWasteKg: number; counterWasteKg: number; mess: { code: string };
}>(record: T): T & WasteCostEstimate {
  return { ...record, ...estimateWasteCost({ ...record, messCode: record.mess.code }) };
}

export function totalEstimatedWasteCost(records: { estimatedWasteCost: number | null }[]): number | null {
  if (records.some((r) => r.estimatedWasteCost === null)) return null;
  return Math.round(records.reduce((sum, r) => sum + r.estimatedWasteCost!, 0) * 100) / 100;
}
