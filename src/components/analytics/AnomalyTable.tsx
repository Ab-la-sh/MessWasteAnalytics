'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Input';
import { Table, Th, Td } from '@/components/ui/Table';
import { useApi } from '@/lib/use-api';
import { eventTypeLabel, formatDate, mealSlotLabel } from '@/lib/format';
import { cn, formatNumber } from '@/lib/utils';
import type { AnomaliesResponse, AnomalyRow } from '@/types/models';
import type { AnalyticsScope } from '@/components/analytics/types';

const THRESHOLDS = [1, 1.5, 2, 2.5, 3];

export function AnomalyTable({ scope }: { scope: AnalyticsScope | null }) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(1.5);

  const { data, loading, error, reload } = useApi<AnomaliesResponse>(
    '/api/analytics/anomalies',
    scope ? { ...scope, thresholdStdDev: threshold, limit: 15 } : null
  );

  // Jump to the Records page filtered down to (roughly) this one meal. Search on
  // the mess name keeps it to the right mess even from the combined view.
  function openInRecords(a: AnomalyRow) {
    const params = new URLSearchParams({ dateFrom: a.date, dateTo: a.date, mealSlot: a.mealSlot, search: a.messName });
    router.push(`/records?${params.toString()}`);
  }

  const anomalies = data?.anomalies ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-wrap pb-4">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            High-waste alerts
          </CardTitle>
          <CardDescription>
            Meals whose waste % is unusually high for that mess and meal slot. Needs at least 5 records per mess and
            meal before anything can be flagged.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-navy-500">Sensitivity</span>
          <Select
            aria-label="Sensitivity threshold"
            className="h-8 w-[150px] text-[13px]"
            value={String(threshold)}
            onChange={(e) => setThreshold(Number(e.target.value))}
          >
            {THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                ≥ {t}σ above normal{t === 1.5 ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {!data && !error ? (
          <div className="space-y-2 p-5 pt-0">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error && !data ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load alerts"
            description={error}
            action={
              <Button type="button" variant="outline" size="sm" onClick={reload}>
                Try again
              </Button>
            }
          />
        ) : anomalies.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No unusual waste spikes"
            description="Nothing stands out at this sensitivity — or there aren't enough records per mess and meal yet. Try a lower threshold."
          />
        ) : (
          <div className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Mess</Th>
                  <Th>Meal</Th>
                  <Th align="right">Waste of prepared</Th>
                  <Th align="right">Usual for this meal</Th>
                  <Th align="right">Spike</Th>
                  <Th align="right">Total waste</Th>
                  <Th>Context</Th>
                  <Th align="right">
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <div className="font-medium text-navy-900">{formatDate(a.date)}</div>
                      <div className="text-[11.5px] text-navy-400">Week {a.weekType}</div>
                    </Td>
                    <Td>{a.messName}</Td>
                    <Td>{mealSlotLabel(a.mealSlot)}</Td>
                    <Td align="right" className="font-semibold text-red-600">
                      {formatNumber(a.wastePercent, 1)}%
                    </Td>
                    <Td align="right">{formatNumber(a.baselineAvgWastePercent, 1)}%</Td>
                    <Td align="right">
                      <Badge tone={a.zScore >= 2.5 ? 'danger' : 'warning'}>{formatNumber(a.zScore, 1)}σ</Badge>
                    </Td>
                    <Td align="right">{formatNumber(a.totalWasteKg, 1)} kg</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        {a.eventType !== 'NORMAL' && <Badge tone="brand">{eventTypeLabel(a.eventType)}</Badge>}
                        {a.scheduleDeviation && <Badge tone="warning">Deviated</Badge>}
                        {a.eventType === 'NORMAL' && !a.scheduleDeviation && <span className="text-navy-300">—</span>}
                      </div>
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        onClick={() => openInRecords(a)}
                        className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-brand-600 hover:text-brand-800"
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && data.count > anomalies.length && (
              <p className="border-t border-navy-100 px-5 py-3 text-[12.5px] text-navy-400">
                Showing the {anomalies.length} biggest spikes of {data.count} flagged.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
