'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { Mess } from '@/types/models';

const STORAGE_KEY = 'messwaste:selectedMessId';
// Sentinel for the Admin "all messes" combined view — kept distinct from
// `null`/`undefined` (loading) so components can tell "not chosen yet" apart
// from "explicitly viewing everything".
export const ALL_MESSES = 'ALL';

interface MessContextValue {
  messes: Mess[];
  loading: boolean;
  selectedMessId: string; // a Mess id, or ALL_MESSES
  setSelectedMessId: (id: string) => void;
  selectedMess: Mess | null;
  /** Re-fetch the mess list (after an Admin adds/edits/deactivates a mess in Settings). */
  reload: () => void;
}

const MessContext = createContext<MessContextValue | null>(null);

export function MessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [messes, setMesses] = useState<Mess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessId, setSelectedMessIdState] = useState<string>(ALL_MESSES);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { messes: list } = await api.get<{ messes: Mess[] }>('/api/mess');
        if (cancelled) return;
        setMesses(list);

        if (user.role === 'DATA_COLLECTOR' && user.messId) {
          setSelectedMessIdState(user.messId);
        } else {
          const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
          if (stored && (stored === ALL_MESSES || list.some((m) => m.id === stored))) {
            setSelectedMessIdState(stored);
          } else {
            setSelectedMessIdState(ALL_MESSES);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const setSelectedMessId = (id: string) => {
    // Data Collectors are permanently scoped to their own mess — the
    // selector is disabled for them in the UI, but guard here too.
    if (user?.role === 'DATA_COLLECTOR') return;
    setSelectedMessIdState(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
  };

  const selectedMess = useMemo(
    () => messes.find((m) => m.id === selectedMessId) ?? null,
    [messes, selectedMessId]
  );

  const value = useMemo(
    () => ({ messes, loading, selectedMessId, setSelectedMessId, selectedMess, reload }),
    [messes, loading, selectedMessId, selectedMess, reload]
  );

  return <MessContext.Provider value={value}>{children}</MessContext.Provider>;
}

export function useMess(): MessContextValue {
  const ctx = useContext(MessContext);
  if (!ctx) throw new Error('useMess must be used within MessProvider');
  return ctx;
}
