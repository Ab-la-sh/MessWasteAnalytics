import { Label } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

/** Label + control + inline error (or hint) — the standard form row for modals and settings forms. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-navy-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Tailwind classes that flag an input as invalid; pass to the control's className. */
export const INVALID_INPUT = 'border-red-300 focus:border-red-400 focus:ring-red-100';
export const invalidIf = (error?: string) => cn(error && INVALID_INPUT);
