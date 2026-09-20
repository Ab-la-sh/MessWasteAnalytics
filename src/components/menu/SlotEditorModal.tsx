'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { DAYS_OF_WEEK, MEAL_SLOTS, MENU_TAGS } from '@/lib/form-options';
import { FLAG_DEFS, draftFromSlot, validateSlotDraft, type SlotDraft, type SlotDraftErrors } from '@/lib/menu-grid';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Field, invalidIf } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { DayOfWeek, MealSlot, MenuSlot, MenuTag, WeekType } from '@/types/models';

export function SlotEditorModal({
  messId,
  messName,
  weekType,
  dayOfWeek,
  mealSlot,
  slot,
  onClose,
  onSaved,
}: {
  messId: string;
  messName: string;
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  mealSlot: MealSlot;
  /** null = this cell has no scheduled meal yet (create). */
  slot: MenuSlot | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SlotDraft>(() => draftFromSlot(slot));
  const [errors, setErrors] = useState<SlotDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dayLabel = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? dayOfWeek;
  const mealLabel = MEAL_SLOTS.find((m) => m.value === mealSlot)?.label ?? mealSlot;

  function setField<K extends 'itemCount' | 'pctGravyDishes' | 'notes'>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateSlotDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      if (slot) {
        await api.patch(`/api/menu-slots/${slot.id}`, result.value);
      } else {
        await api.post('/api/menu-slots', { messId, weekType, dayOfWeek, mealSlot, ...result.value });
      }
      toast.success(`${dayLabel} ${mealLabel} (Week ${weekType}) saved`);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this menu slot'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!slot) return;
    setDeleting(true);
    try {
      await api.delete(`/api/menu-slots/${slot.id}`);
      toast.success(`Removed ${dayLabel} ${mealLabel} (Week ${weekType})`);
      setConfirmDelete(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove this menu slot'));
    } finally {
      setDeleting(false);
    }
  }

  const formId = 'slot-form';
  const busy = saving || deleting;

  return (
    <>
      <Modal
        open
        size="md"
        onClose={onClose}
        // While the remove-confirmation is open, Esc/backdrop should only dismiss *it*.
        dismissible={!busy && !confirmDelete}
        title={`${dayLabel} · ${mealLabel}`}
        description={`${messName} · Week ${weekType}`}
        footer={
          <>
            {slot && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              {slot ? 'Save changes' : 'Add to schedule'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Number of items" htmlFor="sl-items" error={errors.itemCount}>
              <Input
                id="sl-items"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={invalidIf(errors.itemCount)}
                value={draft.itemCount}
                onChange={(e) => setField('itemCount', e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Gravy dishes (%)" htmlFor="sl-gravy" error={errors.pctGravyDishes}>
              <Input
                id="sl-gravy"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                className={invalidIf(errors.pctGravyDishes)}
                value={draft.pctGravyDishes}
                onChange={(e) => setField('pctGravyDishes', e.target.value)}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-navy-700">Menu includes</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FLAG_DEFS.map((f) => (
                <label
                  key={f.key}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-navy-100 px-3 py-2 transition-colors hover:bg-navy-50/60"
                >
                  <span className="text-[13px] text-navy-700">{f.label}</span>
                  <Switch
                    checked={draft.flags[f.key]}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, flags: { ...d.flags, [f.key]: v } }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-navy-700">Menu composition</p>
            <ChipSelect
              options={MENU_TAGS}
              value={draft.tags}
              onChange={(v) => setDraft((d) => ({ ...d, tags: v as MenuTag[] }))}
            />
            <p className="mt-1.5 text-[11.5px] text-navy-400">
              Describes what is normally served in this slot. The tag list itself is fixed by the system.
            </p>
          </div>

          <Field label="Notes (optional)" htmlFor="sl-notes">
            <Textarea
              id="sl-notes"
              rows={2}
              placeholder="e.g. Special sweet on the first Sunday"
              value={draft.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        destructive
        loading={deleting}
        title="Remove this scheduled meal?"
        description={
          <>
            <strong>
              {dayLabel} {mealLabel}
            </strong>{' '}
            (Week {weekType}) will no longer have a schedule. Existing waste records keep their data but lose the link to
            this menu.
          </>
        }
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
