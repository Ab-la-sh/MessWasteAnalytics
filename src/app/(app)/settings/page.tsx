'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { UsersTab } from '@/components/settings/UsersTab';
import { MessesTab } from '@/components/settings/MessesTab';

type Tab = 'profile' | 'users' | 'messes';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('profile');

  const tabs: { value: Tab; label: string }[] = [
    { value: 'profile', label: 'Profile' },
    ...(isAdmin
      ? ([
          { value: 'users', label: 'Users' },
          { value: 'messes', label: 'Messes' },
        ] as { value: Tab; label: string }[])
      : []),
  ];

  // A non-admin can never be on an admin tab (the tabs aren't offered), but
  // guard anyway so a role change mid-session can't render one.
  const activeTab: Tab = tab !== 'profile' && !isAdmin ? 'profile' : tab;

  return (
    <div>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? 'Your account, plus users and mess halls for the whole system.'
            : 'Manage your account details and password.'
        }
        actions={tabs.length > 1 ? <SegmentedControl options={tabs} value={activeTab} onChange={setTab} /> : undefined}
      />

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'users' && isAdmin && <UsersTab />}
      {activeTab === 'messes' && isAdmin && <MessesTab />}
    </div>
  );
}
