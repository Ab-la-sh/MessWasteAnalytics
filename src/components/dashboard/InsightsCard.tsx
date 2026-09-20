'use client';

import { Sparkles, TrendingUp, TrendingDown, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import type { Insight } from '@/types/models';

const ICONS: Record<Insight['type'], React.ComponentType<{ className?: string }>> = {
  'day-pattern': TrendingUp,
  'month-trend': TrendingDown,
  'meal-pattern': UtensilsCrossed,
  'deviation-impact': AlertTriangle,
};

export function InsightsCard({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-brand-500" />
            Smart Insights
          </CardTitle>
          <CardDescription>Auto-generated from recent activity</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : insights.length === 0 ? (
          <EmptyState
            title="Not enough data yet"
            description="Insights appear once there's a clear, consistent pattern in your records."
            className="py-6"
          />
        ) : (
          <ul className="space-y-3">
            {insights.map((insight, i) => {
              const Icon = ICONS[insight.type];
              return (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-navy-50/60 p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-[13px] leading-relaxed text-navy-700">{insight.message}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
