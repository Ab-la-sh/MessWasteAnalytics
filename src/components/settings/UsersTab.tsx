'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Power, Search, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, Td, Th } from '@/components/ui/Table';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Skeleton } from '@/components/ui/Skeleton';
import { UserFormModal } from '@/components/settings/UserFormModal';
import type { ManagedUser, Mess, Role } from '@/types/models';

type FormTarget = { user: ManagedUser | null } | null;

export function UsersTab() {
  const { user: me } = useAuth();
  const users = useApi<{ users: ManagedUser[] }>('/api/users', {});
  const messes = useApi<{ messes: Mess[] }>('/api/mess', { includeInactive: true });

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [toDelete, setToDelete] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const all = users.data?.users ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [all, search, roleFilter]);

  async function toggleActive(u: ManagedUser) {
    setTogglingId(u.id);
    try {
      await api.patch(`/api/users/${u.id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? `${u.name} deactivated` : `${u.name} reactivated`);
      users.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update this user'));
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete(`/api/users/${toDelete.id}`);
      toast.success(`Deleted ${toDelete.name}`);
      setToDelete(null);
      users.reload();
    } catch (err) {
      // e.g. 409 "has created N records — deactivate instead": show it, keep the dialog closed.
      toast.error(errorMessage(err, 'Could not delete this user'));
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const initialLoading = !users.data && !users.error;

  return (
    <Card className="animate-slide-up overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-navy-100 p-4">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <Input
            className="pl-9"
            placeholder="Search name or email…"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-full sm:w-44"
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | '')}
        >
          <option value="">All roles</option>
          <option value="ADMIN">Administrators</option>
          <option value="DATA_COLLECTOR">Data Collectors</option>
        </Select>
        <div className="ml-auto">
          <Button type="button" onClick={() => setFormTarget({ user: null })}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        </div>
      </div>

      {initialLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !users.data && users.error ? (
        <EmptyState
          icon={Users}
          title="Couldn't load users"
          description={users.error}
          action={
            <Button type="button" variant="outline" size="sm" onClick={users.reload}>
              Try again
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={all.length === 0 ? 'No users yet' : 'No users match'}
          description={all.length === 0 ? undefined : 'Try a different search or role filter.'}
        />
      ) : (
        <div className={users.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Table className="min-w-[820px]">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Mess</Th>
                <Th>Status</Th>
                <Th>Added</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id} className="transition-colors hover:bg-navy-50/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-navy-700 text-xs font-semibold text-white">
                          {u.name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-navy-900">
                            {u.name}
                            {isSelf && <Badge tone="brand">You</Badge>}
                          </p>
                          <p className="text-[12px] text-navy-400">{u.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={u.role === 'ADMIN' ? 'brand' : 'neutral'}>
                        {u.role === 'ADMIN' ? 'Administrator' : 'Data Collector'}
                      </Badge>
                    </Td>
                    <Td>{u.role === 'ADMIN' ? <span className="text-navy-400">All messes</span> : (u.mess?.name ?? '—')}</Td>
                    <Td>
                      <Badge tone={u.isActive ? 'success' : 'warning'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge>
                    </Td>
                    <Td className="text-navy-500">{formatDate(u.createdAt)}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Edit user"
                          aria-label={`Edit ${u.name}`}
                          onClick={() => setFormTarget({ user: u })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={u.isActive ? 'Deactivate' : 'Reactivate'}
                          aria-label={`${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}`}
                          disabled={isSelf || togglingId === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          <Power className={u.isActive ? 'h-4 w-4' : 'h-4 w-4 text-emerald-600'} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Delete user"
                          aria-label={`Delete ${u.name}`}
                          disabled={isSelf}
                          className="hover:bg-red-50 hover:text-red-600"
                          onClick={() => setToDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {formTarget && (
        <UserFormModal
          key={formTarget.user?.id ?? 'new'}
          user={formTarget.user}
          messes={messes.data?.messes ?? []}
          isSelf={formTarget.user?.id === me?.id}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            users.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        loading={busy}
        title="Delete this user?"
        description={
          toDelete ? (
            <>
              <strong>{toDelete.name}</strong> ({toDelete.email}) will be removed permanently. If they have submitted or
              edited any records this will be refused — deactivate them instead to keep the history.
            </>
          ) : null
        }
        confirmLabel="Delete user"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
