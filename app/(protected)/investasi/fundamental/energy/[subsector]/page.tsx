import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { ENERGY_SUBSECTOR_LABELS, type EnergySubsector } from "@/lib/fundamental/energy-types"
import { EnergyInputForm } from "../../_components/energy-input-form"

const VALID: EnergySubsector[] = ['migas', 'batubara', 'ebt']

export default async function EnergyCalculatorPage({
  params,
}: {
  params: Promise<{ subsector: string }>
}) {
  const { subsector } = await params
  if (!VALID.includes(subsector as EnergySubsector)) redirect("/investasi/fundamental/energy")
  const sub = subsector as EnergySubsector

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/energy"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analisis Fundamental — {ENERGY_SUBSECTOR_LABELS[sub]}</h1>
          <p className="text-sm text-muted-foreground">
            Input data laporan keuangan untuk menghitung rasio & skor fundamental sektor energi
          </p>
        </div>
      </div>
      <EnergyInputForm subsector={sub} />
    </div>
  )
}
