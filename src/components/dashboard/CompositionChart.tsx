'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import type { CompositionResponse } from '@/types/models';

const COLORS = ['#6a3ef5', '#9b86ff', '#cdd1ec'];

export function CompositionChart({ data, loading }: { data: CompositionResponse | null; loading: boolean }) {
  const rows = data?.composition ?? [];
  const hasData = rows.some((r) => r.valueKg > 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Waste Composition</CardTitle>
          <CardDescription>Plate, counter, and packaging waste split</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hasData ? (
          <EmptyState title="No records in this range" className="h-56" />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="valueKg"
                nameKey="label"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                strokeWidth={0}
              >
                {rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value.toFixed(1)} kg`, name]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-[12px] text-navy-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
