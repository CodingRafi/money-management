import { redirect } from "next/navigation"

export default function CategoriesPage() {
  redirect(`/rekap/${new Date().getFullYear()}?view=kategori`)
}
