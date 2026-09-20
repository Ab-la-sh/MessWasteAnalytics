'use client';

import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Table, Th, SortableTh, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatInt, formatNumber, cn } from '@/lib/utils';
import { dayOfWeekLabel, formatDate, formatQuantity, mealSlotLabel } from '@/lib/format';
import type { RecordSortKey } from '@/lib/record-filters';
import type { SortDir, WasteRecord } from '@/types/models';

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-800';

export function RecordsTable({
  records,
  refreshing,
  sortBy,
  sortDir,
  onSort,
  onView,
  onEdit,
  onDelete,
  canDelete,
}: {
  records: WasteRecord[];
  /** A refetch is in flight — dim the rows instead of swapping in a skeleton. */
  refreshing?: boolean;
  sortBy: RecordSortKey;
  sortDir: SortDir;
  onSort: (key: RecordSortKey) => void;
  onView: (record: WasteRecord) => void;
  onEdit: (record: WasteRecord) => void;
  onDelete: (record: WasteRecord) => void;
  canDelete: boolean;
}) {
  const sortProps = { activeKey: sortBy, dir: sortDir, onSort };

  return (
    <div className={cn('transition-opacity duration-150', refreshing && 'opacity-60')}>
      <Table>
        <thead>
          <tr>
            <SortableTh label="Date" sortKey="date" {...sortProps} />
            <Th>Mess</Th>
            <Th>Meal</Th>
            <SortableTh label="Headcount" sortKey="headcount" align="right" {...sortProps} />
            <SortableTh label="Qty prepared" sortKey="quantityPrepared" align="right" {...sortProps} />
            <SortableTh label="Total waste" sortKey="totalWasteKg" align="right" {...sortProps} />
            <SortableTh label="Waste / person" sortKey="wastePerPerson" align="right" {...sortProps} />
            <SortableTh label="Ingredient cost" sortKey="totalIngredientCost" align="right" {...sortProps} />
            <Th align="center">Week</Th>
            <Th>Schedule</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr
              key={r.id}
              onClick={() => onView(r)}
              className="cursor-pointer transition-colors hover:bg-brand-50/40"
            >
              <Td>
                <div className="font-medium text-navy-900">{formatDate(r.date)}</div>
                <div className="text-[11.5px] text-navy-400">{dayOfWeekLabel(r.dayOfWeek)}</div>
              </Td>
              <Td>{r.mess?.name ?? '—'}</Td>
              <Td>{mealSlotLabel(r.mealSlot)}</Td>
              <Td align="right">{formatInt(r.headcount)}</Td>
              <Td align="right">{formatQuantity(r.quantityPrepared, r.quantityUnit)}</Td>
              <Td align="right" className="font-semibold text-navy-900">
                {formatNumber(r.totalWasteKg, 1)} kg
              </Td>
              <Td align="right">{formatNumber(r.wastePerPerson, 2)} kg</Td>
              <Td align="right">{formatCurrency(r.totalIngredientCost)}</Td>
              <Td align="center">
                <Badge tone={r.weekType === 'A' ? 'brand' : 'neutral'}>{r.weekType}</Badge>
              </Td>
              <Td>
                {r.scheduleDeviation ? (
                  <Badge tone="warning" title={r.deviationReason ?? undefined}>
                    Deviated
                  </Badge>
                ) : (
                  <Badge tone="success">As scheduled</Badge>
                )}
              </Td>
              <Td align="right">
                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={iconBtn} title="View details" aria-label="View details" onClick={() => onView(r)}>
                    <Eye className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconBtn} title="Edit record" aria-label="Edit record" onClick={() => onEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      className={cn(iconBtn, 'hover:bg-red-50 hover:text-red-600')}
                      title="Delete record"
                      aria-label="Delete record"
                      onClick={() => onDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function RecordsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
