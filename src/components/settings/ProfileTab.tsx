'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, UserRound } from 'lucide-react';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { useAuth } from '@/lib/auth-context';
import {
  validatePasswordChange,
  type PasswordChangeErrors,
  type PasswordChangeState,
} from '@/lib/settings-forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

const EMPTY_PW: PasswordChangeState = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ProfileTab() {
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const nameChanged = name.trim() !== (user?.name ?? '') && name.trim().length > 0;

  const [pw, setPw] = useState<PasswordChangeState>(EMPTY_PW);
  const [pwErrors, setPwErrors] = useState<PasswordChangeErrors>({});
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!nameChanged) return;
    setSavingName(true);
    try {
      await api.patch('/api/auth/me', { name: name.trim() });
      await refresh(); // sidebar + top bar read the name from the auth context
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update your profile'));
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const errors = validatePasswordChange(pw);
    setPwErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingPw(true);
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      toast.success('Password changed');
      setPw(EMPTY_PW);
      setPwErrors({});
    } catch (err) {
      const message = errorMessage(err, 'Could not change your password');
      // The API's "incorrect" message belongs on the field it's about.
      if (/current password/i.test(message)) setPwErrors({ currentPassword: message });
      else toast.error(message);
    } finally {
      setSavingPw(false);
    }
  }

  function setPwField(key: keyof PasswordChangeState, value: string) {
    setPw((p) => ({ ...p, [key]: value }));
    if (pwErrors[key]) setPwErrors((e) => ({ ...e, [key]: undefined }));
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="animate-slide-up">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <UserRound className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <div>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>How you appear across MessWaste Analytics.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="pf-name">Display name</Label>
              <Input id="pf-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" value={user.email} disabled readOnly />
              <p className="mt-1 text-[11.5px] text-navy-400">Sign-in email can only be changed by an administrator.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-navy-500">
              <span>Role</span>
              <Badge tone={user.role === 'ADMIN' ? 'brand' : 'neutral'}>
                {user.role === 'ADMIN' ? 'Administrator' : 'Data Collector'}
              </Badge>
              {user.role === 'DATA_COLLECTOR' && (
                <>
                  <span className="ml-2">Mess</span>
                  <Badge>{user.mess?.name ?? '—'}</Badge>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingName} disabled={!nameChanged}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="animate-slide-up">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <KeyRound className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <div>
              <CardTitle>Change password</CardTitle>
              <CardDescription>At least 8 characters, with a letter and a number.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            <PasswordField
              id="pw-current"
              label="Current password"
              autoComplete="current-password"
              value={pw.currentPassword}
              error={pwErrors.currentPassword}
              onChange={(v) => setPwField('currentPassword', v)}
            />
            <PasswordField
              id="pw-new"
              label="New password"
              autoComplete="new-password"
              value={pw.newPassword}
              error={pwErrors.newPassword}
              onChange={(v) => setPwField('newPassword', v)}
            />
            <PasswordField
              id="pw-confirm"
              label="Confirm new password"
              autoComplete="new-password"
              value={pw.confirmPassword}
              error={pwErrors.confirmPassword}
              onChange={(v) => setPwField('confirmPassword', v)}
            />
            <div className="flex justify-end">
              <Button type="submit" loading={savingPw}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        aria-invalid={!!error}
        className={error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
