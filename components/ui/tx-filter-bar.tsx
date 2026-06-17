"use client"

import { useRouter, usePathname } from "next/navigation"

interface Option { value: string; label: string }

interface Props {
  from: string
  to: string
  type: string
  paramsStr: string
  typeOptions: Option[]
}

export function TxFilterBar({ from, to, type, paramsStr, typeOptions }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string) {
    const params = new URLSearchParams(paramsStr)
    if (value) params.set(key, value)
    else params.delete(key)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasFilter = from || to || type !== "all"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground shrink-0">Dari</label>
        <input
          type="date"
          value={from}
          onChange={e => update("from", e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground shrink-0">Sampai</label>
        <input
          type="date"
          value={to}
          onChange={e => update("to", e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <select
        value={type}
        onChange={e => update("type", e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="all">Semua Tipe</option>
        {typeOptions.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hasFilter && (
        <a
          href={pathname}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Reset filter
        </a>
      )}
    </div>
  )
}
