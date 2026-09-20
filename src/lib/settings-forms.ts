// Client-side validation for the Settings forms. These mirror the zod schemas
// in src/lib/validation/* so people get instant, specific feedback — the API
// still validates everything again and remains the source of truth.

import type { Role } from '@/types/models';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors passwordSchema in src/lib/validation/auth.ts. Returns an error message or null. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters';
  if (pw.length > 72) return 'Use at most 72 characters';
  if (!/[A-Za-z]/.test(pw)) return 'Include at least one letter';
  if (!/[0-9]/.test(pw)) return 'Include at least one number';
  return null;
}

// ---------------------------------------------------------------------------
// User form (Admin create / edit)
// ---------------------------------------------------------------------------

export interface UserFormState {
  name: string;
  email: string;
  role: Role;
  messId: string; // '' = none
  /** Required when creating; when editing, blank means "leave unchanged". */
  password: string;
  isActive: boolean;
}

export type UserFormErrors = Partial<Record<'name' | 'email' | 'messId' | 'password', string>>;

export function validateUserForm(f: UserFormState, mode: 'create' | 'edit'): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!f.name.trim()) errors.name = 'Name is required';
  else if (f.name.trim().length > 100) errors.name = 'Name is too long';

  if (!f.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(f.email.trim())) errors.email = 'Enter a valid email address';

  if (f.role === 'DATA_COLLECTOR' && !f.messId) errors.messId = 'Choose a mess for this Data Collector';

  if (mode === 'create' || f.password) {
    const problem = f.password ? passwordProblem(f.password) : 'Password is required';
    if (problem) errors.password = problem;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Mess form (Admin create / edit)
// ---------------------------------------------------------------------------

export interface MessFormState {
  name: string;
  code: string;
  latitude: string;
  longitude: string;
  timezone: string;
  isActive: boolean;
}

export type MessFormErrors = Partial<Record<'name' | 'code' | 'latitude' | 'longitude' | 'timezone', string>>;

export function validateMessForm(f: MessFormState): MessFormErrors {
  const errors: MessFormErrors = {};
  if (!f.name.trim()) errors.name = 'Name is required';

  const code = f.code.trim();
  if (!code) errors.code = 'Code is required';
  else if (code.length > 20) errors.code = 'At most 20 characters';
  else if (!/^[A-Za-z0-9_-]+$/.test(code)) errors.code = 'Letters, numbers, - and _ only';

  const lat = Number(f.latitude);
  if (f.latitude.trim() === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.latitude = 'Latitude must be between -90 and 90';
  }
  const lng = Number(f.longitude);
  if (f.longitude.trim() === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
    errors.longitude = 'Longitude must be between -180 and 180';
  }

  if (!f.timezone.trim()) errors.timezone = 'Timezone is required (e.g. Asia/Kolkata)';
  else {
    try {
      new Intl.DateTimeFormat('en', { timeZone: f.timezone.trim() });
    } catch {
      errors.timezone = 'Not a recognised IANA timezone (e.g. Asia/Kolkata)';
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Change-password form
// ---------------------------------------------------------------------------

export interface PasswordChangeState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeState, string>>;

export function validatePasswordChange(f: PasswordChangeState): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!f.currentPassword) errors.currentPassword = 'Enter your current password';

  const problem = passwordProblem(f.newPassword);
  if (problem) errors.newPassword = problem;
  else if (f.newPassword === f.currentPassword) errors.newPassword = 'Must be different from the current password';

  if (!errors.newPassword && f.confirmPassword !== f.newPassword) {
    errors.confirmPassword = "Passwords don't match";
  }
  return errors;
}
