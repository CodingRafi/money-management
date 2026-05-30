export const LIMIT_OPTIONS = [10, 25, 50] as const
export type LimitOption = (typeof LIMIT_OPTIONS)[number]

export interface PageParams {
  page: number
  limit: LimitOption
  search: string
}

type RawSearchParams = Record<string, string | string[] | undefined>

export function parsePageParams(sp: RawSearchParams): PageParams {
  const page  = Math.max(1, parseInt(sp.page as string) || 1)
  const raw   = parseInt(sp.limit as string)
  const limit = (LIMIT_OPTIONS as readonly number[]).includes(raw) ? (raw as LimitOption) : 10
  const search = ((sp.search as string) ?? "").trim()
  return { page, limit, search }
}

export function buildOffset(p: PageParams): number {
  return (p.page - 1) * p.limit
}

/** Serialise server searchParams for passing to client components */
export function buildParamsStr(sp: RawSearchParams): string {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") clean[k] = v
  }
  return new URLSearchParams(clean).toString()
}

/** Pass to SQL: null = no filter, string = ILIKE '%term%' */
export function searchTerm(p: PageParams): string | null {
  return p.search || null
}

export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit))
}
