'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Lock } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { useDebouncedValue } from '@/lib/use-debounce';
import { resolveRange } from '@/lib/analytics-client';
import {
  EMPTY_RECORD_FILTERS,
  buildExportUrl,
  buildRecordQuery,
  type RecordFilterState,
} from '@/lib/record-filters';
import { describeExportScope } from '@/lib/report-utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { RecordFilters } from '@/components/records/RecordFilters';
import { ColumnDictionary } from '@/components/reports/ColumnDictionary';
import type { PaginatedData } from '@/types/api';
import type { SummaryResponse, WasteRecord } from '@/types/models';

type Format = 'csv' | 'xlsx';

export default function ReportsPage() {
  const { user } = useAuth();
  const { selectedMessId, selectedMess, loading: messLoading } = useMess();
  const isAdmin = user?.role === 'ADMIN';

  const [filters, setFilters] = useState<RecordFilterState>(EMPTY_RECORD_FILTERS);
  const [format, setFormat] = useState<Format>('csv');

  const messId = selectedMessId === ALL_MESSES ? undefined : selectedMessId;
  const scopeLabel = messId ? (selectedMess?.name ?? 'This mess') : 'All messes';

  const debouncedSearch = useDebouncedValue(filters.search, 350);
  const effective = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);
  const baseQuery = useMemo(() => buildRecordQuery(effective, messId), [effective, messId]);

  // Live "N records will be exported": ask the records list for one row and read the total.
  const count = useApi<PaginatedData<WasteRecord>>(
    '/api/waste-records',
    isAdmin && !messLoading ? { ...baseQuery, page: 1, pageSize: 1 } : null
  );
  const total = count.data?.pagination.total ?? null;

  // Quick ranges count back from the newest record (same convention as Dashboard / Analytics).
  const summary = useApi<SummaryResponse>('/api/analytics/summary', isAdmin && !messLoading ? { messId } : null);
  const asOf = summary.data?.asOfDate ?? null;

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Reports / Export" description="Download waste data as CSV or Excel." />
        <Card>
          <EmptyState
            icon={Lock}
            title="Administrators only"
            description="Exports are available to administrators. You can still search and review every entry for your mess on the Records page."
          />
        </Card>
      </div>
    );
  }

  function applyRange(preset: '30d' | '90d' | 'all') {
    const r = resolveRange(preset, asOf, { from: '', to: '' });
    setFilters((f) => ({ ...f, dateFrom: r.dateFrom ?? '', dateTo: r.dateTo ?? '' }));
  }

  // The count reflects the *debounced* search, so hold the button until it has caught up
  // (otherwise someone could download a file that doesn't match what they just typed).
  const settling = filters.search !== debouncedSearch || count.loading;
  const empty = total === 0;
  const canDownload = !settling && total !== null && total > 0;

  function download() {
    window.location.assign(buildExportUrl(effective, messId, format));
    toast.success(`Preparing your ${format === 'csv' ? 'CSV' : 'Excel'} download…`);
  }

  const scopeParts = describeExportScope(effective, scopeLabel);

  return (
    <div>
      <PageHeader
        title="Reports / Export"
        description="Choose what to include, check the count, and download a flat, ML-ready file."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-navy-400">1 · Choose the data</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-navy-400">Quick range</span>
                <Button type="button" variant="outline" size="sm" disabled={!asOf} onClick={() => applyRange('30d')}>
                  Last 30 days
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!asOf} onClick={() => applyRange('90d')}>
                  Last 90 days
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyRange('all')}>
                  All dates
                </Button>
              </div>
            </div>
            <RecordFilters value={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_RECORD_FILTERS)} />
            <p className="mt-2 text-[12px] text-navy-400">
              Mess follows the selector in the top bar — currently <span className="font-medium text-navy-600">{scopeLabel}</span>.
              Quick ranges count back from the latest record on file.
            </p>
          </div>

          <ColumnDictionary />
        </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-navy-400">2 · Download</h2>
          <Card className="animate-slide-up">
            <CardContent className="space-y-5">
              <div>
                <p className="text-[12.5px] text-navy-500">This export will contain</p>
                {total === null && !count.error ? (
                  <Skeleton className="mt-1.5 h-9 w-32" />
                ) : count.error && total === null ? (
                  <p className="mt-1 text-sm text-red-600">Couldn&apos;t count records: {count.error}</p>
                ) : (
                  <p className={settling ? 'mt-0.5 opacity-50 transition-opacity' : 'mt-0.5 transition-opacity'}>
                    <span className="text-[30px] font-semibold tracking-tight text-navy-900">
                      {(total ?? 0).toLocaleString('en-IN')}
                    </span>{' '}
                    <span className="text-sm text-navy-500">{total === 1 ? 'record' : 'records'}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {scopeParts.map((part, i) => (
                  <span
                    key={`${part}-${i}`}
                    className={
                      i === 0
                        ? 'rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-medium text-brand-700'
                        : 'rounded-full bg-navy-50 px-2.5 py-1 text-[11.5px] font-medium text-navy-600'
                    }
                  >
                    {part}
                  </span>
                ))}
              </div>

              <div>
                <p className="mb-1.5 text-[13px] font-medium text-navy-700">File format</p>
                <SegmentedControl
                  className="w-full [&>button]:flex-1"
                  options={[
                    { value: 'csv', label: 'CSV' },
                    { value: 'xlsx', label: 'Excel (.xlsx)' },
                  ]}
                  value={format}
                  onChange={(v) => setFormat(v as Format)}
                />
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-navy-400">
                  {format === 'csv' ? (
                    <>
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Plain text — best for notebooks, pandas and
                      other tools.
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Formatted sheet with a filter row —
                      best for opening in Excel.
                    </>
                  )}
                </p>
              </div>

              <Button type="button" size="lg" className="w-full" disabled={!canDownload} onClick={download}>
                <Download className="h-4 w-4" />
                Download {format === 'csv' ? 'CSV' : 'Excel'}
              </Button>
              {empty && !settling && (
                <p className="-mt-2 text-center text-[12px] text-amber-700">
                  No records match — widen the filters to enable the download.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
