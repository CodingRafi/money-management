"use client"

import { useActionState, useEffect, useState } from "react"
import { renewLicenceAction } from "@/app/actions/admin-licence"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X } from "lucide-react"

interface Props {
  licenceId: string
  noExpiry: boolean
  currentPrice: number | null
  onClose: () => void
}

export function RenewModal({ licenceId, noExpiry: initialNoExpiry, currentPrice, onClose }: Props) {
  const [noExpiry, setNoExpiry] = useState(initialNoExpiry)
  const [state, action, isPending] = useActionState(renewLicenceAction, null)

  useEffect(() => {
    if (state?.success) onClose()
  }, [state?.success])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Edit Lisensi</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="licenceId" value={licenceId} />

          <div className="space-y-1">
            <label className="text-left block text-sm font-medium">Harga</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
              <Input
                type="number" name="price" min={0} step={1000}
                defaultValue={currentPrice ?? ""} placeholder="0" className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-left block text-sm font-medium">Masa Berlaku</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox" name="noExpiry"
                checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)}
                className="rounded"
              />
              Seumur hidup (tidak ada expired)
            </label>
            {!noExpiry && <Input type="date" name="newExpiredAt" required />}
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
