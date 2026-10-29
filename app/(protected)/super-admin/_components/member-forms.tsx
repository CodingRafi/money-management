"use client"

import { useActionState, useState } from "react"
import { addMember, removeMember, setMemberPassword } from "@/app/actions/super-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PermissionGate } from "@/components/permission-gate"
import { PERMISSION, type UserRole } from "@/lib/permissions"

type State = { error?: string; success?: boolean } | null

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

export interface HouseholdOption {
  id: string
  name: string
  used: number
  max: number
}

/**
 * Tambah anggota keluarga — khusus Super Admin.
 *
 * Form ini HANYA muncul di dalam detail keluarga (`/super-admin/keluarga/[id]`),
 * jadi keluarga target sudah pasti dari halaman tersebut.
 */
export function AddMemberForm({
  role,
  householdId,
  householdName,
  used,
  max,
}: {
  role: UserRole
  householdId: string
  householdName: string
  used: number
  max: number
}) {
  const [state, action, pending] = useActionState<State, FormData>(addMember, null)
  const full = used >= max

  if (full) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Kuota anggota keluarga &quot;{householdName}&quot; sudah penuh ({used}/{max}).
          Perbesar kuota di menu Edit Lisensi dulu.
        </CardContent>
      </Card>
    )
  }

  return (
    <PermissionGate role={role} permission={PERMISSION.MEMBER.CREATE}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tambah Anggota — {householdName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="householdId" value={householdId} />
            <Input name="name" placeholder="Nama lengkap" required />
            <Input name="username" placeholder="Username" required autoComplete="off" />
            <Input
              name="password"
              type="password"
              placeholder="Password awal (min. 8)"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <select name="relation" className={selectClass} defaultValue="istri">
              <option value="istri">Istri</option>
              <option value="suami">Suami</option>
              <option value="anak">Anak</option>
            </select>
            <select name="role" className={selectClass} defaultValue="member">
              <option value="member">Member (dewasa)</option>
              <option value="admin">Admin (kepala keluarga)</option>
              <option value="child">Child (anak)</option>
            </select>
            <Input name="spendingLimit" type="number" min={0} placeholder="Batas belanja/bulan (khusus anak)" />
            {state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
            {state?.success && <p className="text-sm text-primary sm:col-span-2">Anggota ditambahkan.</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Tambah Anggota"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PermissionGate>
  )
}

/** Tombol hapus anggota (hanya Super Admin). */
export function RemoveMemberButton({
  role,
  householdId,
  userId,
  name,
}: {
  role: UserRole
  householdId: string
  userId: string
  name: string
}) {
  return (
    <PermissionGate role={role} permission={PERMISSION.MEMBER.DELETE}>
      <form
        action={removeMember}
        onSubmit={(e) => {
          if (!confirm(`Hapus anggota "${name}"? Tindakan ini tidak bisa dibatalkan.`)) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="householdId" value={householdId} />
        <input type="hidden" name="userId" value={userId} />
        <Button size="sm" variant="outline" type="submit">Hapus</Button>
      </form>
    </PermissionGate>
  )
}

/**
 * Tetapkan password untuk anggota yang belum punya password
 * (mis. akun admin keluarga hasil migrasi).
 */
export function SetPasswordForm({
  role,
  householdId,
  userId,
  name,
}: {
  role: UserRole
  householdId: string
  userId: string
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<State, FormData>(setMemberPassword, null)

  if (!open) {
    return (
      <PermissionGate role={role} permission={PERMISSION.MEMBER.UPDATE}>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Atur Password</Button>
      </PermissionGate>
    )
  }

  return (
    <form action={action} className="flex flex-wrap items-end justify-end gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="text-xs text-muted-foreground">
        Password baru untuk {name}
        <Input
          name="password"
          type="password"
          minLength={8}
          required
          placeholder="min. 8 karakter"
          className="mt-1 w-48"
          autoComplete="new-password"
        />
      </label>
      <Button size="sm" type="submit" disabled={pending}>{pending ? "..." : "Simpan"}</Button>
      <Button size="sm" type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
      {state?.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
      {state?.success && <p className="w-full text-xs text-primary">Password disetel</p>}
    </form>
  )
}
