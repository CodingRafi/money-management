import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { ensureYearlyCategories } from "@/lib/ensureYearlyCategories"
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
import { setBudget, setTypeAllocations } from "@/app/actions/budget"

type IncomeCat = {
  id: string
  name: string
  color: string | null
  is_hidden: boolean
}
type ExpenseType = {
  id: string
  name: string
  allocation: string
}
type ExpenseCat = {
  id: string
  name: string
  type_id: string
  type_name: string
  is_hidden: boolean
  budget_pct: string | null
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const sp          = await searchParams
  const activeTab   = sp.tab === "expense" ? "expense" : "income"
  const editIncome  = typeof sp.edit_income  === "string" ? sp.edit_income  : null
  const editExpense = typeof sp.edit_expense === "string" ? sp.edit_expense : null
  const allocError  = sp.alloc_error === "1"

  const now        = new Date()
  const month      = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // Ensure current year has category data (auto-duplicates from previous year if needed)
  await ensureYearlyCategories(userId, currentYear)

  const [incomeRes, typesRes, expenseCatRes] = await Promise.all([
    pool.query<IncomeCat>(
      `SELECT id, name, color, is_hidden
       FROM income_categories
       WHERE user_id = $1 AND year = $2
       ORDER BY sort_order, name`,
      [userId, currentYear],
    ),
    pool.query<ExpenseType>(
      `SELECT et.id, et.name, COALESCE(ta.percentage, 0)::text AS allocation
       FROM expense_types et
       LEFT JOIN type_allocations ta
         ON ta.type_id = et.id AND ta.user_id = $1 AND ta.year = $2
       WHERE et.user_id = $1 AND et.year = $2
       ORDER BY et.sort_order, et.name`,
      [userId, currentYear],
    ),
    pool.query<ExpenseCat>(
      `SELECT ec.id, ec.name, ec.type_id, et.name AS type_name, ec.is_hidden,
              b.percentage::text AS budget_pct
       FROM expense_categories ec
       JOIN expense_types et ON et.id = ec.type_id
       LEFT JOIN budgets b
         ON b.category_id = ec.id
         AND b.user_id = $1
         AND b.month   = $2
         AND b.year    = $3
       WHERE ec.user_id = $1 AND ec.year = $3
       ORDER BY ec.sort_order, ec.name`,
      [userId, month, currentYear],
    ),
  ])

  const incomeCategories = incomeRes.rows
  const types            = typesRes.rows
  const byType           = expenseCatRes.rows.reduce<Record<string, ExpenseCat[]>>((acc, cat) => {
    acc[cat.type_id] ??= []
    acc[cat.type_id].push(cat)
    return acc
  }, {})

  const allocTotal = types.reduce((s, t) => s + parseFloat(t.allocation), 0)
  const allocOk    = Math.abs(allocTotal - 100) <= 0.01
  const monthLabel = now.toLocaleDateString("id-ID", { month: "long" })

  const tabHref = (tab: string) => `/settings/categories?tab=${tab}`

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Kategori &amp; Budget</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurasi tahun <span className="font-medium text-foreground">{currentYear}</span>
          {" "}· Budget aktif untuk {monthLabel}
        </p>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────── */}
      <div className="flex border-b">
        <Link
          href={tabHref("income")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "income"
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
          href={tabHref("expense")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "expense"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Kategori Pengeluaran &amp; Budget
          {types.length > 0 && (
            <Badge
              variant={allocOk ? "secondary" : "destructive"}
              className="ml-2 text-xs"
            >
              {allocTotal.toFixed(0)}%
            </Badge>
          )}
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB: KATEGORI PENDAPATAN
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === "income" && (
        <div className="space-y-4">
          {incomeCategories.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Belum ada kategori pendapatan. Klaim lisensi untuk mendapatkan kategori default.
              </CardContent>
            </Card>
          )}

          {/* Tambah custom */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Tambah Kategori Custom</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createUserIncomeCategory} className="flex flex-wrap gap-3">
                <input type="hidden" name="year" value={currentYear} />
                <Input name="name" placeholder="Nama kategori" required className="max-w-xs" />
                <Input name="color" placeholder="Warna hex (opsional)" className="w-40" />
                <Button type="submit" size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Tambah
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {incomeCategories.map((cat) =>
              editIncome === cat.id ? (
                /* Edit mode */
                <form
                  key={cat.id}
                  action={updateUserIncomeCategory.bind(null, cat.id)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-4 py-3"
                >
                  <Input
                    name="name"
                    defaultValue={cat.name}
                    required
                    className="h-8 max-w-[220px] text-sm"
                    autoFocus
                  />
                  <Input
                    name="color"
                    defaultValue={cat.color ?? ""}
                    placeholder="Warna hex"
                    className="h-8 w-[150px] text-sm"
                  />
                  <Button type="submit" size="sm" className="h-8">Simpan</Button>
                  <Button asChild size="sm" variant="ghost" className="h-8">
                    <Link href={tabHref("income")}>
                      <X className="h-3.5 w-3.5 mr-1" />Batal
                    </Link>
                  </Button>
                </form>
              ) : (
                /* Normal mode */
                <div
                  key={cat.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-opacity ${
                    cat.is_hidden ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {cat.color && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <p className="font-medium">{cat.name}</p>
                    {cat.is_hidden && (
                      <Badge variant="outline" className="text-xs">Disembunyikan</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <Link href={`?tab=income&edit_income=${cat.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <form action={toggleUserIncomeCategoryVisibility.bind(null, cat.id)}>
                      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" title={cat.is_hidden ? "Tampilkan" : "Sembunyikan"}>
                        {cat.is_hidden
                          ? <Eye className="h-4 w-4" />
                          : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </form>
                    <form action={deleteUserIncomeCategory.bind(null, cat.id)}>
                      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: KATEGORI PENGELUARAN & BUDGET
      ════════════════════════════════════════════════════════════════ */}
      {activeTab === "expense" && (
        <div className="space-y-4">
          {types.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Belum ada kategori pengeluaran. Klaim lisensi untuk mendapatkan kategori default.
              </CardContent>
            </Card>
          )}

          {/* ── Alokasi per tipe ── */}
          {types.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Alokasi dari Total Pendapatan
                  </CardTitle>
                  <Badge variant={allocOk ? "default" : "destructive"} className="text-xs">
                    Total: {allocTotal.toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Persentase pendapatan yang dialokasikan ke setiap tipe. Total harus 100%.
                </p>
              </CardHeader>
              <CardContent>
                <form action={setTypeAllocations} className="space-y-3">
                  <input type="hidden" name="year" value={currentYear} />
                  {types.map((type, i) => (
                    <div key={type.id} className="flex items-center gap-3">
                      <input type="hidden" name={`type_${i}`} value={type.id} />
                      <span className="w-28 text-sm font-medium">{type.name}</span>
                      <Input
                        name={`pct_${i}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={parseFloat(type.allocation).toFixed(2)}
                        className="h-8 w-24 text-right text-sm"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  ))}
                  {allocError && (
                    <p className="text-sm text-destructive">
                      Total alokasi harus tepat 100% (sekarang {allocTotal.toFixed(2)}%).
                    </p>
                  )}
                  <Button type="submit" size="sm" className="mt-1">
                    Simpan Alokasi
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ── Kategori per tipe ── */}
          {types.map((type) => {
            const cats        = byType[type.id] ?? []
            const isFleksibel = type.name === "FLEKSIBEL"

            return (
              <Card key={type.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {type.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {parseFloat(type.allocation).toFixed(0)}% dari pendapatan
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {cats.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Belum ada kategori.</p>
                  )}

                  {cats.map((cat) =>
                    editExpense === cat.id ? (
                      /* Edit mode */
                      <form
                        key={cat.id}
                        action={updateUserExpenseCategory.bind(null, cat.id)}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-3 py-2.5"
                      >
                        <Input
                          name="name"
                          defaultValue={cat.name}
                          required
                          className="h-8 flex-1 min-w-[160px] text-sm"
                          autoFocus
                        />
                        <Button type="submit" size="sm" className="h-8">Simpan</Button>
                        <Button asChild size="sm" variant="ghost" className="h-8">
                          <Link href={tabHref("expense")}>
                            <X className="h-3.5 w-3.5 mr-1" />Batal
                          </Link>
                        </Button>
                      </form>
                    ) : (
                      /* Normal mode */
                      <div
                        key={cat.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-opacity ${
                          cat.is_hidden ? "opacity-50" : ""
                        }`}
                      >
                        {/* Nama + badge disembunyikan */}
                        <div className="flex flex-1 min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium">{cat.name}</p>
                          {cat.is_hidden && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Disembunyikan
                            </Badge>
                          )}
                        </div>

                        {/* Budget % — hanya untuk non-FLEKSIBEL */}
                        {!isFleksibel && (
                          <form action={setBudget} className="flex items-center gap-1.5 shrink-0">
                            <input type="hidden" name="category_id" value={cat.id} />
                            <input type="hidden" name="month" value={month} />
                            <input type="hidden" name="year" value={currentYear} />
                            <Input
                              name="percentage"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              defaultValue={cat.budget_pct ?? "0"}
                              className="h-7 w-20 text-right text-sm"
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                            <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-xs">
                              Simpan
                            </Button>
                          </form>
                        )}

                        {/* Edit / Hide / Delete */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`?tab=expense&edit_expense=${cat.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <form action={toggleUserExpenseCategoryVisibility.bind(null, cat.id)}>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={cat.is_hidden ? "Tampilkan" : "Sembunyikan"}
                            >
                              {cat.is_hidden
                                ? <Eye className="h-3.5 w-3.5" />
                                : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </form>
                          <form action={deleteUserExpenseCategory.bind(null, cat.id)}>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      </div>
                    ),
                  )}

                  {/* Tambah kategori */}
                  <form
                    action={createUserExpenseCategory}
                    className="flex items-center gap-2 border-t pt-3"
                  >
                    <input type="hidden" name="type_id" value={type.id} />
                    <input type="hidden" name="year" value={currentYear} />
                    <Input
                      name="name"
                      placeholder="Tambah kategori baru..."
                      required
                      className="h-8 flex-1 text-sm"
                    />
                    <Button type="submit" size="sm" className="h-8 shrink-0">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
