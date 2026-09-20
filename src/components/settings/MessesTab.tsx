'use client';

import { useState } from 'react';
import { Building2, Pencil, Plus } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { useMess } from '@/lib/mess-context';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, Td, Th } from '@/components/ui/Table';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { MessFormModal } from '@/components/settings/MessFormModal';
import type { Mess } from '@/types/models';

type FormTarget = { mess: Mess | null } | null;

export function MessesTab() {
  const { reload: reloadSelector } = useMess();
  const list = useApi<{ messes: Mess[] }>('/api/mess', { includeInactive: true });
  const [formTarget, setFormTarget] = useState<FormTarget>(null);

  const messes = list.data?.messes ?? [];
  const initialLoading = !list.data && !list.error;

  return (
    <Card className="animate-slide-up overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 p-4">
        <p className="text-[13px] text-navy-500">
          <span className="font-semibold text-navy-900">{messes.length}</span> {messes.length === 1 ? 'mess' : 'messes'}
          {' · '}
          {messes.filter((m) => m.isActive).length} active
        </p>
        <Button type="button" onClick={() => setFormTarget({ mess: null })}>
          <Plus className="h-4 w-4" />
          Add mess
        </Button>
      </div>

      {initialLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !list.data && list.error ? (
        <EmptyState
          icon={Building2}
          title="Couldn't load messes"
          description={list.error}
          action={
            <Button type="button" variant="outline" size="sm" onClick={list.reload}>
              Try again
            </Button>
          }
        />
      ) : messes.length === 0 ? (
        <EmptyState icon={Building2} title="No messes yet" description="Add your first mess to start collecting data." />
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Table className="min-w-[760px]">
            <thead>
              <tr>
                <Th>Mess</Th>
                <Th>Code</Th>
                <Th>Location (weather)</Th>
                <Th>Timezone</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {messes.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-navy-50/50">
                  <Td className="font-medium text-navy-900">{m.name}</Td>
                  <Td>
                    <Badge>{m.code}</Badge>
                  </Td>
                  <Td className="tabular-nums text-navy-500">
                    {m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}
                  </Td>
                  <Td className="text-navy-500">{m.timezone}</Td>
                  <Td>
                    <Badge tone={m.isActive ? 'success' : 'warning'}>{m.isActive ? 'Active' : 'Inactive'}</Badge>
                  </Td>
                  <Td align="right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Edit mess"
                      aria-label={`Edit ${m.name}`}
                      onClick={() => setFormTarget({ mess: m })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {formTarget && (
        <MessFormModal
          key={formTarget.mess?.id ?? 'new'}
          mess={formTarget.mess}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            list.reload();
            reloadSelector(); // keep the top-bar mess selector in sync
          }}
        />
      )}
    </Card>
  );
}
