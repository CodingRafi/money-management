"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function YearNavigator() {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [error, setError] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const year = parseInt(value)
    if (isNaN(year) || year < 2000 || year > 2099) {
      setError(true)
      return
    }
    router.push(`/rekap/${year}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        type="number"
        placeholder="Tahun (cth: 2024)"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false) }}
        className={`h-9 w-44 text-sm ${error ? "border-destructive" : ""}`}
        min={2000}
        max={2099}
      />
      <Button type="submit" variant="outline" size="sm" className="h-9 gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Tambah
      </Button>
      {error && <span className="text-xs text-destructive">Tahun tidak valid</span>}
    </form>
  )
}
