'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { WEEK_TYPES } from '@/lib/form-options';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import type { MenuCopyResult, Mess, WeekType } from '@/types/models';

export function CopyMenuModal({
  targetMess,
  messes,
  defaultToWeek,
  onClose,
  onCopied,
}: {
  /** The mess currently open in the grid — always the destination. */
  targetMess: Mess;
  messes: Mess[];
  defaultToWeek: WeekType;
  onClose: () => void;
  onCopied: () => void;
}) {
  const otherWeek: WeekType = defaultToWeek === 'A' ? 'B' : 'A';
  const [fromMessId, setFromMessId] = useState(targetMess.id);
  const [fromWeek, setFromWeek] = useState<WeekType>(otherWeek);
  const [toWeek, setToWeek] = useState<WeekType>(defaultToWeek);
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);

  const sameSlot = fromMessId === targetMess.id && fromWeek === toWeek;
  const fromMess = messes.find((m) => m.id === fromMessId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sameSlot) return;
    setSaving(true);
    try {
      const result = await api.post<MenuCopyResult>('/api/menu-slots/copy', {
        fromMessId,
        fromWeekType: fromWeek,
        toMessId: targetMess.id,
        toWeekType: toWeek,
        overwrite,
      });
      const parts = [
        result.created > 0 && `${result.created} added`,
        result.updated > 0 && `${result.updated} replaced`,
        result.skipped > 0 && `${result.skipped} kept as they were`,
      ].filter(Boolean);
      toast.success(`Menu copied — ${parts.join(', ') || 'nothing to change'}`);
      onCopied();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not copy the menu'));
    } finally {
      setSaving(false);
    }
  }

  const formId = 'copy-menu-form';

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title="Copy a weekly menu"
      description={`Copy into ${targetMess.name} from another week or mess.`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={sameSlot}>
            Copy menu
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-3 rounded-xl border border-navy-100 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-navy-400">From</p>
            <Field label="Mess" htmlFor="cp-from-mess">
              <Select id="cp-from-mess" value={fromMessId} onChange={(e) => setFromMessId(e.target.value)}>
                {messes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Week" htmlFor="cp-from-week">
              <Select id="cp-from-week" value={fromWeek} onChange={(e) => setFromWeek(e.target.value as WeekType)}>
                {WEEK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <ArrowRight className="mx-auto hidden h-5 w-5 rotate-0 text-navy-300 sm:mb-16 sm:block" />

          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-700">Into</p>
            <Field label="Mess" htmlFor="cp-to-mess">
              <Select id="cp-to-mess" value={targetMess.id} disabled>
                <option value={targetMess.id}>{targetMess.name}</option>
              </Select>
            </Field>
            <Field label="Week" htmlFor="cp-to-week">
              <Select id="cp-to-week" value={toWeek} onChange={(e) => setToWeek(e.target.value as WeekType)}>
                {WEEK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {sameSlot && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            Pick a different week or mess — the source and destination are the same.
          </p>
        )}

        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-navy-100 bg-surface-subtle px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-navy-800">Replace meals that already exist</p>
            <p className="text-[12px] text-navy-500">
              {overwrite
                ? `Every meal in ${targetMess.name} Week ${toWeek} that also exists in ${fromMess?.name ?? 'the source'} Week ${fromWeek} will be overwritten.`
                : 'Off: only empty cells are filled; meals you have already set are left alone.'}
            </p>
          </div>
          <Switch checked={overwrite} onCheckedChange={setOverwrite} />
        </label>
      </form>
    </Modal>
  );
}
