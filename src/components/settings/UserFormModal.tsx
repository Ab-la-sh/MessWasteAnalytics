'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { validateUserForm, type UserFormErrors, type UserFormState } from '@/lib/settings-forms';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Field, invalidIf } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import type { ManagedUser, Mess, Role } from '@/types/models';

export function UserFormModal({
  user,
  messes,
  isSelf,
  onClose,
  onSaved,
}: {
  /** null = create a new user. */
  user: ManagedUser | null;
  messes: Mess[];
  /** Editing the signed-in Admin's own row: role and active status are locked. */
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mode = user ? 'edit' : 'create';
  const [form, setForm] = useState<UserFormState>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'DATA_COLLECTOR',
    messId: user?.messId ?? '',
    password: '',
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateUserForm(form, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const isAdminRole = form.role === 'ADMIN';
      if (!user) {
        await api.post('/api/users', {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          messId: isAdminRole ? null : form.messId,
        });
        toast.success(`Created ${form.name.trim()}`);
      } else {
        await api.patch(`/api/users/${user.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          messId: isAdminRole ? null : form.messId,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success(`Saved ${form.name.trim()}`);
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this user'));
    } finally {
      setSaving(false);
    }
  }

  const formId = 'user-form';

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title={user ? 'Edit user' : 'Add user'}
      description={
        user ? 'Change details, reassign their mess, or reset their password.' : 'Create a sign-in for a coordinator or admin.'
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="uf-name" error={errors.name}>
          <Input
            id="uf-name"
            className={invalidIf(errors.name)}
            value={form.name}
            maxLength={100}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="uf-email" error={errors.email}>
          <Input
            id="uf-email"
            className={invalidIf(errors.email)}
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field label="Role" htmlFor="uf-role" hint={isSelf ? "You can't change your own role" : undefined}>
          <Select
            id="uf-role"
            value={form.role}
            disabled={isSelf}
            onChange={(e) => set('role', e.target.value as Role)}
          >
            <option value="DATA_COLLECTOR">Data Collector</option>
            <option value="ADMIN">Administrator</option>
          </Select>
        </Field>

        <Field
          label="Mess"
          htmlFor="uf-mess"
          error={errors.messId}
          hint={form.role === 'ADMIN' ? 'Administrators see every mess' : undefined}
        >
          <Select
            id="uf-mess"
            className={invalidIf(errors.messId)}
            value={form.role === 'ADMIN' ? '' : form.messId}
            disabled={form.role === 'ADMIN'}
            onChange={(e) => set('messId', e.target.value)}
          >
            <option value="">{form.role === 'ADMIN' ? 'All messes' : 'Select a mess…'}</option>
            {messes.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.isActive && m.id !== user?.messId}>
                {m.name}
                {!m.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field
            label={user ? 'Reset password' : 'Password'}
            htmlFor="uf-password"
            error={errors.password}
            hint={
              user
                ? 'Leave blank to keep the current password. Existing sessions stay signed in until they expire.'
                : 'At least 8 characters, with a letter and a number. Share it with the user securely.'
            }
          >
            <Input
              id="uf-password"
              className={invalidIf(errors.password)}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>
        </div>

        {user && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-navy-100 bg-surface-subtle px-4 py-3 sm:col-span-2">
            <div>
              <p className="text-[13px] font-medium text-navy-800">Account active</p>
              <p className="text-[12px] text-navy-500">
                {isSelf
                  ? "You can't deactivate your own account."
                  : 'Deactivated users can no longer sign in, but their records are kept.'}
              </p>
            </div>
            <Switch checked={form.isActive} disabled={isSelf} onCheckedChange={(v) => set('isActive', v)} />
          </div>
        )}
      </form>
    </Modal>
  );
}
