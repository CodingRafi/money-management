"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { syncAllPrices } from "@/app/actions/simulation"

export function SyncAllButton() {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground max-w-48 truncate" title={msg}>{msg}</span>}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
        const r = await syncAllPrices()
        if (r.ok) {
          const all = [...r.data.assets, ...r.data.benchmarks]
          const ok = all.filter((x) => x.ok).length
          setMsg(`${ok}/${all.length} berhasil disinkron${all.some((x) => !x.ok) ? " (sebagian gagal)" : ""}`)
          router.refresh()
        } else setMsg(r.error)
      })}>{pending ? "Sinkron…" : "Sync harga"}</Button>
    </div>
  )
}
