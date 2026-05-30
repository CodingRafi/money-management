"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface Props {
  page: number
  totalPages: number
  total: number
  limit: number
  paramsStr: string
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "…")[] = [1]
  if (current <= 4) {
    pages.push(2, 3, 4, 5, "…", total)
  } else if (current >= total - 3) {
    pages.push("…", total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push("…", current - 1, current, current + 1, "…", total)
  }
  return pages
}

export function PaginationBar({ page, totalPages, total, limit, paramsStr }: Props) {
  const pathname = usePathname()

  function href(p: number) {
    const params = new URLSearchParams(paramsStr)
    params.set("page", String(p))
    return `${pathname}?${params.toString()}`
  }

  if (total === 0) return null

  const from  = Math.min((page - 1) * limit + 1, total)
  const to    = Math.min(page * limit, total)
  const pages = pageNumbers(page, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
      <p className="text-sm text-muted-foreground">
        {from}–{to} dari <span className="font-medium">{total}</span> hasil
      </p>

      <div className="flex items-center gap-1">
        {/* Prev */}
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm shadow-sm hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-muted text-muted-foreground opacity-50">
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}

        {/* Page numbers */}
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="w-8 text-center text-sm text-muted-foreground">
              …
            </span>
          ) : p === page ? (
            <span
              key={p}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm shadow-sm hover:bg-muted"
            >
              {p}
            </Link>
          ),
        )}

        {/* Next */}
        {page < totalPages ? (
          <Link
            href={href(page + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm shadow-sm hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-muted text-muted-foreground opacity-50">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  )
}
