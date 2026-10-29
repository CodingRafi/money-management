import Link from "next/link"
import { requireSuperAdmin } from "@/lib/session"
import { PERMISSION } from "@/lib/permissions"
import { licenseRepository } from "@/repositories/license.repository"
import { memberRepository } from "@/repositories/member.repository"
import { evaluateLicense } from "@/dtos/license"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { rupiah, formatTanggal } from "@/lib/utils"
import { LicenseStatusBadge } from "../_components/status-badge"
import { RemoveMemberButton } from "../_components/member-forms"

export default async function SuperAdminFamilyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSuperAdmin(PERMISSION.FAMILY.VIEW)
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 64) : ""

  const [families, members] = await Promise.all([
    licenseRepository.listHouseholds(q),
    memberRepository.listAllWithHousehold(),
  ])

  const membersByHousehold = new Map<string, typeof members>()
  for (const m of members) {
    const list = membersByHousehold.get(m.household_id) ?? []
    list.push(m)
    membersByHousehold.set(m.household_id, list)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Keluarga &amp; Anggota</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tambah anggota keluarga, pantai kuota lisensi tiap keluarga.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari keluarga / username"
            className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">Cari</Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {families.map((f) => {
          const effective = evaluateLicense({
            id: "", household_id: f.id, plan_type: f.plan_type, status: f.status,
            max_members: f.max_members, starts_at: "", expires_at: f.expires_at,
            price: f.price, sold_at: f.sold_at,
          })
          const effectiveExpired = !effective.ok && effective.reason === "expired"
          const familyMembers = membersByHousehold.get(f.id) ?? []

          return (
            <Card key={f.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{f.name}</CardTitle>
                  <LicenseStatusBadge status={f.status} effectiveExpired={effectiveExpired} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.plan_type} · {rupiah(f.price)} ·{" "}
                  {f.expires_at ? `kadaluarsa ${formatTanggal(f.expires_at)}` : "tanpa batas"}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Kuota anggota</span>
                  <Badge variant={f.member_count >= f.max_members ? "destructive" : "outline"}>
                    {f.member_count}/{f.max_members}
                  </Badge>
                </div>

                <ul className="divide-y divide-border text-sm">
                  {familyMembers.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.username} · {m.relation ?? "-"} · {m.role}
                        </p>
                      </div>
                      <RemoveMemberButton
                        role={session.role}
                        householdId={f.id}
                        userId={m.user_id}
                        name={m.name}
                      />
                    </li>
                  ))}
                  {familyMembers.length === 0 && (
                    <li className="py-2 text-sm text-muted-foreground">Belum ada anggota.</li>
                  )}
                </ul>

                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={`/super-admin/keluarga/${f.id}`}>Detail Keluarga</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {families.length === 0 && (
          <Card className="lg:col-span-3">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Belum ada keluarga terdaftar.
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Untuk menambah anggota, buka detail keluarga lalu gunakan form
        &quot;Tambah Anggota&quot; di halaman tersebut.
      </p>
    </div>
  )
}
