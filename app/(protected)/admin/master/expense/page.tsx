import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, X } from "lucide-react"
import Link from "next/link"
import {
  createMasterExpenseCategory,
  updateMasterExpenseCategory,
  deleteMasterExpenseCategory,
} from "@/app/actions/categories"

type ExpenseType = { id: string; name: string; sort_order: number }
type ExpenseCat  = {
  id: string
  name: string
  type_id: string
  sort_order: number
  default_percentage: string
}

export default async function MasterExpensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp     = await searchParams
  const editId = typeof sp.edit === "string" ? sp.edit : null

  const [typesRes, catsRes] = await Promise.all([
    pool.query<ExpenseType>(
      `SELECT id, name, sort_order FROM expense_types
       WHERE is_default = true AND user_id IS NULL
       ORDER BY sort_order`,
    ),
    pool.query<ExpenseCat>(
      `SELECT id, name, type_id, sort_order, default_percentage::text
       FROM expense_categories
       WHERE is_default = true AND user_id IS NULL
       ORDER BY sort_order`,
    ),
  ])

  const types  = typesRes.rows
  const byType = catsRes.rows.reduce<Record<string, ExpenseCat[]>>((acc, cat) => {
    acc[cat.type_id] ??= []
    acc[cat.type_id].push(cat)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kategori Pengeluaran Default</h1>
        <p className="text-sm text-muted-foreground">
          Tipe pengeluaran tetap: <strong>TETAP · FLEKSIBEL</strong>. Kelola kategori di dalam setiap tipe.
        </p>
      </div>

      {types.map((type) => (
        <Card key={type.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{type.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              {(byType[type.id] ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic">Belum ada kategori.</p>
              )}
              {(byType[type.id] ?? []).map((cat) =>
                editId === cat.id ? (
                  /* ── Edit mode ── */
                  <form
                    key={cat.id}
                    action={updateMasterExpenseCategory.bind(null, cat.id)}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-3 py-2"
                  >
                    <Input
                      name="name"
                      defaultValue={cat.name}
                      required
                      className="h-8 max-w-[200px] text-sm"
                      autoFocus
                    />
                    <Input
                      name="default_percentage"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      defaultValue={cat.default_percentage}
                      placeholder="% default"
                      className="h-8 w-28 text-sm"
                    />
                    <Button type="submit" size="sm" className="h-8">
                      Simpan
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-8">
                      <Link href="/admin/master/expense">
                        <X className="h-3.5 w-3.5 mr-1" />
                        Batal
                      </Link>
                    </Button>
                  </form>
                ) : (
                  /* ── Normal mode ── */
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{cat.name}</p>
                      {parseFloat(cat.default_percentage) > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {parseFloat(cat.default_percentage)}%
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                        <Link href={`?edit=${cat.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <form action={deleteMasterExpenseCategory.bind(null, cat.id)}>
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
            </div>

            {/* Add category */}
            <form
              action={createMasterExpenseCategory}
              className="flex flex-wrap items-center gap-2 border-t pt-3"
            >
              <input type="hidden" name="type_id" value={type.id} />
              <Input
                name="name"
                placeholder="Nama kategori baru"
                required
                className="h-8 max-w-xs text-sm"
              />
              <Input
                name="default_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="% default"
                className="h-8 w-28 text-sm"
              />
              <Button type="submit" size="sm" className="h-8">
                Tambah
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
