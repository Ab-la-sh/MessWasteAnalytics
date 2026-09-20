'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Save, CloudSun } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Select, Textarea } from '@/components/ui/Input';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Switch } from '@/components/ui/Switch';
import { api, ApiError } from '@/lib/api-client';
import {
  MEAL_SLOTS,
  WEEK_TYPES,
  EVENT_TYPES,
  QUANTITY_UNITS,
  MENU_TAGS,
  weekTypeFromDateClient,
  dayOfWeekFromDateClient,
} from '@/lib/form-options';
import { cn, formatNumber } from '@/lib/utils';
import { dateOnly, dayOfWeekLabel, formatDate, mealSlotLabel } from '@/lib/format';
import type { EventType, MealSlot, MenuTag, QuantityUnit, WasteRecord, WeekType } from '@/types/models';

interface FormState {
  date: string;
  mealSlot: MealSlot;
  weekType: WeekType;
  weekTouched: boolean;
  plateWasteKg: string;
  counterWasteKg: string;
  packagingWasteKg: string;
  headcount: string;
  quantityPrepared: string;
  quantityUnit: QuantityUnit;
  totalIngredientCost: string;
  eventType: EventType;
  scheduleDeviation: boolean;
  deviationReason: string;
  deviationDescription: string;
  tags: MenuTag[];
  notes: string;
}

function toForm(r: WasteRecord): FormState {
  return {
    date: dateOnly(r.date),
    mealSlot: r.mealSlot,
    weekType: r.weekType,
    weekTouched: false,
    plateWasteKg: String(r.plateWasteKg),
    counterWasteKg: String(r.counterWasteKg),
    packagingWasteKg: String(r.packagingWasteKg),
    headcount: String(r.headcount),
    quantityPrepared: String(r.quantityPrepared),
    quantityUnit: r.quantityUnit,
    totalIngredientCost: String(r.totalIngredientCost),
    eventType: r.eventType,
    scheduleDeviation: r.scheduleDeviation,
    deviationReason: r.deviationReason ?? '',
    deviationDescription: r.deviationDescription ?? '',
    tags: r.tags,
    notes: r.notes ?? '',
  };
}

const num = (s: string): number => parseFloat(s) || 0;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({
  label,
  span = 1,
  hint,
  children,
}: {
  label: string;
  span?: 1 | 2 | 3;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(span === 2 && 'sm:col-span-2', span === 3 && 'sm:col-span-3')}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-navy-400">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-navy-400">{title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </div>
  );
}

const FORM_ID = 'edit-record-form';

