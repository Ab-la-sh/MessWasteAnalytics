import { CalendarCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { menuTagLabel } from '@/lib/format';
import type { MenuSlot } from '@/types/models';

const FLAG_LABELS: { key: keyof MenuSlot; label: string }[] = [
  { key: 'hasBiryani', label: 'Biryani' },
  { key: 'hasPaneer', label: 'Paneer' },
  { key: 'hasEggBreakfast', label: 'Egg breakfast' },
  { key: 'hasDessert', label: 'Dessert' },
  { key: 'hasDosa', label: 'Dosa' },
  { key: 'hasParatha', label: 'Paratha' },
];

/**
 * Shows what Menu Management says *should* be served for this mess, week
 * type, day and slot — the thing the coordinator's schedule-deviation toggle
 * is actually answering a question about. Before Phase 8 the form asked
 * "did this deviate from the schedule?" without ever showing the schedule.
 */
export function ScheduledMenuContext({
  slot,
  loading,
}: {
  slot: MenuSlot | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-2.5 text-[12.5px] text-navy-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading the scheduled menu for this slot…
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-2.5 text-[12.5px] text-navy-500">
        No menu is scheduled for this day and slot yet. An Admin can define one in Menu Management —
        until then, the deviation toggle is a free judgement call.
      </div>
    );
  }

  const flags = FLAG_LABELS.filter((f) => slot[f.key] === true);

  return (
    <div className="rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-navy-700">
        <CalendarCheck className="h-3.5 w-3.5 text-brand-500" />
        Scheduled: {slot.itemCount} item{slot.itemCount === 1 ? '' : 's'}, {Math.round(slot.pctGravyDishes)}% gravy
      </p>
      {(flags.length > 0 || slot.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={String(f.key)} tone="brand">
              {f.label}
            </Badge>
          ))}
          {slot.tags.map((tag) => (
            <Badge key={tag}>{menuTagLabel(tag)}</Badge>
          ))}
        </div>
      )}
      {slot.notes && <p className="mt-2 text-[12px] leading-relaxed text-navy-500">{slot.notes}</p>}
    </div>
  );
}
