import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, BarChart2, RefreshCw, ShoppingCart } from "lucide-react"
import Link from "next/link"

const SUBSECTORS = [
  {
    key:   "general",
    label: "Tech Umum",
    icon:  BarChart2,
    color: "bg-slate-100 text-slate-700",
    tagColor: "bg-slate-50 text-slate-700",
    desc:  "Untuk perusahaan teknologi hardware, IT services, software tradisional, atau mixed model. Metrik profitabilitas & arus kas klasik.",
    tags:  ["Gross Margin", "ROE", "FCF Margin", "PEG Ratio", "P/S"],
    href:  "/investasi/fundamental/tech/general",
  },
  {
    key:   "saas",
    label: "SaaS / Software",
    icon:  RefreshCw,
    color: "bg-violet-100 text-violet-700",
    tagColor: "bg-violet-50 text-violet-700",
    desc:  "Untuk perusahaan model subscription/recurring revenue. Fokus pada ARR growth, Rule of 40, dan gross margin yang tinggi.",
    tags:  ["ARR Growth", "Rule of 40", "Gross Margin ≥70%", "EV/Revenue"],
    href:  "/investasi/fundamental/tech/saas",
  },
  {
    key:   "ecommerce",
    label: "E-Commerce / Platform",
    icon:  ShoppingCart,
    color: "bg-emerald-100 text-emerald-700",
    tagColor: "bg-emerald-50 text-emerald-700",
    desc:  "Untuk marketplace, e-commerce, dan platform digital. Fokus pada GMV growth, take rate, dan path to profitability.",
    tags:  ["GMV Growth", "Take Rate", "EV/Revenue", "FCF Margin"],
    href:  "/investasi/fundamental/tech/ecommerce",
  },
]

export default function TechSubsectorPage() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi/fundamental/new"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Pilih Sub-Sektor Teknologi</h1>
          <p className="text-sm text-muted-foreground">Threshold & bobot disesuaikan per model bisnis</p>
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
