import assert from 'node:assert/strict';
import { estimateWasteCost, withWasteCost, totalEstimatedWasteCost, WASTE_COST_RATES } from '../src/lib/waste-cost';
import { aggregateRecords } from '../src/lib/analytics';
import { toExportRow } from '../src/lib/export';
import { createWasteRecordSchema } from '../src/lib/validation/waste-record';
import { formatCurrency } from '../src/lib/utils';

let checks = 0;
const codes = ['M1', 'M2', 'M3', 'M4'];
const menus = ['north_veg', 'north_nonveg', 'south_veg', 'south_nonveg'] as const;
for (let m = 0; m < 4; m++) {
  for (let day = 0; day < 7; day++) {
    const date = `2026-11-${String(2 + day).padStart(2, '0')}`;
    const rate = WASTE_COST_RATES[menus[m]][day];
    const cost = estimateWasteCost({ messCode: codes[m], date, plateWasteKg: 7, counterWasteKg: 3 });
    assert.equal(cost.estimatedCostPerKg, rate);
    assert.equal(cost.estimatedWasteCost, Math.round(10 * rate * 100) / 100);
    checks++;
  }
}
const base = {
  date: new Date('2026-11-02T00:00:00Z'), mess: { code: 'M1' },
  plateWasteKg: 7, counterWasteKg: 3, packagingWasteKg: 99,
  totalWasteKg: 109, headcount: 100, wastePerPerson: 1.09,
  wastePercent: 10.9, quantityPrepared: 1000, totalIngredientCost: 999999,
};
const record = withWasteCost(base);
assert.equal(record.estimatedWasteCost, 412.3); // Packaging and legacy spending must not affect cost.
assert.equal(record.totalIngredientCost, 999999); // Historical input remains intact.
assert.equal(estimateWasteCost({ ...base, messCode: 'M1', plateWasteKg: 0, counterWasteKg: 0 }).estimatedWasteCost, 0);
assert.equal(estimateWasteCost({ ...base, messCode: 'M5' }).estimatedWasteCost, null);
assert.equal(estimateWasteCost({ ...base, messCode: 'M1', date: '' }).estimatedCostPerKg, null);
assert.equal(estimateWasteCost({ ...base, messCode: 'M1', date: '2026-11-04T00:00:00Z' }).estimatedCostPerKg, 54.82);
assert.equal(estimateWasteCost({ ...base, messCode: 'M1', plateWasteKg: 0.1, counterWasteKg: 0.2 }).estimatedWasteCost, 12.37);
const changed = withWasteCost({ ...base, date: '2026-11-04', plateWasteKg: 5 });
assert.equal(changed.estimatedWasteCost, 438.56);
assert.equal(totalEstimatedWasteCost([record, changed]), 850.86);
assert.equal(totalEstimatedWasteCost([record, { estimatedWasteCost: null }]), null);
assert.equal(aggregateRecords([record, changed]).totalCost, 850.86);
assert.equal(aggregateRecords([base]).totalCost, null); // Never fall back to ingredient spending.
assert.equal(aggregateRecords([]).totalCost, 0);
assert.equal(formatCurrency(412.3), '₹412.30');
const exported = toExportRow({ ...base, mess: { code: 'M1', name: 'Mess 1' },
  mealSlot: 'LUNCH', dayOfWeek: 'MONDAY', weekType: 'A', eventType: 'NORMAL',
  quantityUnit: 'KG', tags: [], menuSlot: null,
} as never);
assert.equal(exported.estimated_food_waste_cost_inr, 412.3);
assert.equal(exported.estimated_food_cost_per_kg_inr, 41.23);
assert.ok(!('total_ingredient_cost' in exported));
const parsed = createWasteRecordSchema.parse({ date: '2026-11-02', mealSlot: 'LUNCH',
  plateWasteKg: 7, counterWasteKg: 3, packagingWasteKg: 99, headcount: 100,
  quantityPrepared: 1000, estimatedWasteCost: 1, estimatedCostPerKg: 0.01 });
assert.equal(parsed.totalIngredientCost, undefined); // No manual spending required.
assert.ok(!('estimatedWasteCost' in parsed)); // Caller cannot forge the estimate.
console.log(`${checks} weekday/mess combinations and cost, aggregation, export, validation checks passed`);
