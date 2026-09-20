'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileSearch, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { useDebouncedValue } from '@/lib/use-debounce';
import {
  EMPTY_RECORD_FILTERS,
  buildExportUrl,
  buildRecordQuery,
  filtersFromSearchParams,
  hasActiveFilters,
  type RecordFilterState,
  type RecordSortKey,
} from '@/lib/record-filters';
import { formatDate, mealSlotLabel } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RecordFilters } from '@/components/records/RecordFilters';
import { RecordsTable, RecordsTableSkeleton } from '@/components/records/RecordsTable';
import { RecordDetailModal } from '@/components/records/RecordDetailModal';
import { RecordEditModal } from '@/components/records/RecordEditModal';
import type { PaginatedData } from '@/types/api';
import type { SortDir, WasteRecord } from '@/types/models';

export default function RecordsPage() {
  // useSearchParams() must sit under a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      }
    >
      <RecordsView />
    </Suspense>
  );
}

function RecordsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { selectedMessId, selectedMess, loading: messLoading } = useMess();
  const isAdmin = user?.role === 'ADMIN';

  const [filters, setFilters] = useState<RecordFilterState>(() => ({
    ...EMPTY_RECORD_FILTERS,
    ...filtersFromSearchParams((k) => searchParams?.get(k) ?? null),
  }));
  const [sortBy, setSortBy] = useState<RecordSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pageSize, setPageSize] = useState(25);

  const [viewing, setViewing] = useState<WasteRecord | null>(null);
  const [editing, setEditing] = useState<WasteRecord | null>(null);
  const [deleting, setDeleting] = useState<WasteRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // When the URL changes after mount (top-bar search, or a deep link from the
  // Analytics anomaly table while already on /records), adopt it as the new filter set.
  const urlKey = searchParams?.toString() ?? '';
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setFilters({ ...EMPTY_RECORD_FILTERS, ...filtersFromSearchParams((k) => searchParams?.get(k) ?? null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const debouncedSearch = useDebouncedValue(filters.search, 350);
  const messId = selectedMessId === ALL_MESSES ? undefined : selectedMessId;
  const effectiveFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);

  const baseQuery = useMemo(() => buildRecordQuery(effectiveFilters, messId), [effectiveFilters, messId]);

  // Page resets to 1 automatically whenever anything that changes the result
  // set changes: the page number is only honoured while the signature matches.
  const signature = JSON.stringify([baseQuery, sortBy, sortDir, pageSize]);
  const [pageState, setPageState] = useState({ signature: '', page: 1 });
  const page = pageState.signature === signature ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ signature, page: p });
  // Forget the old page as soon as the signature changes, so reverting a filter
  // later starts from page 1 instead of resurrecting a stale page number.
  useEffect(() => {
    setPageState((s) => (s.signature === signature ? s : { signature, page: 1 }));
  }, [signature]);

  const query = messLoading ? null : { ...baseQuery, sortBy, sortDir, page, pageSize };
  const { data, loading, error, reload } = useApi<PaginatedData<WasteRecord>>('/api/waste-records', query);

  // No data and no error yet = still waiting (mess list, then the first fetch) — never flash "No records yet".
  const initialLoading = !data && !error;
  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const filtersActive = hasActiveFilters(filters);
  const scopeLabel = selectedMessId === ALL_MESSES ? 'All messes' : (selectedMess?.name ?? '');

  function handleSort(key: RecordSortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  function exportAs(format: 'csv' | 'xlsx') {
    window.location.assign(buildExportUrl(effectiveFilters, messId, format));
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/api/waste-records/${deleting.id}`);
      toast.success(`Deleted ${mealSlotLabel(deleting.mealSlot)} record for ${formatDate(deleting.date)}`);
      setDeleting(null);
      // Deleting the only row on the last page would otherwise leave an empty page behind.
      if (items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the record');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Records"
        description={
          isAdmin
            ? 'Every waste entry across your messes — search, filter, edit, export.'
            : 'Waste entries for your mess — search, filter, and correct entries.'
        }
        actions={
          <>
            {isAdmin && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => exportAs('csv')}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => exportAs('xlsx')}>
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </Button>
              </>
            )}
            <Button type="button" size="sm" onClick={() => router.push('/data-collection')}>
              <Plus className="h-3.5 w-3.5" />
              New record
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <RecordFilters value={filters} onChange={setFilters} onClear={() => setFilters(EMPTY_RECORD_FILTERS)} />

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3">
            <p className="text-[13px] text-navy-500">
              <span className="font-semibold text-navy-900">
                {pagination ? pagination.total.toLocaleString('en-IN') : '—'}
              </span>{' '}
              {pagination?.total === 1 ? 'record' : 'records'}
              {scopeLabel && <span className="text-navy-400"> · {scopeLabel}</span>}
            </p>
            {isAdmin && <p className="text-[12px] text-navy-400">Switch messes from the selector in the top bar</p>}
          </div>

          {initialLoading ? (
            <RecordsTableSkeleton />
          ) : !data && error ? (
            <EmptyState
              icon={FileSearch}
              title="Couldn't load records"
              description={error}
              action={
                <Button type="button" variant="outline" size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          ) : items.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={FileSearch}
                title="No records match these filters"
                description="Try widening the date range or clearing a filter."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_RECORD_FILTERS)}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FileSearch}
                title="No records yet"
                description="Waste entries appear here as soon as they're submitted from Data Collection."
                action={
                  <Button type="button" size="sm" onClick={() => router.push('/data-collection')}>
                    Add the first record
                  </Button>
                }
              />
            )
          ) : (
            <>
              <RecordsTable
                records={items}
                refreshing={loading}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                onView={setViewing}
                onEdit={setEditing}
                onDelete={setDeleting}
                canDelete={isAdmin}
              />
              {pagination && (
                <Pagination
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  total={pagination.total}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              )}
            </>
          )}
        </Card>
      </div>

      <RecordDetailModal
        record={viewing}
        onClose={() => setViewing(null)}
        onEdit={(r) => {
          setViewing(null);
          setEditing(r);
        }}
      />

      {editing && (
        <RecordEditModal
          key={editing.id}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        destructive
        loading={deleteBusy}
        title="Delete this record?"
        description={
          deleting ? (
            <>
              This permanently removes the <strong>{mealSlotLabel(deleting.mealSlot)}</strong> entry for{' '}
              <strong>{deleting.mess?.name ?? 'this mess'}</strong> on <strong>{formatDate(deleting.date)}</strong>. This
              can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete record"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
