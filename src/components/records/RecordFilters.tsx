'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Label } from '@/components/ui/Input';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { MEAL_SLOTS, WEEK_TYPES, DAYS_OF_WEEK, EVENT_TYPES, MENU_TAGS } from '@/lib/form-options';
import { countAdvancedFilters, hasActiveFilters, type RecordFilterState } from '@/lib/record-filters';
import type { MealSlot, WeekType, DayOfWeek, EventType, MenuTag } from '@/types/models';

export function RecordFilters({
  value,
  onChange,
  onClear,
}: {
  value: RecordFilterState;
  onChange: (next: RecordFilterState) => void;
  onClear: () => void;
}) {
  const advancedCount = countAdvancedFilters(value);
  // Start expanded if a deep link (e.g. from the anomaly table) already set an advanced filter.
  const [showAdvanced, setShowAdvanced] = useState(advancedCount > 0);

  function set<K extends keyof RecordFilterState>(key: K, next: RecordFilterState[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor="rec-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
            <Input
              id="rec-search"
              className="pl-9"
              placeholder="Notes, deviation reason, mess…"
              value={value.search}
              onChange={(e) => set('search', e.target.value)}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <Label htmlFor="rec-from">From</Label>
          <Input
            id="rec-from"
            type="date"
            value={value.dateFrom}
            max={value.dateTo || undefined}
            onChange={(e) => set('dateFrom', e.target.value)}
          />
        </div>

        <div className="lg:col-span-2">
          <Label htmlFor="rec-to">To</Label>
          <Input
            id="rec-to"
            type="date"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={(e) => set('dateTo', e.target.value)}
          />
        </div>

        <div className="lg:col-span-2">
          <Label htmlFor="rec-meal">Meal</Label>
          <Select id="rec-meal" value={value.mealSlot} onChange={(e) => set('mealSlot', e.target.value as MealSlot | '')}>
            <option value="">All meals</option>
            {MEAL_SLOTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            More
            {advancedCount > 0 && (
              <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10.5px] font-semibold text-white">
                {advancedCount}
              </span>
            )}
          </Button>
          {hasActiveFilters(value) && (
            <Button type="button" variant="ghost" size="icon" onClick={onClear} title="Clear all filters" aria-label="Clear all filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="mt-4 animate-fade-in space-y-4 border-t border-navy-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="rec-week">Week type</Label>
              <Select id="rec-week" value={value.weekType} onChange={(e) => set('weekType', e.target.value as WeekType | '')}>
                <option value="">Both weeks</option>
                {WEEK_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rec-day">Day of week</Label>
              <Select id="rec-day" value={value.dayOfWeek} onChange={(e) => set('dayOfWeek', e.target.value as DayOfWeek | '')}>
                <option value="">Any day</option>
                {DAYS_OF_WEEK.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rec-event">Event type</Label>
              <Select id="rec-event" value={value.eventType} onChange={(e) => set('eventType', e.target.value as EventType | '')}>
                <option value="">Any event</option>
                {EVENT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rec-dev">Schedule deviation</Label>
              <Select
                id="rec-dev"
                value={value.deviation}
                onChange={(e) => set('deviation', e.target.value as RecordFilterState['deviation'])}
              >
                <option value="">Any</option>
                <option value="true">Deviated from schedule</option>
                <option value="false">Followed schedule</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>Menu composition (matches any selected)</Label>
            <ChipSelect options={MENU_TAGS} value={value.tags} onChange={(v) => set('tags', v as MenuTag[])} />
          </div>
        </div>
      )}
    </Card>
  );
}
