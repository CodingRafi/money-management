import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { InfraInputForm } from "./_components/infra-input-form"

export default function InfraCalculatorPage() {
  return (
    <div className="space-y-5 w-full">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/new"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Analisis Fundamental Infraasi</h1>
          <p className="text-sm text-muted-foreground">
            Jalan Tol, Konstruksi, dan Utilitas & Menara — threshold menyesuaikan sub-sektor
          </p>
        </div>
      </div>
      <InfraInputForm />
    </div>
  )
}
