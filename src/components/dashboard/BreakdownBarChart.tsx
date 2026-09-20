'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import type { BreakdownRow } from '@/types/models';

const COLORS = ['#7c5cff', '#5b5fac', '#9b86ff', '#454990'];

export function BreakdownBarChart({
  title,
  description,
  data,
  loading,
}: {
  title: string;
  description: string;
  data: BreakdownRow[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : data.length === 0 ? (
          <EmptyState title="No records in this range" className="h-56" />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={{ stroke: '#e9ebf7' }} />
              <YAxis tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Total waste']}
              />
              <Bar dataKey="totalWasteKg" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
