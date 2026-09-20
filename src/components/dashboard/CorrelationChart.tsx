'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

export interface CorrelationPoint {
  date: string;
  messName: string;
  mealSlot: string;
  x: number;
  y: number;
}

export function CorrelationChart({
  points,
  correlation,
  loading,
  xLabel,
  yLabel,
}: {
  points: CorrelationPoint[];
  correlation: number | null;
  loading: boolean;
  xLabel: string;
  yLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{xLabel} vs Waste</CardTitle>
          <CardDescription>Each point is one meal record</CardDescription>
        </div>
        {!loading && correlation !== null && (
          <Badge tone={Math.abs(correlation) >= 0.4 ? 'brand' : 'neutral'}>r = {correlation.toFixed(2)}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : points.length === 0 ? (
          <EmptyState title="No records in this range" className="h-56" />
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                tick={{ fontSize: 11, fill: '#7c81c4' }}
                tickLine={false}
                axisLine={{ stroke: '#e9ebf7' }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabel}
                tick={{ fontSize: 11, fill: '#7c81c4' }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                formatter={(value: number, name: string) => [value.toFixed(1), name]}
                labelFormatter={() => ''}
              />
              <Scatter data={points} fill="#7c5cff" fillOpacity={0.65} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
