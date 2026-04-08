import React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts'

interface ReviewDataPoint {
  date: string
  reviews: number
  correct: number
  incorrect: number
}

interface ProgressChartProps {
  data: ReviewDataPoint[]
  type?: 'area' | 'bar'
}

export default function ProgressChart({ data, type = 'bar' }: ProgressChartProps): React.JSX.Element {
  const formatted = data.map(d => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }))

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              fontSize: '12px',
              color: '#f1f5f9',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
            }}
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="correct" name="Correct" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          <Bar dataKey="incorrect" name="Incorrect" fill="#f87171" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="reviewGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#f1f5f9',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
          }}
          cursor={{ stroke: 'rgba(148,163,184,0.2)' }}
        />
        <Area
          type="monotone"
          dataKey="reviews"
          name="Reviews"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#reviewGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#7c3aed', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
