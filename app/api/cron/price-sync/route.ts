import { NextResponse } from "next/server"
import { marketService } from "@/services/market.service"

/**
 * Cron harian sinkronisasi harga (aset ber-ticker + benchmark). Dijaga
 * CRON_SECRET (Vercel Cron mengirim `Authorization: Bearer <CRON_SECRET>`).
 * Kegagalan sumber eksternal dilaporkan di respons, tidak melempar error.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { assets, benchmarks } = await marketService.syncEverything(1)
    return NextResponse.json({
      assets: { ok: assets.filter((a) => a.ok).length, failed: assets.filter((a) => !a.ok).length },
      benchmarks: { ok: benchmarks.filter((a) => a.ok).length, failed: benchmarks.filter((a) => !a.ok).length },
    })
  } catch (err) {
    console.error("[cron price-sync]", err)
    return NextResponse.json({ error: "Sync gagal" }, { status: 500 })
  }
}
