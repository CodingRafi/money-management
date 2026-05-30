import { SearchInput } from "@/components/ui/search-input"
import { LimitSelect } from "@/components/ui/limit-select"

interface Props {
  defaultSearch: string
  currentLimit: number
  paramsStr: string
  total: number
  placeholder?: string
}

export function TableToolbar({ defaultSearch, currentLimit, paramsStr, total, placeholder }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <SearchInput defaultValue={defaultSearch} paramsStr={paramsStr} placeholder={placeholder} />
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium">{total}</span> hasil
        </span>
        <LimitSelect currentLimit={currentLimit} paramsStr={paramsStr} />
      </div>
    </div>
  )
}
