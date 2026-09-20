'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Scale, Wallet, CloudSun, UtensilsCrossed, Store, Save, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import {
  MEAL_SLOTS,
  WEEK_TYPES,
  EVENT_TYPES,
  QUANTITY_UNITS,
  MENU_TAGS,
  weekTypeFromDateClient,
  dayOfWeekFromDateClient,
} from '@/lib/form-options';
import type {
  MealSlot,
  WeekType,
  EventType,
  QuantityUnit,
  MenuTag,
  MenuSlot,
  HistoricalAverageResponse,
  WeatherResponse,
  PredictResponse,
} from '@/types/models';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Switch } from '@/components/ui/Switch';
import { FormSection, FormField } from '@/components/data-collection/FormSection';
import { ReadOnlyField } from '@/components/data-collection/ReadOnlyField';
import { HistoricalInsightBanner } from '@/components/data-collection/HistoricalInsightBanner';
import { ScheduledMenuContext } from '@/components/data-collection/ScheduledMenuContext';
import { PredictionBanner } from '@/components/data-collection/PredictionBanner';
import { useDebouncedValue } from '@/lib/use-debounce';
import { formatNumber } from '@/lib/utils';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const initialForm = {
  date: todayIso(),
  mealSlot: 'LUNCH' as MealSlot,
  weekType: weekTypeFromDateClient(todayIso()) as WeekType,
  weekTypeOverridden: false,
  plateWasteKg: '',
  counterWasteKg: '',
  packagingWasteKg: '',
  headcount: '',
  quantityPrepared: '',
  quantityUnit: 'KG' as QuantityUnit,
  totalIngredientCost: '',
  eventType: 'NORMAL' as EventType,
  scheduleDeviation: false,
  deviationReason: '',
  deviationDescription: '',
  tags: [] as MenuTag[],
  notes: '',
};

