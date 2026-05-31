"use client"

import { useState, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type YearChartEntry = {
  year: number
  income: number
  expense: number
  income_growth_nominal: number | null
  income_growth_pct: number | null
  expense_growth_nominal: number | null
  expense_growth_pct: number | null
}

const formatRpShort = (val: number) => {
  const sign = val < 0 ? "-" : ""
  const abs = Math.abs(val)
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(0)}jt`
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toFixed(0)}rb`
  return `${sign}Rp${abs}`
}

const formatFull = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val)

// Factory so the label function closes over the correct data array
function makeGrowthLabel(
  data: YearChartEntry[],
  field: "income" | "expense",
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function GrowthLabel(props: any) {
    const { x, y, width, value, index } = props
    if (value === null || value === undefined) return null
    const entry = data[index ?? 0]
    if (!entry) return null

    const pct = Number(value)
    const nominal =
      field === "income"
        ? entry.income_growth_nominal
        : entry.expense_growth_nominal

    // For income: positive growth = good (green). For expense: positive growth = bad (red).
    const isGood = field === "expense" ? pct <= 0 : pct >= 0
    const fill = isGood ? "#10b981" : "#ef4444"

    const cx = Number(x ?? 0) + Number(width ?? 0) / 2
    const topY = Number(y ?? 0)

    return (
      <g>
        <text
          x={cx}
          y={topY - 16}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={fill}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </text>
        {nominal !== null && (
          <text
            x={cx}
            y={topY - 4}
            textAnchor="middle"
            fontSize={9}
            fill={fill}
          >
            {nominal >= 0 ? "+" : ""}
            {formatRpShort(nominal)}
          </text>
        )}
      </g>
    )
  }
}

function IncomeTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: YearChartEntry }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md min-w-[160px]">
      <p className="font-semibold mb-1 text-foreground">{d.year}</p>
      <p className="text-emerald-600 font-medium">{formatFull(d.income)}</p>
      {d.income_growth_nominal !== null && d.income_growth_pct !== null ? (
        <p
          className={`mt-0.5 font-medium ${d.income_growth_nominal >= 0 ? "text-emerald-600" : "text-red-600"}`}
        >
          {d.income_growth_nominal >= 0 ? "+" : ""}
          {formatFull(d.income_growth_nominal)}{" "}
          <span className="text-[10px]">
            ({d.income_growth_pct >= 0 ? "+" : ""}
            {d.income_growth_pct.toFixed(1)}%)
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground mt-0.5 text-[10px]">Tahun pertama</p>
      )}
    </div>
  )
}

function ExpenseTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: YearChartEntry }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md min-w-[160px]">
      <p className="font-semibold mb-1 text-foreground">{d.year}</p>
      <p className="text-rose-600 font-medium">{formatFull(d.expense)}</p>
      {d.expense_growth_nominal !== null && d.expense_growth_pct !== null ? (
        <p
          className={`mt-0.5 font-medium ${d.expense_growth_nominal <= 0 ? "text-emerald-600" : "text-red-600"}`}
        >
          {d.expense_growth_nominal >= 0 ? "+" : ""}
          {formatFull(d.expense_growth_nominal)}{" "}
          <span className="text-[10px]">
            ({d.expense_growth_pct >= 0 ? "+" : ""}
            {d.expense_growth_pct.toFixed(1)}%)
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground mt-0.5 text-[10px]">Tahun pertama</p>
      )}
    </div>
  )
}

interface Props {
  chartData: YearChartEntry[]
  children: React.ReactNode
}

export function RekapTabs({ chartData, children }: Props) {
  const [activeTab, setActiveTab] = useState<"list" | "chart">("list")

  const IncomeLabelContent = useMemo(
    () => makeGrowthLabel(chartData, "income"),
    [chartData],
  )
  const ExpenseLabelContent = useMemo(
    () => makeGrowthLabel(chartData, "expense"),
    [chartData],
  )

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex gap-0 border-b mb-5">
        {(
          [
            { key: "list", label: "Cashflow" },
            { key: "chart", label: "Chart" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "list" && children}

      {activeTab === "chart" && (
        chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada data cashflow untuk ditampilkan.
          </p>
        ) : (
          <div className="space-y-6">
            {chartData.length === 1 && (
              <p className="text-xs text-muted-foreground text-center pb-1">
                Data pertumbuhan akan muncul setelah ada minimal 2 tahun data.
              </p>
            )}

            {/* Pendapatan per tahun */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-center">
                  Kenaikan Pendapatan Per Tahun
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 48, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e7eb"
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 11, fill: "#555" }}
                      axisLine={{ stroke: "#9ca3af" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatRpShort}
                      tick={{ fontSize: 10, fill: "#555" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<IncomeTooltip />}
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar
                      dataKey="income"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={100}
                    >
                      <LabelList
                        dataKey="income_growth_pct"
                        content={IncomeLabelContent}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pengeluaran per tahun */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-center">
                  Kenaikan Pengeluaran Per Tahun
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 48, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e7eb"
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontSize: 11, fill: "#555" }}
                      axisLine={{ stroke: "#9ca3af" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatRpShort}
                      tick={{ fontSize: 10, fill: "#555" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ExpenseTooltip />}
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar
                      dataKey="expense"
                      fill="#ef4444"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={100}
                    >
                      <LabelList
                        dataKey="expense_growth_pct"
                        content={ExpenseLabelContent}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )
      )}
    </div>
  )
}
