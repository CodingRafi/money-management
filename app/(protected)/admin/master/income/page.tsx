import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, X } from "lucide-react"
import Link from "next/link"
import {
  createMasterIncomeCategory,
  updateMasterIncomeCategory,
  deleteMasterIncomeCategory,
} from "@/app/actions/categories"

type IncomeCat = {
  id: string
  name: string
  color: string | null
  sort_order: number
}

export default async function MasterIncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp     = await searchParams
  const editId = typeof sp.edit === "string" ? sp.edit : null

  const { rows } = await pool.query<IncomeCat>(
    `SELECT id, name, color, sort_order
     FROM income_categories
     WHERE is_default = true AND user_id IS NULL
     ORDER BY sort_order, name`,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kategori Pendapatan Default</h1>
        <p className="text-sm text-muted-foreground">
          Template kategori pendapatan untuk semua user baru
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tambah Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createMasterIncomeCategory} className="flex flex-wrap gap-3">
            <Input
              name="name"
              placeholder="Nama kategori (e.g. GAJI POKOK)"
              required
              className="max-w-xs"
            />
            <Input
              name="color"
              placeholder="Warna hex (opsional, e.g. #10b981)"
              className="max-w-[200px]"
            />
            <Button type="submit">Tambah</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada kategori default. Jalankan migrasi untuk menambah seed data.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((cat) =>
                editId === cat.id ? (
                  /* ── Edit mode ── */
                  <form
                    key={cat.id}
                    action={updateMasterIncomeCategory.bind(null, cat.id)}
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
                    <Button type="submit" size="sm" className="h-8">
                      Simpan
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-8">
                      <Link href="/admin/master/income">
                        <X className="h-3.5 w-3.5 mr-1" />
                        Batal
                      </Link>
                    </Button>
                  </form>
                ) : (
                  /* ── Normal mode ── */
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {cat.color && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      <p className="font-medium">{cat.name}</p>
                      <Badge variant="secondary" className="text-xs">
                        #{cat.sort_order}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link href={`?edit=${cat.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <form action={deleteMasterIncomeCategory.bind(null, cat.id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
