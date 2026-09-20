'use client';

import { Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/lib/use-api';
import { formatCurrency, formatInt, formatNumber } from '@/lib/utils';
import {
  dayOfWeekLabel,
  eventTypeLabel,
  formatDate,
  formatDateTime,
  formatQuantity,
  mealSlotLabel,
  menuTagLabel,
} from '@/lib/format';
import type { WasteRecord } from '@/types/models';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-surface-subtle px-4 py-3">
      <p className="text-[12px] font-medium text-navy-500">{label}</p>
      <p className="mt-0.5 text-[20px] font-semibold tracking-tight text-navy-900">{value}</p>
      {sub && <p className="text-[11.5px] text-navy-400">{sub}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-navy-50 py-2 last:border-0">
      <dt className="text-[13px] text-navy-500">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-navy-800">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-navy-400">{children}</h4>;
}

const FLAG_LABELS: { key: 'hasBiryani' | 'hasPaneer' | 'hasEggBreakfast' | 'hasDessert' | 'hasDosa' | 'hasParatha'; label: string }[] = [
  { key: 'hasBiryani', label: 'Biryani' },
  { key: 'hasPaneer', label: 'Paneer' },
  { key: 'hasEggBreakfast', label: 'Egg breakfast' },
  { key: 'hasDessert', label: 'Dessert' },
  { key: 'hasDosa', label: 'Dosa' },
  { key: 'hasParatha', label: 'Paratha' },
];

export function RecordDetailModal({
  record,
  onClose,
  onEdit,
}: {
  record: WasteRecord | null;
  onClose: () => void;
  onEdit: (record: WasteRecord) => void;
}) {
  // The list endpoint omits the linked MenuSlot; fetch the single record to show the scheduled menu.
  const { data, loading } = useApi<{ record: WasteRecord }>(
    record ? `/api/waste-records/${record.id}` : '/api/waste-records/none',
    record ? {} : null
  );

  const detail = record && data?.record.id === record.id ? data.record : null;
  const r = detail ?? record;
  const menuSlot = detail?.menuSlot ?? null;

  const totalKg = r?.totalWasteKg ?? 0;
  const pct = (kg: number) => (totalKg > 0 ? (kg / totalKg) * 100 : 0);

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      size="lg"
      title={r ? `${formatDate(r.date)} · ${mealSlotLabel(r.mealSlot)}` : 'Record'}
      description={
        r ? `${r.mess?.name ?? 'Mess'} · ${dayOfWeekLabel(r.dayOfWeek)} · Week ${r.weekType}` : undefined
      }
      footer={
        r ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={() => onEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit record
            </Button>
          </>
        ) : undefined
      }
    >
      {r && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total waste" value={`${formatNumber(r.totalWasteKg, 2)} kg`} />
            <Stat label="Waste per person" value={`${formatNumber(r.wastePerPerson, 3)} kg`} sub={`${formatInt(r.headcount)} people`} />
            <Stat
              label="Waste of prepared"
              value={`${formatNumber(r.wastePercent, 1)}%`}
              sub={`of ${formatQuantity(r.quantityPrepared, r.quantityUnit)} prepared`}
            />
          </div>

          <div>
            <SectionTitle>Waste composition</SectionTitle>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-navy-100">
              <div className="bg-brand-600" style={{ width: `${pct(r.plateWasteKg)}%` }} />
              <div className="bg-brand-300" style={{ width: `${pct(r.counterWasteKg)}%` }} />
              <div className="bg-navy-300" style={{ width: `${pct(r.packagingWasteKg)}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
              <div className="flex items-center gap-1.5 text-navy-600">
                <span className="h-2 w-2 rounded-full bg-brand-600" />
                Plate <span className="font-medium text-navy-900">{formatNumber(r.plateWasteKg, 1)} kg</span>
              </div>
              <div className="flex items-center gap-1.5 text-navy-600">
                <span className="h-2 w-2 rounded-full bg-brand-300" />
                Counter <span className="font-medium text-navy-900">{formatNumber(r.counterWasteKg, 1)} kg</span>
              </div>
              <div className="flex items-center gap-1.5 text-navy-600">
                <span className="h-2 w-2 rounded-full bg-navy-300" />
                Packaging <span className="font-medium text-navy-900">{formatNumber(r.packagingWasteKg, 1)} kg</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <div>
              <SectionTitle>Volume &amp; cost</SectionTitle>
              <dl>
                <Row label="Headcount">{formatInt(r.headcount)}</Row>
                <Row label="Quantity prepared">{formatQuantity(r.quantityPrepared, r.quantityUnit)}</Row>
                <Row label="Ingredient cost">{formatCurrency(r.totalIngredientCost)}</Row>
                <Row label="Cost per head">
                  {r.headcount > 0 ? `₹${formatNumber(r.totalIngredientCost / r.headcount, 2)}` : '—'}
                </Row>
              </dl>
            </div>
            <div>
              <SectionTitle>Context</SectionTitle>
              <dl>
                <Row label="Temperature">{r.temperatureC != null ? `${formatNumber(r.temperatureC, 1)} °C` : '—'}</Row>
                <Row label="Rainfall">{r.rainfallMm != null ? `${formatNumber(r.rainfallMm, 1)} mm` : '—'}</Row>
                <Row label="Event type">{eventTypeLabel(r.eventType)}</Row>
                <Row label="Week type">Week {r.weekType}</Row>
              </dl>
            </div>
          </div>

          <div>
            <SectionTitle>Menu</SectionTitle>
            <div className="space-y-3 rounded-xl border border-navy-100 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {r.scheduleDeviation ? <Badge tone="warning">Deviated from schedule</Badge> : <Badge tone="success">Followed schedule</Badge>}
                {r.tags.map((t) => (
                  <Badge key={t} tone="brand">
                    {menuTagLabel(t)}
                  </Badge>
                ))}
                {r.tags.length === 0 && <span className="text-[13px] text-navy-400">No composition tags</span>}
              </div>

              {r.scheduleDeviation && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  <p className="font-medium">{r.deviationReason || 'No reason recorded'}</p>
                  {r.deviationDescription && <p className="mt-0.5 text-amber-800">{r.deviationDescription}</p>}
                </div>
              )}

              {loading && !detail ? (
                <Skeleton className="h-9 w-full" />
              ) : menuSlot ? (
                <div className="border-t border-navy-50 pt-3 text-[13px] text-navy-600">
                  <p className="mb-1.5 text-[12px] font-medium text-navy-500">Scheduled menu for this slot</p>
                  <p>
                    {menuSlot.itemCount} items · {formatNumber(menuSlot.pctGravyDishes, 0)}% gravy dishes
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {FLAG_LABELS.filter((f) => menuSlot[f.key]).map((f) => (
                      <Badge key={f.key}>{f.label}</Badge>
                    ))}
                    {menuSlot.tags.map((t) => (
                      <Badge key={t} tone="brand">
                        {menuTagLabel(t)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="border-t border-navy-50 pt-3 text-[13px] text-navy-400">
                  No scheduled menu is defined for this mess, week type, day, and meal slot.
                </p>
              )}
            </div>
          </div>

          {r.notes && (
            <div>
              <SectionTitle>Notes</SectionTitle>
              <p className="whitespace-pre-wrap rounded-xl bg-navy-50/60 px-4 py-3 text-[13px] text-navy-700">{r.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-8 text-[12.5px] text-navy-400 sm:grid-cols-2">
            <p>
              Logged by <span className="font-medium text-navy-600">{r.createdBy?.name ?? 'Unknown'}</span> ·{' '}
              {formatDateTime(r.createdAt)}
            </p>
            {r.updatedBy && (
              <p>
                Last edited by <span className="font-medium text-navy-600">{r.updatedBy.name}</span> ·{' '}
                {formatDateTime(r.updatedAt)}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