export default function DataCollectionPage() {
  const { user } = useAuth();
  const { messes, selectedMessId } = useMess();
  const router = useRouter();

  const isAdmin = user?.role === 'ADMIN';
  const [messId, setMessId] = useState<string>(
    isAdmin ? (selectedMessId !== ALL_MESSES ? selectedMessId : '') : (user?.messId ?? '')
  );
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [historical, setHistorical] = useState<HistoricalAverageResponse | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  const [scheduledSlot, setScheduledSlot] = useState<MenuSlot | null>(null);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  // Tags default to whatever the schedule says, but stop doing so the moment
  // the coordinator edits them — otherwise changing the date would silently
  // throw away what they'd just selected.
  const [tagsTouched, setTagsTouched] = useState(false);

  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  // Keep messId in sync with the top-bar selector for Admins (a Data
  // Collector's mess never changes — it's implied by their account).
  useEffect(() => {
    if (isAdmin && selectedMessId !== ALL_MESSES) setMessId(selectedMessId);
  }, [isAdmin, selectedMessId]);

  const dayOfWeek = useMemo(() => dayOfWeekFromDateClient(form.date), [form.date]);

  // Auto-derive week type from date unless the coordinator has explicitly overridden it.
  useEffect(() => {
    if (!form.weekTypeOverridden) {
      setForm((f) => ({ ...f, weekType: weekTypeFromDateClient(f.date) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const totalWasteKg = useMemo(() => {
    const p = parseFloat(form.plateWasteKg) || 0;
    const c = parseFloat(form.counterWasteKg) || 0;
    const pk = parseFloat(form.packagingWasteKg) || 0;
    return p + c + pk;
  }, [form.plateWasteKg, form.counterWasteKg, form.packagingWasteKg]);

  const wastePerPerson = useMemo(() => {
    const hc = parseInt(form.headcount, 10);
    if (!hc) return null;
    return totalWasteKg / hc;
  }, [totalWasteKg, form.headcount]);

  // Auto-fetch weather whenever mess or date changes.
  useEffect(() => {
    if (!messId || !form.date) return;
    let cancelled = false;
    setWeatherLoading(true);
    api
      .get<WeatherResponse>('/api/weather', { messId, date: form.date })
      .then((res) => {
        if (!cancelled) setWeather(res);
      })
      .catch(() => {
        if (!cancelled) setWeather({ weather: null, fromCache: false, fetchFailed: true });
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messId, form.date]);

  // Auto-fetch the historical-average insight whenever mess, date, or meal slot changes.
  useEffect(() => {
    if (!messId || !form.date || !form.mealSlot) return;
    let cancelled = false;
    setHistoricalLoading(true);
    api
      .get<HistoricalAverageResponse>('/api/analytics/historical-average', {
        messId,
        mealSlot: form.mealSlot,
        date: form.date,
      })
      .then((res) => {
        if (!cancelled) setHistorical(res);
      })
      .catch(() => {
        if (!cancelled) setHistorical(null);
      })
      .finally(() => {
        if (!cancelled) setHistoricalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messId, form.date, form.mealSlot]);

  // Fetch the scheduled menu for this mess/week/day/slot — the thing the
  // deviation toggle is comparing against.
  useEffect(() => {
    if (!messId || !form.date || !form.mealSlot) return;
    let cancelled = false;
    setScheduledLoading(true);
    api
      .get<{ menuSlots: MenuSlot[] }>('/api/menu-slots', {
        messId,
        weekType: form.weekType,
        dayOfWeek,
        mealSlot: form.mealSlot,
      })
      .then((res) => {
        if (cancelled) return;
        const slot = res.menuSlots[0] ?? null;
        setScheduledSlot(slot);
        // Pre-fill the chips from the schedule until the coordinator touches them.
        if (slot && !tagsTouched) setForm((f) => ({ ...f, tags: slot.tags }));
      })
      .catch(() => {
        if (!cancelled) setScheduledSlot(null);
      })
      .finally(() => {
        if (!cancelled) setScheduledLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `tagsTouched` is intentionally excluded: it must not re-trigger a fetch,
    // it only gates the pre-fill inside the handler above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messId, form.date, form.mealSlot, form.weekType, dayOfWeek]);

  // Live prediction. Headcount is debounced because it re-fires per keystroke;
  // everything else is a discrete control, so those changes go through at once.
  const debouncedHeadcount = useDebouncedValue(form.headcount, 400);

  useEffect(() => {
    if (!messId || !form.date || !form.mealSlot) return;
    let cancelled = false;
    setPredictionLoading(true);
    const headcount = parseInt(debouncedHeadcount, 10);
    api
      .get<PredictResponse>('/api/predict', {
        messId,
        date: form.date,
        mealSlot: form.mealSlot,
        eventType: form.eventType,
        scheduleDeviation: form.scheduleDeviation,
        headcount: Number.isFinite(headcount) && headcount > 0 ? headcount : undefined,
      })
      .then((res) => {
        if (!cancelled) setPrediction(res);
      })
      .catch(() => {
        if (!cancelled) setPrediction(null);
      })
      .finally(() => {
        if (!cancelled) setPredictionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messId, form.date, form.mealSlot, form.eventType, form.scheduleDeviation, debouncedHeadcount]);

  function update<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ ...initialForm, date: todayIso(), weekType: weekTypeFromDateClient(todayIso()) });
    setTagsTouched(false);
    toast.info('Form reset');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!messId) {
      toast.error('Select a mess before submitting');
      return;
    }
    if (form.scheduleDeviation && !form.deviationReason.trim()) {
      toast.error('A reason is required when schedule deviation is on');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/waste-records', {
        messId,
        date: form.date,
        mealSlot: form.mealSlot,
        weekType: form.weekTypeOverridden ? form.weekType : undefined,
        plateWasteKg: parseFloat(form.plateWasteKg) || 0,
        counterWasteKg: parseFloat(form.counterWasteKg) || 0,
        packagingWasteKg: parseFloat(form.packagingWasteKg) || 0,
        headcount: parseInt(form.headcount, 10) || 0,
        quantityPrepared: parseFloat(form.quantityPrepared) || 0,
        quantityUnit: form.quantityUnit,
        totalIngredientCost: parseFloat(form.totalIngredientCost) || 0,
        eventType: form.eventType,
        scheduleDeviation: form.scheduleDeviation,
        deviationReason: form.scheduleDeviation ? form.deviationReason : null,
        deviationDescription: form.scheduleDeviation ? form.deviationDescription : null,
        tags: form.tags,
        notes: form.notes || null,
      });
      toast.success('Waste record submitted');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('A record already exists for this mess, date, and meal slot — edit it from Records instead.');
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Data Collection"
        description="Log today's waste, volume, and cost for a mess and meal slot."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={resetForm}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSection icon={Store} title="Meal Identification" description="Mostly auto-filled from date and mess">
          <FormField label="Mess">
            <Select value={messId} onChange={(e) => setMessId(e.target.value)} disabled={!isAdmin} required>
              <option value="" disabled>
                Select a mess
              </option>
              {(isAdmin ? messes : messes.filter((m) => m.id === user?.messId)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Date">
            <Input type="date" value={form.date} max={todayIso()} onChange={(e) => update('date', e.target.value)} required />
          </FormField>

          <FormField label="Meal Slot">
            <Select value={form.mealSlot} onChange={(e) => update('mealSlot', e.target.value as MealSlot)}>
              {MEAL_SLOTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Week Type" hint="Auto-derived from date — override only if this mess's cycle differs">
            <Select
              value={form.weekType}
              onChange={(e) => setForm((f) => ({ ...f, weekType: e.target.value as WeekType, weekTypeOverridden: true }))}
            >
              {WEEK_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Day of Week">
            <ReadOnlyField value={dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase()} />
          </FormField>
        </FormSection>

        <FormSection icon={Scale} title="Waste (kg)" description="Plate, counter, and packaging waste">
          <FormField label="Plate Waste (kg)">
            <Input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={form.plateWasteKg}
              onChange={(e) => update('plateWasteKg', e.target.value)}
              placeholder="0.0"
              required
            />
          </FormField>
          <FormField label="Counter / Serving Waste (kg)">
            <Input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={form.counterWasteKg}
              onChange={(e) => update('counterWasteKg', e.target.value)}
              placeholder="0.0"
              required
            />
          </FormField>
          <FormField label="Packaging Waste (kg)">
            <Input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={form.packagingWasteKg}
              onChange={(e) => update('packagingWasteKg', e.target.value)}
              placeholder="0.0"
              required
            />
          </FormField>
          <FormField label="Total Waste (auto-calculated)" colSpan="half">
            <ReadOnlyField value={formatNumber(totalWasteKg, 2)} suffix="kg" />
          </FormField>
        </FormSection>

        <FormSection icon={Wallet} title="Volume & Cost">
          <FormField label="Headcount">
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.headcount}
              onChange={(e) => update('headcount', e.target.value)}
              placeholder="e.g. 480"
              required
            />
          </FormField>
          <FormField label="Quantity Prepared">
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={form.quantityPrepared}
                onChange={(e) => update('quantityPrepared', e.target.value)}
                placeholder="0.0"
                required
              />
              <Select
                className="w-28 shrink-0"
                value={form.quantityUnit}
                onChange={(e) => update('quantityUnit', e.target.value as QuantityUnit)}
              >
                {QUANTITY_UNITS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </FormField>
          <FormField label="Total Ingredient Cost (₹)">
            <Input
              type="number"
              step="1"
              min="0"
              inputMode="decimal"
              value={form.totalIngredientCost}
              onChange={(e) => update('totalIngredientCost', e.target.value)}
              placeholder="0"
              required
            />
          </FormField>
          {wastePerPerson !== null && (
            <FormField label="Waste per Person (auto-calculated)" colSpan="half">
              <ReadOnlyField value={formatNumber(wastePerPerson, 2)} suffix="kg" />
            </FormField>
          )}
        </FormSection>

        <FormSection icon={CloudSun} title="Context" description="Weather is fetched automatically for this mess and date">
          <FormField label="Temperature">
            <ReadOnlyField
              value={weather?.weather?.temperatureC != null ? formatNumber(weather.weather.temperatureC, 1) : null}
              suffix="°C"
              loading={weatherLoading}
              failed={!weatherLoading && !!weather?.fetchFailed}
            />
          </FormField>
          <FormField label="Rainfall">
            <ReadOnlyField
              value={weather?.weather?.rainfallMm != null ? formatNumber(weather.weather.rainfallMm, 1) : null}
              suffix="mm"
              loading={weatherLoading}
              failed={!weatherLoading && !!weather?.fetchFailed}
            />
          </FormField>
          <FormField label="Calendar / Event Type">
            <Select value={form.eventType} onChange={(e) => update('eventType', e.target.value as EventType)}>
              {EVENT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </FormSection>

        <FormSection icon={UtensilsCrossed} title="Menu">
          <div className="sm:col-span-2 lg:col-span-3">
            <ScheduledMenuContext slot={scheduledSlot} loading={scheduledLoading} />
          </div>

          <FormField label="Schedule Deviation" colSpan="full">
            <div className="flex items-center gap-3">
              <Switch checked={form.scheduleDeviation} onCheckedChange={(v) => update('scheduleDeviation', v)} />
              <span className="text-sm text-navy-600">
                {form.scheduleDeviation ? 'Yes — meal differed from the scheduled menu' : 'No — followed the scheduled menu'}
              </span>
            </div>
          </FormField>

          {form.scheduleDeviation && (
            <>
              <FormField label="Deviation Reason">
                <Input
                  value={form.deviationReason}
                  onChange={(e) => update('deviationReason', e.target.value)}
                  placeholder="e.g. Ingredient shortage"
                  required={form.scheduleDeviation}
                />
              </FormField>
              <FormField label="Deviation Description" colSpan="half">
                <Textarea
                  rows={1}
                  value={form.deviationDescription}
                  onChange={(e) => update('deviationDescription', e.target.value)}
                  placeholder="What changed and why"
                />
              </FormField>
            </>
          )}

          <FormField
            label="Menu Composition Tags"
            colSpan="full"
            hint={
              scheduledSlot && !tagsTouched
                ? 'Pre-filled from the scheduled menu — edit if what was actually served differed.'
                : undefined
            }
          >
            <ChipSelect
              options={MENU_TAGS}
              value={form.tags}
              onChange={(v) => {
                setTagsTouched(true);
                update('tags', v as MenuTag[]);
              }}
            />
          </FormField>

          <FormField label="Notes (optional)" colSpan="full">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Anything else worth recording about this meal"
            />
          </FormField>
        </FormSection>

        <PredictionBanner
          prediction={prediction?.prediction ?? null}
          loading={predictionLoading}
          actualTotalWasteKg={totalWasteKg > 0 ? totalWasteKg : null}
        />

        <HistoricalInsightBanner data={historical} loading={historicalLoading} />

        <div className="flex items-center justify-end gap-3 pb-4">
          <Button type="button" variant="outline" onClick={resetForm}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={submitting}>
            <Save className="h-4 w-4" />
            Submit Record
          </Button>
        </div>
      </form>
    </div>
  );
}
