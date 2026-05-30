"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Ban, RefreshCw, CheckCircle, LayoutList, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { suspendLicenceAction, activateLicenceAction, deleteLicenceAction } from "@/app/actions/admin-licence"
import { RenewModal } from "./renew-modal"
import Link from "next/link"

interface Props {
  licenceId: string
  status: string
  noExpiry: boolean
  currentPrice: number | null
  isClaimed: boolean
}

export function LicenceActionsMenu({ licenceId, status, noExpiry, currentPrice, isClaimed }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showRenew, setShowRenew] = useState(false)

  function handleDelete() {
    if (!confirm("Hapus lisensi ini? Tindakan ini tidak dapat dibatalkan.")) return
    startTransition(() => deleteLicenceAction(licenceId))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/licences/${licenceId}`}>
              <LayoutList className="h-4 w-4 mr-2" />
              Lihat Detail & Sesi
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowRenew(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Perpanjang / Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status === "SUSPENDED" ? (
            <DropdownMenuItem onClick={() => startTransition(() => activateLicenceAction(licenceId))}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
              <span className="text-green-600">Aktifkan kembali</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => startTransition(() => suspendLicenceAction(licenceId))}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="h-4 w-4 mr-2" />
              Nonaktifkan
            </DropdownMenuItem>
          )}
          {!isClaimed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Hapus Lisensi
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showRenew && (
        <RenewModal
          licenceId={licenceId}
          noExpiry={noExpiry}
          currentPrice={currentPrice}
          onClose={() => setShowRenew(false)}
        />
      )}
    </>
  )
}
