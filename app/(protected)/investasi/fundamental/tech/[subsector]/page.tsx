import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { TECH_SUBSECTOR_LABELS, type TechSubsector } from "@/lib/fundamental/tech-types"
import { TechInputForm } from "../../_components/tech-input-form"

const VALID: TechSubsector[] = ['general', 'saas', 'ecommerce']

export default async function TechCalculatorPage({
  params,
}: {
  params: Promise<{ subsector: string }>
}) {
  const { subsector } = await params
  if (!VALID.includes(subsector as TechSubsector)) redirect("/investasi/fundamental/tech")
  const sub = subsector as TechSubsector

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/tech"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analisis Fundamental — {TECH_SUBSECTOR_LABELS[sub]}</h1>
          <p className="text-sm text-muted-foreground">
            Input data dua periode untuk menghitung rasio & skor fundamental
          </p>
        </div>
      </div>
      <TechInputForm subsector={sub} />
    </div>
  )
}
