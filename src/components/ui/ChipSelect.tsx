'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChipSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (v: string) => {
    if (disabled) return;
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all',
              active
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300 hover:bg-navy-50',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            {active && <Check className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
