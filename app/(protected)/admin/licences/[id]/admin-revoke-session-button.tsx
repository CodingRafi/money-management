"use client"

import { useTransition } from "react"
import { adminRevokeSessionAction } from "@/app/actions/session"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

interface Props {
  sessionId: string
  licenceId: string
}

export function AdminRevokeSessionButton({ sessionId, licenceId }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm("Logout paksa dari perangkat ini?")) return
    startTransition(() => adminRevokeSessionAction(sessionId, licenceId))
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
