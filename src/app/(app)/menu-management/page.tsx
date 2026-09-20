'use client';

import { useMemo, useState } from 'react';
import { Copy, Lock, UtensilsCrossed } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { useMess, ALL_MESSES } from '@/lib/mess-context';
import { SLOTS_PER_WEEK, countDefined, indexSlots } from '@/lib/menu-grid';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { MenuGrid } from '@/components/menu/MenuGrid';
import { SlotEditorModal } from '@/components/menu/SlotEditorModal';
import { CopyMenuModal } from '@/components/menu/CopyMenuModal';
import type { DayOfWeek, MealSlot, MenuSlot, WeekType } from '@/types/models';

interface EditTarget {
  day: DayOfWeek;
  meal: MealSlot;
  slot: MenuSlot | null;
}

export default function MenuManagementPage() {
  const { user } = useAuth();
  const { messes, selectedMessId, selectedMess, setSelectedMessId, loading: messLoading } = useMess();
  const isAdmin = user?.role === 'ADMIN';

  const [week, setWeek] = useState<WeekType>('A');
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [copying, setCopying] = useState(false);

  const messId = selectedMessId === ALL_MESSES ? null : selectedMessId;
  const { data, loading, error, reload } = useApi<{ menuSlots: MenuSlot[] }>(
    '/api/menu-slots',
    isAdmin && messId ? { messId } : null
  );

  const slots = data?.menuSlots ?? [];
  const indexed = useMemo(() => indexSlots(slots), [slots]);
  const definedA = countDefined(slots, 'A');
  const definedB = countDefined(slots, 'B');

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Menu Management" description="Weekly A/B menu schedule for each mess." />
        <Card>
          <EmptyState
            icon={Lock}
            title="Administrators only"
            description="Menu schedules are set up by an administrator. Your daily form already compares against the schedule that's on file."
          />
        </Card>
      </div>
    );
  }

  const weekOptions: { value: WeekType; label: string }[] = [
    { value: 'A', label: `Week A · ${definedA}/${SLOTS_PER_WEEK}` },
    { value: 'B', label: `Week B · ${definedB}/${SLOTS_PER_WEEK}` },
  ];

  function refreshAfterSave() {
    setEditing(null);
    setCopying(false);
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Menu Management"
        description={
          selectedMess
            ? `${selectedMess.name} — the scheduled menu the daily form's deviation flag compares against.`
            : "Define each mess's weekly A/B menu schedule — what the daily form compares against."
        }
        actions={
          selectedMess ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setCopying(true)}>
              <Copy className="h-3.5 w-3.5" />
              Copy menu…
            </Button>
          ) : undefined
        }
      />

      {messLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !selectedMess ? (
        // "All messes" is the top-bar default for admins, but a schedule belongs to one mess.
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title="Choose a mess to edit its menu"
            description="A menu schedule belongs to a single mess. Pick one here or from the selector in the top bar."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {messes.map((m) => (
                  <Button key={m.id} type="button" variant="outline" size="sm" onClick={() => setSelectedMessId(m.id)}>
                    {m.name}
                  </Button>
                ))}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl options={weekOptions} value={week} onChange={setWeek} />
            <p className="text-[12.5px] text-navy-400">
              Click any cell to set or edit that meal. Each mess follows a 14-day cycle: Week A, then Week B.
            </p>
          </div>

          <Card className="overflow-hidden">
            {!data && !error ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !data && error ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="Couldn't load the schedule"
                description={error}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={reload}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <MenuGrid
                weekType={week}
                slots={indexed}
                refreshing={loading}
                onCellClick={(day, meal, slot) => setEditing({ day, meal, slot })}
              />
            )}
          </Card>

          {data && slots.length === 0 && (
            <p className="text-center text-[13px] text-navy-500">
              This mess has no menu yet. Fill cells one by one, or use <strong>Copy menu…</strong> to start from another
              mess.
            </p>
          )}
        </div>
      )}

      {editing && selectedMess && (
        <SlotEditorModal
          key={`${week}|${editing.day}|${editing.meal}`}
          messId={selectedMess.id}
          messName={selectedMess.name}
          weekType={week}
          dayOfWeek={editing.day}
          mealSlot={editing.meal}
          slot={editing.slot}
          onClose={() => setEditing(null)}
          onSaved={refreshAfterSave}
        />
      )}

      {copying && selectedMess && (
        <CopyMenuModal
          targetMess={selectedMess}
          messes={messes}
          defaultToWeek={week}
          onClose={() => setCopying(false)}
          onCopied={refreshAfterSave}
        />
      )}
    </div>
  );
}
