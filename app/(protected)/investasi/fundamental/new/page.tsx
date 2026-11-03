import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Building2, Cpu, Zap, Building, HeartPulse, Truck, Construction } from "lucide-react"
import Link from "next/link"

export default function NewAnalysisPage() {
  return (
    <div className="space-y-5 w-full">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pilih Sektor</h1>
          <p className="text-sm text-muted-foreground">Setiap sektor punya rasio dan threshold yang berbeda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7 gap-4">
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

        <Link href="/investasi/fundamental/property">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Property</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Analisis perusahaan property: profitabilitas, leverage, likuiditas, valuasi PBV & PER
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["GPM", "ROE", "DER", "CR", "PBV"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{r}</span>
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

        <Link href="/investasi/fundamental/energy">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Energi</p>
                <p className="text-sm text-muted-foreground mt-1">
                  3 sub-sektor: Migas, Batu Bara, dan EBT — rasio operasional spesifik tiap komoditas
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["EBITDA Margin", "RLI / Produksi", "FCF", "EV/EBITDA"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/investasi/fundamental/health">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Kesehatan</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Rumah Sakit, Farmasi, dan Alat Kesehatan — margin, okupansi (BOR), R&D, EV/EBITDA
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["EBITDA Margin", "BOR", "ROE", "EV/EBITDA"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/investasi/fundamental/transport">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Transportasi</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Logistik, Pelayaran, dan Penerbangan — margin, load factor, asset turnover, Net Debt/EBITDA
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["EBITDA Margin", "Load Factor", "Asset Turnover", "Net Debt/EBITDA"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/investasi/fundamental/infra">
          <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer h-full">
            <CardContent className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                <Construction className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-base">Infrastruktur</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Jalan Tol, Konstruksi, dan Utilitas & Menara — margin, konversi kas, order book, Net Debt/EBITDA
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {["EBITDA Margin", "Order Book", "CFO/NI", "Net Debt/EBITDA"].map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">{r}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
