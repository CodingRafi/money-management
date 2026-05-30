"use client"

import { useRouter, usePathname } from "next/navigation"
import { LIMIT_OPTIONS } from "@/lib/paginate"

interface Props {
  currentLimit: number
  paramsStr: string
}

export function LimitSelect({ currentLimit, paramsStr }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(paramsStr)
    params.set("limit", e.target.value)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={currentLimit}
      onChange={handleChange}
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {LIMIT_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n} / hal
        </option>
      ))}
    </select>
  )
}