// Mounted only while a record is being edited (the parent renders it with
// `key={record.id}`), so form state initialises straight from the record.
export function RecordEditModal({
  record,
  onClose,
  onSaved,
}: {
  record: WasteRecord;
  onClose: () => void;
  onSaved: (updated: WasteRecord) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(record));
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onDateChange(date: string) {
    // Week type follows the date unless the user has picked one explicitly.
    setForm((f) => ({
      ...f,
      date,
      weekType: f.weekTouched || !date ? f.weekType : weekTypeFromDateClient(date),
    }));
  }

  const totalWasteKg = num(form.plateWasteKg) + num(form.counterWasteKg) + num(form.packagingWasteKg);
  const headcount = parseInt(form.headcount, 10) || 0;
  const qty = num(form.quantityPrepared);
  const wastePerPerson = headcount > 0 ? totalWasteKg / headcount : null;
  const wastePercent = qty > 0 ? (totalWasteKg / qty) * 100 : null;
  const dayLabel = form.date ? dayOfWeekLabel(dayOfWeekFromDateClient(form.date)) : '—';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.date) {
      toast.error('Date is required');
      return;
    }
    if (form.scheduleDeviation && !form.deviationReason.trim()) {
      toast.error('A reason is required when schedule deviation is on');
      return;
    }

    // Only send weekType when it differs from what the server would derive
    // from the date — i.e. when it's a genuine override. Otherwise let the
    // server derive it (matches the "auto from date, editable" rule).
    const isOverride = form.weekType !== weekTypeFromDateClient(form.date);

    setSaving(true);
    try {
      const { record: updated } = await api.patch<{ record: WasteRecord }>(`/api/waste-records/${record.id}`, {
        date: form.date,
        mealSlot: form.mealSlot,
        ...(isOverride ? { weekType: form.weekType } : {}),
        plateWasteKg: num(form.plateWasteKg),
        counterWasteKg: num(form.counterWasteKg),
        packagingWasteKg: num(form.packagingWasteKg),
        headcount,
        quantityPrepared: qty,
        quantityUnit: form.quantityUnit,
        totalIngredientCost: num(form.totalIngredientCost),
        eventType: form.eventType,
        scheduleDeviation: form.scheduleDeviation,
        deviationReason: form.scheduleDeviation ? form.deviationReason.trim() : null,
        deviationDescription: form.scheduleDeviation ? form.deviationDescription.trim() || null : null,
        tags: form.tags,
        notes: form.notes.trim() || null,
      });
      toast.success('Record updated');
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Another record already exists for that mess, date, and meal slot.');
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      title="Edit waste record"
      description={`${record.mess?.name ?? 'Mess'} · originally ${formatDate(record.date)}, ${mealSlotLabel(record.mealSlot)}`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6">
        <Section title="Meal">
          <Field label="Date">
            <Input type="date" value={form.date} max={todayIso()} onChange={(e) => onDateChange(e.target.value)} required />
          </Field>
          <Field label="Meal slot">
            <Select value={form.mealSlot} onChange={(e) => update('mealSlot', e.target.value as MealSlot)}>
              {MEAL_SLOTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Week type" hint={`${dayLabel} · follows the date unless changed`}>
            <Select
              value={form.weekType}
              onChange={(e) => setForm((f) => ({ ...f, weekType: e.target.value as WeekType, weekTouched: true }))}
            >
              {WEEK_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title="Waste (kg)">
          <Field label="Plate waste">
            <Input type="number" step="0.1" min="0" inputMode="decimal" value={form.plateWasteKg} onChange={(e) => update('plateWasteKg', e.target.value)} required />
          </Field>
          <Field label="Counter / serving waste">
            <Input type="number" step="0.1" min="0" inputMode="decimal" value={form.counterWasteKg} onChange={(e) => update('counterWasteKg', e.target.value)} required />
          </Field>
          <Field label="Packaging waste">
            <Input type="number" step="0.1" min="0" inputMode="decimal" value={form.packagingWasteKg} onChange={(e) => update('packagingWasteKg', e.target.value)} required />
          </Field>
          <div className="rounded-xl bg-brand-50/60 px-4 py-3 text-[13px] text-navy-600 sm:col-span-3">
            <span className="font-semibold text-navy-900">Total {formatNumber(totalWasteKg, 2)} kg</span>
            {wastePerPerson !== null && <> · {formatNumber(wastePerPerson, 3)} kg per person</>}
            {wastePercent !== null && <> · {formatNumber(wastePercent, 1)}% of prepared</>}
            <span className="text-navy-400"> — recalculated on the server when you save</span>
          </div>
        </Section>

        <Section title="Volume & cost">
          <Field label="Headcount">
            <Input type="number" step="1" min="0" inputMode="numeric" value={form.headcount} onChange={(e) => update('headcount', e.target.value)} required />
          </Field>
          <Field label="Quantity prepared">
            <div className="flex gap-2">
              <Input type="number" step="0.1" min="0" inputMode="decimal" value={form.quantityPrepared} onChange={(e) => update('quantityPrepared', e.target.value)} required />
              <Select className="w-24 shrink-0" value={form.quantityUnit} onChange={(e) => update('quantityUnit', e.target.value as QuantityUnit)}>
                {QUANTITY_UNITS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Total ingredient cost (₹)">
            <Input type="number" step="1" min="0" inputMode="decimal" value={form.totalIngredientCost} onChange={(e) => update('totalIngredientCost', e.target.value)} required />
          </Field>
        </Section>

        <Section title="Context & menu">
          <Field label="Event type">
            <Select value={form.eventType} onChange={(e) => update('eventType', e.target.value as EventType)}>
              {EVENT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weather" span={2}>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-navy-200 bg-navy-50/60 px-3 text-sm text-navy-600">
              <CloudSun className="h-4 w-4 text-navy-400" />
              {record.temperatureC != null ? `${formatNumber(record.temperatureC, 1)} °C` : '—'}
              <span className="text-navy-300">·</span>
              {record.rainfallMm != null ? `${formatNumber(record.rainfallMm, 1)} mm` : '—'}
              <span className="ml-auto text-[11.5px] text-navy-400">auto-filled; refreshed if the date changes</span>
            </div>
          </Field>

          <Field label="Schedule deviation" span={3}>
            <div className="flex items-center gap-3">
              <Switch checked={form.scheduleDeviation} onCheckedChange={(v) => update('scheduleDeviation', v)} />
              <span className="text-sm text-navy-600">
                {form.scheduleDeviation ? 'Meal differed from the scheduled menu' : 'Followed the scheduled menu'}
              </span>
            </div>
          </Field>
          {form.scheduleDeviation && (
            <>
              <Field label="Deviation reason">
                <Input value={form.deviationReason} onChange={(e) => update('deviationReason', e.target.value)} placeholder="e.g. Ingredient shortage" required />
              </Field>
              <Field label="Deviation description" span={2}>
                <Textarea rows={2} value={form.deviationDescription} onChange={(e) => update('deviationDescription', e.target.value)} placeholder="What changed and why" />
              </Field>
            </>
          )}

          <Field label="Menu composition tags" span={3}>
            <ChipSelect options={MENU_TAGS} value={form.tags} onChange={(v) => update('tags', v as MenuTag[])} />
          </Field>
          <Field label="Notes" span={3}>
            <Textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional" />
          </Field>
        </Section>
      </form>
    </Modal>
  );
}
