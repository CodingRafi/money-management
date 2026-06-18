import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Eye, EyeOff, Trash2, Plus, Pencil, X } from "lucide-react"
import Link from "next/link"
import {
  createUserIncomeCategory,
  updateUserIncomeCategory,
  toggleUserIncomeCategoryVisibility,
  deleteUserIncomeCategory,
  createUserExpenseCategory,
  updateUserExpenseCategory,
  toggleUserExpenseCategoryVisibility,
  deleteUserExpenseCategory,
} from "@/app/actions/categories"
import { setBudget, setTypeAllocations, setMaxExpensePct, setCategoryNominal } from "@/app/actions/budget"

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]

function fmtRp(n: number) {
  return "Rp " + n.toLocaleString("id-ID")
}

export type KatIncomeCat = {
  id: string; name: string; color: string | null; is_hidden: boolean
}
export type KatExpenseType = {
  id: string; name: string; allocation: string
}
export type KatExpenseCat = {
  id: string; name: string; type_id: string; type_name: string
  is_hidden: boolean; budget_pct: string | null; nominal_budget: number | null
}

type Props = {
  year: number
  month: number
  base: string
  incomeCategories: KatIncomeCat[]
  types: KatExpenseType[]
  byType: Record<string, KatExpenseCat[]>
  allocTotal: number
  allocOk: boolean
  maxExpensePct: number
  activeKTab: "income" | "expense"
  editKIncome: string | null
  editKExpense: string | null
  allocError: boolean
  isActive: boolean
}

