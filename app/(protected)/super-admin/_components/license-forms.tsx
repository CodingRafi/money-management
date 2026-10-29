"use client"

import { useActionState, useState } from "react"
import { createFamily, updateLicense } from "@/app/actions/super-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import type { HouseholdSummaryRow } from "@/repositories/license.repository"

type State = { error?: string; success?: boolean } | null

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

export function CreateFamilyForm() {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<State, FormData>(createFamily, null)

  if (!open) return <Button onClick={() => setOpen(true)}>+ Tambah Keluarga &amp; Pembeli Baru</Button>

  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="pt-5">
        {state?.success ? (
          <div className="space-y-3">
            <p className="text-sm text-primary">Keluarga berhasil dibuat.</p>
            <Button variant="outline" onClick={() => setOpen(false)}>Tutup</Button>
          </div>
        ) : (
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama Keluarga"><Input name="familyName" required /></Field>
            <Field label="Nama Kepala Keluarga"><Input name="adminName" required /></Field>
            <Field label="Username Admin"><Input name="adminUsername" required autoComplete="off" /></Field>
            <Field label="Password Awal"><Input name="adminPassword" type="password" required minLength={8} autoComplete="new-password" /></Field>
            <Field label="Paket">
              <select name="planType" className={selectClass} defaultValue="basic">
                <option value="basic">Basic</option>
                <option value="family_pro">Family Pro</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" className={selectClass} defaultValue="active">
                <option value="active">Active</option>
                <option value="trial">Trial</option>
              </select>
            </Field>
            <Field label="Maks. Anggota"><Input name="maxMembers" type="number" min={1} max={50} defaultValue={5} required /></Field>
            <Field label="Kadaluarsa (kosong = tanpa batas)"><Input name="expiresAt" type="date" /></Field>
            {state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export function EditLicenseForm({ family }: { family: HouseholdSummaryRow }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<State, FormData>(updateLicense, null)

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>

  return (
    <form action={action} className="ml-auto flex max-w-md flex-wrap items-end justify-end gap-2 text-left">
      <input type="hidden" name="householdId" value={family.id} />
      <select name="planType" defaultValue={family.plan_type} className={selectClass + " w-28"}>
        <option value="basic">Basic</option>
        <option value="family_pro">Family Pro</option>
        <option value="lifetime">Lifetime</option>
      </select>
      <select name="status" defaultValue={family.status} className={selectClass + " w-28"}>
        <option value="active">Active</option>
        <option value="trial">Trial</option>
        <option value="expired">Expired</option>
        <option value="suspended">Suspended</option>
      </select>
      <Input name="maxMembers" type="number" min={1} max={50} defaultValue={family.max_members} className="w-20" />
      <Input name="expiresAt" type="date" defaultValue={family.expires_at?.slice(0, 10) ?? ""} className="w-40" />
      <Button size="sm" type="submit" disabled={pending}>Simpan</Button>
      <Button size="sm" type="button" variant="outline" onClick={() => setOpen(false)}>Tutup</Button>
      {state?.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
      {state?.success && <p className="w-full text-xs text-primary">Tersimpan</p>}
    </form>
  )
}
