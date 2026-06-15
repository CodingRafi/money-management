"use client"

import { useActionState, useState } from "react"
import { login } from "@/app/actions/session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff } from "lucide-react"
import Image from "next/image"

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <div className="flex justify-center">
            <Image src="/logo.svg" alt="TONAS" width={180} height={71} priority />
          </div>
          <p className="text-sm text-muted-foreground">Kelola keuangan Anda dengan mudah</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-left">
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="username">Username</label>
              <Input id="username" name="username" type="text" autoComplete="username" required placeholder="TONAS" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Masuk..." : "Masuk"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
