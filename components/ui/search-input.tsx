"use client"

import { useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search } from "lucide-react"

interface Props {
  defaultValue: string
  paramsStr: string
  placeholder?: string
}

export function SearchInput({ defaultValue, paramsStr, placeholder = "Cari..." }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(paramsStr)
      const val    = e.target.value.trim()
      if (val) params.set("search", val)
      else params.delete("search")
      params.set("page", "1")
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}
