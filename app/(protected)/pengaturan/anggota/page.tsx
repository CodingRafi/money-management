import { redirect } from "next/navigation"
import { requireSession } from "@/lib/session"
import { memberRepository } from "@/repositories/member.repository"
import { licenseService } from "@/services/license.service"
import { removeMember } from "@/app/actions/members"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AddMemberForm } from "./_components/add-member-form"

export default async function AnggotaPage() {
  const session = await requireSession()
  // Hanya Admin Keluarga; household_id dibaca dari sesi.
  if (session.householdRole !== "admin" || !session.householdId) redirect("/dashboard")

  const [members, quota] = await Promise.all([
    memberRepository.list(session.householdId),
    licenseService.memberQuota(session.householdId),
  ])
  const full = quota.used >= quota.max

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Anggota Keluarga</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kuota lisensi: {quota.used}/{quota.max} anggota
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Daftar Anggota</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{m.name} <span className="text-muted-foreground">({m.username})</span></p>
                  <p className="text-xs text-muted-foreground">
                    {m.relation ?? "-"}
                    {m.role === "child" && m.spending_limit != null &&
                      ` · limit Rp ${m.spending_limit.toLocaleString("id-ID")}/bulan`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{m.role}</Badge>
                  {m.user_id !== session.userId && (
                    <form action={removeMember}>
                      <input type="hidden" name="userId" value={m.user_id} />
                      <Button size="sm" variant="outline" type="submit">Hapus</Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {full ? (
        <p className="text-sm text-muted-foreground">Kuota penuh. Hubungi pengelola untuk menambah slot.</p>
      ) : (
        <AddMemberForm />
      )}
    </div>
  )
}
