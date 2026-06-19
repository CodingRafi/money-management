import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Flame, Mountain, Zap } from "lucide-react"
import Link from "next/link"

const SUBSECTORS = [
  {
    key:      "migas",
    label:    "Minyak & Gas (Migas)",
    icon:     Flame,
    color:    "bg-orange-100 text-orange-700",
    tagColor: "bg-orange-50 text-orange-700",
    desc:     "Perusahaan eksplorasi & produksi migas. Fokus pada Reserve Life Index (RLI), production growth, dan EBITDA margin yang tinggi.",
    tags:     ["Reserve Life Index", "Production Growth", "EBITDA Margin", "EV/EBITDA"],
    href:     "/investasi/fundamental/energy/migas",
  },
  {
    key:      "batubara",
    label:    "Batu Bara",
    icon:     Mountain,
    color:    "bg-stone-100 text-stone-700",
    tagColor: "bg-stone-50 text-stone-700",
    desc:     "Produsen batu bara thermal & metalurgi. Fokus pada production growth, ASP vs cash cost, dan FCF yang kuat di siklus harga tinggi.",
    tags:     ["ASP / Cash Cost", "Production Growth", "FCF Margin", "EV/EBITDA"],
    href:     "/investasi/fundamental/energy/batubara",
  },
  {
    key:      "ebt",
    label:    "Energi Baru Terbarukan",
    icon:     Zap,
    color:    "bg-emerald-100 text-emerald-700",
    tagColor: "bg-emerald-50 text-emerald-700",
    desc:     "Perusahaan pembangkit EBT (geothermal, surya, angin, hidro). Fokus pada capacity factor, generation growth, dan leverage terstruktur via PPA.",
    tags:     ["Capacity Factor", "Generation Growth", "EBITDA Margin", "Revenue/MW"],
    href:     "/investasi/fundamental/energy/ebt",
  },
]

export default function EnergySubsectorPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/new"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pilih Sub-Sektor Energi</h1>
          <p className="text-sm text-muted-foreground">Threshold & bobot disesuaikan per karakteristik bisnis</p>
        </div>
      </div>

      <div className="space-y-3">
        {SUBSECTORS.map((s) => (
          <Link key={s.key} href={s.href}>
            <Card className="hover:border-primary/60 hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-5 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.tags.map((t) => (
                      <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.tagColor}`}>{t}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
