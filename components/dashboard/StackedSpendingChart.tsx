"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type Row = { name: string; personal: number; household: number }

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

export function StackedSpendingChart({ data }: { data: Row[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={(v: number) => (v >= 1_000_000 ? `${v / 1_000_000}jt` : `${v / 1000}rb`)} tickLine={false} axisLine={false} fontSize={12} width={48} />
          <Tooltip formatter={(v) => rp(Number(v))} />
          <Legend />
          <Bar dataKey="household" name="Rumah Tangga" stackId="a" fill="#059669" />
          <Bar dataKey="personal" name="Personal" stackId="a" fill="#0284c7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
