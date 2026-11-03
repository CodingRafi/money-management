import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { HealthInputForm } from "./_components/health-input-form"

export default function HealthCalculatorPage() {
  return (
    <div className="space-y-5 w-full">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/new"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analisis Fundamental Kesehatan</h1>
          <p className="text-sm text-muted-foreground">
            Rumah Sakit, Farmasi, dan Alat Kesehatan — threshold menyesuaikan sub-sektor
          </p>
        </div>
      </div>
      <HealthInputForm />
    </div>
  )
}
