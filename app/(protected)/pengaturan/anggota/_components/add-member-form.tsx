"use client"

import { useActionState } from "react"
import { addMember } from "@/app/actions/members"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type State = { error?: string; success?: boolean } | null

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"

export function AddMemberForm() {
  const [state, action, pending] = useActionState<State, FormData>(addMember, null)

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Tambah Anggota</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <Input name="name" placeholder="Nama" required />
          <Input name="username" placeholder="Username" required autoComplete="off" />
          <Input name="password" type="password" placeholder="Password awal (min. 8)" required minLength={8} autoComplete="new-password" />
          <select name="relation" className={selectClass} defaultValue="istri">
            <option value="istri">Istri</option>
            <option value="suami">Suami</option>
            <option value="anak">Anak</option>
          </select>
          <select name="role" className={selectClass} defaultValue="member">
            <option value="member">Member (dewasa)</option>
            <option value="child">Child (anak)</option>
          </select>
          <Input name="spendingLimit" type="number" min={0} placeholder="Batas belanja/bulan (khusus anak)" />
          {state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
          {state?.success && <p className="text-sm text-primary sm:col-span-2">Anggota ditambahkan.</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Tambah"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
