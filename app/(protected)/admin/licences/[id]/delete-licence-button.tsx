"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { deleteLicenceAction } from "@/app/actions/admin-licence"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export function DeleteLicenceButton({ licenceId }: { licenceId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm("Hapus lisensi ini? Tindakan ini tidak dapat dibatalkan.")) return
    startTransition(async () => {
      await deleteLicenceAction(licenceId)
      router.push("/admin/licences")
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleDelete}
      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
    >
      <Trash2 className="h-4 w-4 mr-2" />
      {isPending ? "Menghapus..." : "Hapus Lisensi"}
    </Button>
  )
}
