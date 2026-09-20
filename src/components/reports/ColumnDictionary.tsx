'use client';

import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { EXPORT_COLUMNS, type ColumnGroup } from '@/lib/export-columns';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const GROUP_ORDER: ColumnGroup[] = ['Identity', 'Calendar & context', 'Waste', 'Volume & cost', 'Weather', 'Menu', 'Notes'];

/** Collapsible reference for every column in the export, in file order within each group. */
export function ColumnDictionary() {
  const [open, setOpen] = useState(false);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({ group, columns: EXPORT_COLUMNS.filter((c) => c.group === group) })).filter(
        (g) => g.columns.length > 0
      ),
    []
  );

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-navy-50/50"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
            <BookOpen className="h-[18px] w-[18px] text-brand-600" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-navy-900">Column dictionary</span>
            <span className="block text-[12.5px] text-navy-500">
              {EXPORT_COLUMNS.length} flat, ML-ready columns — one row per meal, booleans as 0/1, tags joined with “;”
            </span>
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-navy-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-5 border-t border-navy-100 p-5">
          {groups.map(({ group, columns }) => (
            <div key={group}>
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-navy-400">{group}</p>
              <dl className="divide-y divide-navy-50 rounded-xl border border-navy-100">
                {columns.map((c) => (
                  <div key={c.name} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[220px_72px_1fr] sm:items-baseline sm:gap-3">
                    <dt className="font-mono text-[12.5px] font-medium text-navy-800">{c.name}</dt>
                    <dd>
                      <Badge>{c.type}</Badge>
                    </dd>
                    <dd className="text-[13px] text-navy-500">{c.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
