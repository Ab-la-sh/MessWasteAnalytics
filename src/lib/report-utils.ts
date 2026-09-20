// Pure helpers for the Reports / Export page.

import { formatDate, mealSlotLabel, weekTypeLabel, dayOfWeekLabel, eventTypeLabel, menuTagLabel } from '@/lib/format';
import type { RecordFilterState } from '@/lib/record-filters';

/**
 * Human-readable summary of what an export will contain, one short phrase per
 * active constraint ("Mess 2", "Lunch", "01 Nov 2024 – 30 Nov 2024", ...).
 * Always starts with the mess scope so the person can see it at a glance.
 */
export function describeExportScope(f: RecordFilterState, scopeLabel: string): string[] {
  const parts: string[] = [scopeLabel];

  if (f.dateFrom && f.dateTo) parts.push(`${formatDate(f.dateFrom)} – ${formatDate(f.dateTo)}`);
  else if (f.dateFrom) parts.push(`From ${formatDate(f.dateFrom)}`);
  else if (f.dateTo) parts.push(`Up to ${formatDate(f.dateTo)}`);
  else parts.push('All dates');

  if (f.mealSlot) parts.push(mealSlotLabel(f.mealSlot));
  if (f.weekType) parts.push(weekTypeLabel(f.weekType));
  if (f.dayOfWeek) parts.push(dayOfWeekLabel(f.dayOfWeek));
  if (f.eventType) parts.push(eventTypeLabel(f.eventType));
  if (f.deviation === 'true') parts.push('Deviated from schedule');
  if (f.deviation === 'false') parts.push('Followed schedule');
  if (f.tags.length > 0) parts.push(`Tags: ${f.tags.map(menuTagLabel).join(' / ')}`);
  if (f.search.trim()) parts.push(`Search: “${f.search.trim()}”`);

  return parts;
}
