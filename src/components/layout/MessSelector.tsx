'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Store, Check } from 'lucide-react';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export function MessSelector() {
  const { messes, loading, selectedMessId, setSelectedMessId, selectedMess } = useMess();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isDataCollector = user?.role === 'DATA_COLLECTOR';

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const label = loading
    ? 'Loading…'
    : selectedMessId === ALL_MESSES
      ? 'All Messes'
      : (selectedMess?.name ?? 'Select mess');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={isDataCollector || loading}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 text-[13px] font-medium text-navy-700',
          'transition-colors hover:border-navy-300 hover:bg-navy-50',
          (isDataCollector || loading) && 'cursor-default opacity-80 hover:bg-white hover:border-navy-200'
        )}
      >
        <Store className="h-3.5 w-3.5 text-brand-500" />
        {label}
        {!isDataCollector && <ChevronDown className="h-3.5 w-3.5 text-navy-400" />}
      </button>

      {open && !isDataCollector && (
        <div className="absolute right-0 z-40 mt-2 w-56 animate-fade-in rounded-xl border border-navy-100 bg-white p-1.5 shadow-popover">
          <button
            onClick={() => {
              setSelectedMessId(ALL_MESSES);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-navy-700 hover:bg-navy-50"
          >
            All Messes (combined)
            {selectedMessId === ALL_MESSES && <Check className="h-3.5 w-3.5 text-brand-600" />}
          </button>
          <div className="my-1 h-px bg-navy-100" />
          {messes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMessId(m.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-navy-700 hover:bg-navy-50"
            >
              {m.name}
              {selectedMessId === m.id && <Check className="h-3.5 w-3.5 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
