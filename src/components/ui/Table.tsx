'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDir } from '@/types/models';

type Align = 'left' | 'right' | 'center';
const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

/** Horizontally scrollable table shell so wide tables never break the page layout on phones. */
export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cn('w-full min-w-[880px] border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  align = 'left',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-navy-100 bg-surface-subtle px-4 py-2.5',
        'text-[11.5px] font-semibold uppercase tracking-wide text-navy-500',
        ALIGN[align],
        className
      )}
      {...props}
    />
  );
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: SortDir;
  onSort: (key: K) => void;
  align?: Align;
}) {
  const active = sortKey === activeKey;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th align={align} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'group inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-navy-800',
          align === 'right' && 'flex-row-reverse',
          active && 'text-brand-700'
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', active ? 'text-brand-600' : 'text-navy-300 group-hover:text-navy-500')} />
      </button>
    </Th>
  );
}

export function Td({
  className,
  align = 'left',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <td
      className={cn('whitespace-nowrap border-b border-navy-50 px-4 py-3 text-navy-700', ALIGN[align], className)}
      {...props}
    />
  );
}
