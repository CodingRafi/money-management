"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronUp, Filter } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export type FilterCategory = { id: string; name: string; typeName: string }

export const NO_CATEGORY_ID = "none"

export function ExpenseCategoryFilter({
  categories,
  excludedIds,
}: {
  categories: FilterCategory[]
  excludedIds: string[]
}) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(excludedIds.length > 0)

  const all: FilterCategory[] = [
    ...categories,
    { id: NO_CATEGORY_ID, name: "Tanpa kategori", typeName: "Lainnya" },
  ]
  const excluded = new Set(excludedIds)
  const activeCount = all.length - excluded.size

  function apply(nextExcluded: Set<string>) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextExcluded.size === 0) params.delete("xcat")
    else params.set("xcat", Array.from(nextExcluded).join(","))
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  function toggle(id: string) {
    const next = new Set(excluded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  const groups = new Map<string, FilterCategory[]>()
  for (const c of all) {
    if (!groups.has(c.typeName)) groups.set(c.typeName, [])
    groups.get(c.typeName)!.push(c)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Filter className="h-4 w-4" />
            Filter Kategori Pengeluaran
            <span className="text-xs font-normal text-muted-foreground">
              ({activeCount}/{all.length} dipilih)
            </span>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {open && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={pending || excluded.size === 0}
                onClick={() => apply(new Set())}>
                Pilih semua
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={pending || excluded.size === all.length}
                onClick={() => apply(new Set(all.map((c) => c.id)))}>
                Kosongkan
              </Button>
            </div>
          )}
        </div>

        {open && (
          <div className={`space-y-3 ${pending ? "opacity-60" : ""}`}>
            {Array.from(groups.entries()).map(([typeName, cats]) => (
              <div key={typeName}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{typeName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cats.map((c) => {
                    const checked = !excluded.has(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-pressed={checked}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          checked
                            ? "bg-rose-600 text-white border-rose-600"
                            : "text-muted-foreground line-through hover:text-foreground"
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
