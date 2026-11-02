"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Eye, Home, Loader2, User } from "lucide-react"
import { setScope } from "@/app/actions/scope"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface ContextOption {
  value: string
  /** Nama ringkas yang tampil di tombol switcher. */
  label: string
  /** Penjelasan singkat di dalam dropdown. */
  description?: string
  kind: "family" | "member"
  /** true → data anggota lain, hanya bisa dibaca. */
  readOnly?: boolean
  /** true → milik user yang sedang login. */
  isSelf?: boolean
}

interface Props {
  current: string
  options: ContextOption[]
}

/**
 * Scope switcher header: Laporan Keluarga ↔ Mode Personal per anggota.
 *
 * Dipakai DropdownMenu (bukan <select> native) karena <select> menyesuaikan
 * lebarnya dengan option terpanjang — saat berpindah dari "Keluarga" ke mode
 * personal, navbar ikut melebar/bertabrakan dengan isi sebelahnya.
 */
export function ContextSwitcher({ current, options }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const isFamily = current === "family"
  const active = options.find((o) => o.value === current)
  const triggerLabel = isFamily ? "Keluarga" : (active?.label ?? "Personal")

  function handleSelect(value: string) {
    if (value === current) return
    startTransition(async () => {
      try {
        await setScope(value)
      } catch {
        // Ignore: server sudah memvalidasi keanggotaan; context lama tetap dipakai.
      } finally {
        router.refresh()
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Ganti konteks tampilan"
          aria-busy={pending}
          title={triggerLabel}
          className={cn(
            "flex h-8 max-w-[190px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1",
            "text-xs font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-60",
          )}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : isFamily ? (
            <Home className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <User className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tampilan data
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => {
          const selected = o.value === current
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => handleSelect(o.value)}
              className="cursor-pointer items-start gap-2 py-2"
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {selected ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : o.kind === "family" ? (
                  <Home className="h-4 w-4 text-muted-foreground" />
                ) : o.readOnly ? (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.label}</span>
                {o.description && (
                  <span className="block truncate text-xs text-muted-foreground">{o.description}</span>
                )}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
