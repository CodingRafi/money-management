import { Badge } from "@/components/ui/badge"

export type LicenseStatus = "active" | "trial" | "expired" | "suspended"

const STATUS_STYLE: Record<LicenseStatus, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  active: { label: "🟢 Active", variant: "success" },
  trial: { label: "🟡 Trial", variant: "warning" },
  expired: { label: "🔴 Expired", variant: "destructive" },
  suspended: { label: "⛔ Suspended", variant: "outline" },
}

/** Badge status lisensi. `effectiveExpired` = sudah lewat tanggal walau status masih active. */
export function LicenseStatusBadge({
  status,
  effectiveExpired = false,
}: {
  status: LicenseStatus
  effectiveExpired?: boolean
}) {
  const s = effectiveExpired ? STATUS_STYLE.expired : STATUS_STYLE[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}
