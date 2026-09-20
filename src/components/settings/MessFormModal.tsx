'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { validateMessForm, type MessFormErrors, type MessFormState } from '@/lib/settings-forms';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field, invalidIf } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import type { Mess } from '@/types/models';

// Same default the API applies to a new mess (IIT_MADRAS_LOCATION in src/lib/constants.ts).
const DEFAULT_LOCATION = { latitude: '12.99151', longitude: '80.23362', timezone: 'Asia/Kolkata' };

export function MessFormModal({
  mess,
  onClose,
  onSaved,
}: {
  /** null = create a new mess. */
  mess: Mess | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MessFormState>({
    name: mess?.name ?? '',
    code: mess?.code ?? '',
    latitude: mess ? String(mess.latitude) : DEFAULT_LOCATION.latitude,
    longitude: mess ? String(mess.longitude) : DEFAULT_LOCATION.longitude,
    timezone: mess?.timezone ?? DEFAULT_LOCATION.timezone,
    isActive: mess?.isActive ?? true,
  });
  const [errors, setErrors] = useState<MessFormErrors>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MessFormState>(key: K, value: MessFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateMessForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      timezone: form.timezone.trim(),
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (mess) {
        await api.patch(`/api/mess/${mess.id}`, payload);
        toast.success(`Saved ${payload.name}`);
      } else {
        await api.post('/api/mess', payload);
        toast.success(`Created ${payload.name}`);
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this mess'));
    } finally {
      setSaving(false);
    }
  }

  const formId = 'mess-form';

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title={mess ? 'Edit mess' : 'Add mess'}
      description="Weather for this mess is looked up from its coordinates."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {mess ? 'Save changes' : 'Create mess'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="mf-name" error={errors.name}>
          <Input
            id="mf-name"
            className={invalidIf(errors.name)}
            placeholder="Mess 5"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Code" htmlFor="mf-code" error={errors.code} hint="Short unique code, e.g. M5">
          <Input
            id="mf-code"
            className={invalidIf(errors.code)}
            placeholder="M5"
            value={form.code}
            maxLength={20}
            onChange={(e) => set('code', e.target.value)}
          />
        </Field>
        <Field label="Latitude" htmlFor="mf-lat" error={errors.latitude}>
          <Input
            id="mf-lat"
            className={invalidIf(errors.latitude)}
            inputMode="decimal"
            value={form.latitude}
            onChange={(e) => set('latitude', e.target.value)}
          />
        </Field>
        <Field label="Longitude" htmlFor="mf-lng" error={errors.longitude}>
          <Input
            id="mf-lng"
            className={invalidIf(errors.longitude)}
            inputMode="decimal"
            value={form.longitude}
            onChange={(e) => set('longitude', e.target.value)}
          />
        </Field>
        <Field
          label="Timezone"
          htmlFor="mf-tz"
          error={errors.timezone}
          hint="IANA name, e.g. Asia/Kolkata"
          className="sm:col-span-2"
        >
          <Input
            id="mf-tz"
            className={invalidIf(errors.timezone)}
            value={form.timezone}
            onChange={(e) => set('timezone', e.target.value)}
          />
        </Field>

        {mess && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 sm:col-span-2">
            Changing coordinates only affects weather fetched from now on — days already cached keep their original
            values.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-navy-100 bg-surface-subtle px-4 py-3 sm:col-span-2">
          <div>
            <p className="text-[13px] font-medium text-navy-800">Active</p>
            <p className="text-[12px] text-navy-500">
              Inactive messes disappear from the top-bar selector; all their records are kept.
            </p>
          </div>
          <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
        </div>
      </form>
    </Modal>
  );
}
