"use client"

import { useTransition } from "react"
import { Home, User } from "lucide-react"
import { setScope } from "@/app/actions/scope"

export interface ContextOption {
  value: string
  label: string
}

interface Props {
  current: string
  options: ContextOption[]
}

/** Scope switcher header: Laporan Keluarga ↔ Mode Personal per anggota. */
export function ContextSwitcher({ current, options }: Props) {
  const [pending, start] = useTransition()
  const isFamily = current === "family"

  return (
    <label
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
        isFamily
          ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
          : "border-sky-600/40 bg-sky-600/10 text-sky-700 dark:text-sky-400"
      }`}
    >
      {isFamily ? <Home className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Context:</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setScope(e.target.value))}
        className="bg-transparent outline-none"
        aria-label="Pilih konteks tampilan"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
