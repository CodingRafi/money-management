"use client"

import { useTransition } from "react"
import { revokeSessionAction } from "@/app/actions/session"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

interface Props {
  sessionId: string
  isCurrent: boolean
}

export function RevokeSessionButton({ sessionId, isCurrent }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const msg = isCurrent
      ? "Ini adalah sesi kamu saat ini. Logout dari sesi ini akan membuatmu keluar. Lanjutkan?"
      : "Logout dari perangkat ini?"
    if (!confirm(msg)) return
    startTransition(() => revokeSessionAction(sessionId))
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={handleClick}
      className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 gap-1.5"
    >
      <LogOut className="h-4 w-4" />
      {isPending ? "Memproses..." : "Logout"}
    </Button>
  )
}
