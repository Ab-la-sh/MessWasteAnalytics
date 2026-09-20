'use client';

import { Plus } from 'lucide-react';
import { DAYS_OF_WEEK, MEAL_SLOTS } from '@/lib/form-options';
import { activeFlags, slotKey } from '@/lib/menu-grid';
import { cn, formatNumber } from '@/lib/utils';
import { Table, Th } from '@/components/ui/Table';
import type { DayOfWeek, MealSlot, MenuSlot, WeekType } from '@/types/models';

const MAX_FLAG_CHIPS = 3;

/** 7 days x 4 meal slots for one week type. Each cell opens the slot editor. */
export function MenuGrid({
  weekType,
  slots,
  refreshing,
  onCellClick,
}: {
  weekType: WeekType;
  slots: Map<string, MenuSlot>;
  refreshing?: boolean;
  onCellClick: (day: DayOfWeek, meal: MealSlot, slot: MenuSlot | null) => void;
}) {
  return (
    <div className={cn('transition-opacity', refreshing && 'opacity-60')}>
      <Table className="min-w-[960px] table-fixed">
        <thead>
          <tr>
            <Th className="w-32">Day</Th>
            {MEAL_SLOTS.map((m) => (
              <Th key={m.value}>{m.label}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS_OF_WEEK.map((day) => (
            <tr key={day.value}>
              <th
                scope="row"
                className="border-b border-navy-50 bg-surface-subtle px-4 py-3 text-left align-top text-[13px] font-semibold text-navy-700"
              >
                {day.label}
              </th>
              {MEAL_SLOTS.map((meal) => {
                const slot = slots.get(slotKey(weekType, day.value, meal.value)) ?? null;
                return (
                  <td key={meal.value} className="border-b border-navy-50 p-1.5 align-top">
                    <Cell
                      slot={slot}
                      label={`${day.label} ${meal.label}, Week ${weekType}`}
                      onClick={() => onCellClick(day.value, meal.value, slot)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function Cell({ slot, label, onClick }: { slot: MenuSlot | null; label: string; onClick: () => void }) {
  if (!slot) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add menu for ${label}`}
        className="flex h-full min-h-[76px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-navy-200 text-[12.5px] font-medium text-navy-400 transition-colors hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
    );
  }

  const flags = activeFlags(slot);
  const shownFlags = flags.slice(0, MAX_FLAG_CHIPS);
  const hiddenFlags = flags.length - shownFlags.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit menu for ${label}`}
      className="group flex min-h-[76px] w-full flex-col items-start gap-1.5 rounded-lg border border-navy-100 bg-white p-2.5 text-left transition-all hover:border-brand-300 hover:shadow-card"
    >
      <span className="text-[13px] font-semibold text-navy-900">
        {slot.itemCount} {slot.itemCount === 1 ? 'item' : 'items'}
        <span className="ml-1.5 font-normal text-navy-400">· {formatNumber(slot.pctGravyDishes, 0)}% gravy</span>
      </span>

      {(flags.length > 0 || slot.tags.length > 0) && (
        <span className="flex flex-wrap gap-1">
          {shownFlags.map((f) => (
            <span key={f.key} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700">
              {f.short}
            </span>
          ))}
          {hiddenFlags > 0 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700">
              +{hiddenFlags}
            </span>
          )}
          {slot.tags.length > 0 && (
            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10.5px] font-medium text-navy-600">
              {slot.tags.length} {slot.tags.length === 1 ? 'tag' : 'tags'}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
