'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton, EmptyState } from '@/components/ui/Skeleton';
import type { TrendPoint } from '@/types/models';

export function TrendChart({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <div>
          <CardTitle>Waste Trend Over Time</CardTitle>
          <CardDescription>Total waste (kg) across the selected period</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <EmptyState title="No records in this range" className="h-64" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c5cff" />
                  <stop offset="100%" stopColor="#5a2fd6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ebf7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#7c81c4' }}
                tickLine={false}
                axisLine={{ stroke: '#e9ebf7' }}
                minTickGap={24}
              />
              <YAxis tick={{ fontSize: 11, fill: '#7c81c4' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e9ebf7', fontSize: 12 }}
                formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Total waste']}
              />
              <Line
                type="monotone"
                dataKey="totalWasteKg"
                stroke="url(#trendStroke)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