export function KategoriBudgetTab({
  year, month, base,
  incomeCategories, types, byType,
  allocTotal, allocOk, maxExpensePct,
  activeKTab, editKIncome, editKExpense, allocError, isActive,
}: Props) {
  const katBase        = base
  const backUrlIncome  = `${katBase}?ktab=income`
  const backUrlExpense = `${katBase}?ktab=expense`
  const monthName = MONTHS_SHORT[month - 1]

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex border-b">
        <Link
          href={backUrlIncome}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeKTab === "income"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Kategori Pendapatan
          {incomeCategories.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {incomeCategories.filter((c) => !c.is_hidden).length}
            </Badge>
          )}
        </Link>
        <Link
          href={backUrlExpense}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeKTab === "expense"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pengeluaran &amp; Budget
          {types.length > 0 && (
            <Badge variant={allocOk ? "secondary" : "destructive"} className="ml-2 text-xs">
              {allocTotal.toFixed(0)}%
            </Badge>
          )}
        </Link>
      </div>

      {/* ── PENDAPATAN ── */}
      {activeKTab === "income" && (
        <div className="space-y-4">
          {incomeCategories.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Belum ada kategori pendapatan.
              </CardContent>
            </Card>
          )}

          {isActive && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Tambah Kategori</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createUserIncomeCategory} className="flex flex-wrap gap-3">
                  <input type="hidden" name="year" value={year} />
                  <Input name="name" placeholder="Nama kategori" required className="max-w-xs" />
                  <Input name="color" placeholder="Warna hex (opsional)" className="w-40" />
                  <Button type="submit" size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1" />Tambah
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {incomeCategories.map((cat) =>
              editKIncome === cat.id ? (
                <form
                  key={cat.id}
                  action={updateUserIncomeCategory.bind(null, cat.id)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-4 py-3"
                >
                  <input type="hidden" name="back_url" value={backUrlIncome} />
                  <Input name="name" defaultValue={cat.name} required className="h-8 max-w-[220px] text-sm" autoFocus />
                  <Input name="color" defaultValue={cat.color ?? ""} placeholder="Warna hex" className="h-8 w-[150px] text-sm" />
                  <Button type="submit" size="sm" className="h-8">Simpan</Button>
                  <Button asChild size="sm" variant="ghost" className="h-8">
                    <Link href={backUrlIncome}><X className="h-3.5 w-3.5 mr-1" />Batal</Link>
                  </Button>
                </form>
              ) : (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-opacity ${cat.is_hidden ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {cat.color && (
                      <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: cat.color }} />
                    )}
                    <p className="font-medium">{cat.name}</p>
                    {cat.is_hidden && <Badge variant="outline" className="text-xs">Disembunyikan</Badge>}
                  </div>
                  {isActive && (
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link href={`${backUrlIncome}&edit_kincome=${cat.id}`}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      <form action={toggleUserIncomeCategoryVisibility.bind(null, cat.id)}>
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" title={cat.is_hidden ? "Tampilkan" : "Sembunyikan"}>
                          {cat.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </form>
                      <form action={deleteUserIncomeCategory.bind(null, cat.id)}>
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── PENGELUARAN & BUDGET ── */}
      {activeKTab === "expense" && (
        <div className="space-y-4">
          {/* Batas max pengeluaran */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Batas Pengeluaran Tahunan {year}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Persentase maksimal pendapatan yang boleh digunakan untuk pengeluaran.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {isActive && (
                <form action={setMaxExpensePct} className="flex items-center gap-3">
                  <input type="hidden" name="year" value={year} />
                  <label className="text-sm font-medium whitespace-nowrap">Max pengeluaran</label>
                  <Input
                    name="max_expense_pct"
                    type="number" step="1" min="0" max="100"
                    defaultValue={maxExpensePct.toFixed(0)}
                    className="h-8 w-20 text-right text-sm"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button type="submit" size="sm" className="h-8">Simpan</Button>
                </form>
              )}
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted text-[10px] font-semibold">
                  <div
                    className="flex items-center justify-center bg-destructive/80 text-destructive-foreground transition-all"
                    style={{ width: `${maxExpensePct}%` }}
                  >
                    {maxExpensePct >= 15 ? `${maxExpensePct.toFixed(0)}%` : ""}
                  </div>
                  <div
                    className="flex items-center justify-center bg-primary/20 text-primary transition-all"
                    style={{ width: `${100 - maxExpensePct}%` }}
                  >
                    {(100 - maxExpensePct) >= 15 ? `${(100 - maxExpensePct).toFixed(0)}%` : ""}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-destructive/80" />
                    Pengeluaran ({maxExpensePct.toFixed(0)}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary/40" />
                    Investasi / Tabungan ({(100 - maxExpensePct).toFixed(0)}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {types.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Belum ada kategori pengeluaran.
              </CardContent>
            </Card>
          )}

          {/* Alokasi per tipe */}
          {types.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Alokasi Tipe Pengeluaran</CardTitle>
                  <Badge variant={allocOk ? "default" : "destructive"} className="text-xs">
                    Total: {allocTotal.toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  % dari total pengeluaran ({maxExpensePct.toFixed(0)}% pendapatan). Total harus 100%.
                </p>
              </CardHeader>
              <CardContent>
                <form action={isActive ? setTypeAllocations : undefined} className="space-y-3">
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="back_url" value={backUrlExpense} />
                  {types.map((type, i) => {
                    const typePct     = parseFloat(type.allocation)
                    const fromIncome  = (typePct * maxExpensePct) / 100
                    return (
                      <div key={type.id} className="flex items-center gap-3">
                        <input type="hidden" name={`type_${i}`} value={type.id} />
                        <span className="w-28 text-sm font-medium">{type.name}</span>
                        <Input
                          name={`pct_${i}`}
                          type="number" step="0.01" min="0" max="100"
                          defaultValue={typePct.toFixed(2)}
                          className="h-8 w-24 text-right text-sm"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <span className="text-xs text-muted-foreground">
                          = {fromIncome.toFixed(1)}% pendapatan
                        </span>
                      </div>
                    )
                  })}
                  {allocError && (
                    <p className="text-sm text-destructive">Total alokasi harus tepat 100%.</p>
                  )}
                  {isActive && <Button type="submit" size="sm" className="mt-1">Simpan Alokasi</Button>}
                </form>
              </CardContent>
            </Card>
          )}

          {/* Kategori per tipe */}
          {types.map((type) => {
            const cats         = byType[type.id] ?? []
            const isFleksibel  = type.name === "FLEKSIBEL"
            const typePct      = parseFloat(type.allocation)
            const fromIncome   = (typePct * maxExpensePct) / 100
            const totalNominal = cats.reduce((s, c) => s + (c.nominal_budget ?? 0), 0)
            return (
              <Card key={type.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {type.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {typePct.toFixed(0)}% pengeluaran = {fromIncome.toFixed(1)}% pendapatan
                      </Badge>
                      {!isFleksibel && (
                        <span className="text-xs text-muted-foreground">Budget {monthName}</span>
                      )}
                    </div>
                  </div>
                  {totalNominal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Total nominal: <span className="font-medium text-foreground">{fmtRp(totalNominal)}/bln</span>
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {cats.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Belum ada kategori.</p>
                  )}
                  {cats.map((cat) =>
                    editKExpense === cat.id ? (
                      <form
                        key={cat.id}
                        action={updateUserExpenseCategory.bind(null, cat.id)}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-3 py-2.5"
                      >
                        <input type="hidden" name="back_url" value={backUrlExpense} />
                        <Input name="name" defaultValue={cat.name} required className="h-8 flex-1 min-w-[160px] text-sm" autoFocus />
                        <Button type="submit" size="sm" className="h-8">Simpan</Button>
                        <Button asChild size="sm" variant="ghost" className="h-8">
                          <Link href={backUrlExpense}><X className="h-3.5 w-3.5 mr-1" />Batal</Link>
                        </Button>
                      </form>
                    ) : (
                      <div
                        key={cat.id}
                        className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 transition-opacity ${cat.is_hidden ? "opacity-50" : ""}`}
                      >
                        <div className="flex flex-1 min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium">{cat.name}</p>
                          {cat.is_hidden && <Badge variant="outline" className="text-xs shrink-0">Disembunyikan</Badge>}
                        </div>

                        {/* Nominal input */}
                        {isActive && (
                          <form action={setCategoryNominal} className="flex items-center gap-1 shrink-0">
                            <input type="hidden" name="category_id" value={cat.id} />
                            <input type="hidden" name="year" value={year} />
                            <span className="text-xs text-muted-foreground">Rp</span>
                            <Input
                              name="nominal"
                              type="number" step="1000" min="0"
                              defaultValue={cat.nominal_budget ?? 0}
                              className="h-7 w-28 text-right text-sm"
                            />
                            <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs">
                              Simpan
                            </Button>
                          </form>
                        )}

                        {/* Budget % input — hanya untuk non-FLEKSIBEL */}
                        {!isFleksibel && isActive && (
                          <form action={setBudget} className="flex items-center gap-1 shrink-0">
                            <input type="hidden" name="category_id" value={cat.id} />
                            <input type="hidden" name="month" value={month} />
                            <input type="hidden" name="year" value={year} />
                            <Input
                              name="percentage"
                              type="number" step="0.01" min="0" max="100"
                              defaultValue={cat.budget_pct ?? "0"}
                              className="h-7 w-20 text-right text-sm"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs">
                              Simpan
                            </Button>
                          </form>
                        )}

                        {isActive && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                              <Link href={`${backUrlExpense}&edit_kexpense=${cat.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <form action={toggleUserExpenseCategoryVisibility.bind(null, cat.id)}>
                              <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" title={cat.is_hidden ? "Tampilkan" : "Sembunyikan"}>
                                {cat.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            </form>
                            <form action={deleteUserExpenseCategory.bind(null, cat.id)}>
                              <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </form>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {isActive && (
                    <form action={createUserExpenseCategory} className="flex items-center gap-2 border-t pt-3">
                      <input type="hidden" name="type_id" value={type.id} />
                      <input type="hidden" name="year" value={year} />
                      <Input name="name" placeholder="Tambah kategori baru..." required className="h-8 flex-1 text-sm" />
                      <Button type="submit" size="sm" className="h-8 shrink-0">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
