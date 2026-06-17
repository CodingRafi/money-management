"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { deleteGoal } from "@/app/actions/investment-goals"

export function DeleteGoalButton({ goalId }: { goalId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-destructive hover:text-destructive"
      disabled={isPending}
      onClick={() => startTransition(() => deleteGoal(goalId))}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
