import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Building2, Cpu } from "lucide-react"
import Link from "next/link"

export default function NewAnalysisPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pilih Sektor</h1>
          <p className="text-sm text-muted-foreground">Setiap sektor punya rasio dan threshold yang berbeda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/investasi/fundamental/bank">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Perbankan</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Rasio spesifik bank: NIM, NPL, CAR, BOPO, LDR, CASA, Coverage Ratio + Justified PBV
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["NIM", "NPL", "CAR", "BOPO", "LDR"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/investasi/fundamental/tech">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Teknologi</p>
                <p className="text-sm text-muted-foreground mt-1">
                  3 sub-sektor: Tech Umum, SaaS/Software, dan E-Commerce — masing-masing threshold berbeda
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["Gross Margin", "Revenue Growth", "FCF", "Rule of 40"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
