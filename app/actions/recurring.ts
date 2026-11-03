"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireScope, requireWritableSession } from "@/lib/scope"
import { requirePermissionAction } from "@/lib/session"
import { PERMISSION } from "@/lib/permissions"
import { recurringService, type Candidate } from "@/services/recurring.service"

const idSchema = z.string().min(1).max(100)

async function writer() {
  await requirePermissionAction(PERMISSION.CASHFLOW.CREATE)
  return requireWritableSession()
}

function refresh() {
  revalidatePath("/pengaturan/pola")
  revalidatePath("/dashboard")
  revalidatePath("/rekap", "layout")
}

/** Kandidat pola dari histori (butuh cashflow.view). `showAll` = sertakan confidence rendah. */
export async function listDetectedPatterns(showAll = false): Promise<Candidate[]> {
  await requirePermissionAction(PERMISSION.CASHFLOW.VIEW)
  const scope = await requireScope()
  return recurringService.detect(scope.userIds, { minConfidence: showAll ? 0.3 : 0.55 })
}

/** Form kandidat membawa seluruh pola sebagai JSON di field `payload` (divalidasi zod di service). */
function parsePayload(formData: FormData, autoPost: boolean): unknown {
  const raw = formData.get("payload")
  if (typeof raw !== "string") throw new Error("Data pola tidak valid")
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    throw new Error("Data pola tidak valid")
  }
  return { ...(obj as object), autoPost }
}

export async function confirmPattern(formData: FormData): Promise<void> {
  const session = await writer()
  const autoPost = formData.get("auto_post") === "on"
  await recurringService.confirm(session, parsePayload(formData, autoPost))
  refresh()
}

export async function ignorePattern(formData: FormData): Promise<void> {
  const session = await writer()
  await recurringService.ignore(session, parsePayload(formData, false))
  refresh()
}

export async function updatePattern(id: string, formData: FormData): Promise<void> {
  const session = await writer()
  await recurringService.edit(session, idSchema.parse(id), {
    name: String(formData.get("name") ?? ""),
    amountAvg: Number(formData.get("amount")),
    dayOfMonth: Number(formData.get("day")),
    autoPost: formData.get("auto_post") === "on",
  })
  refresh()
}

export async function togglePatternActive(id: string, active: boolean): Promise<void> {
  const session = await writer()
  await recurringService.setState(session, idSchema.parse(id), { isActive: active, ...(active ? {} : { autoPost: false }) })
  refresh()
}

export async function deletePattern(id: string): Promise<void> {
  const session = await writer()
  await recurringService.remove(session, idSchema.parse(id))
  refresh()
}

/** Tombol "Catat sekarang" pada card Perlu Dicatat. */
export async function recordPatternNow(id: string): Promise<void> {
  const session = await writer()
  await recurringService.postNow(session, idSchema.parse(id))
  refresh()
}

/** Tombol "Tandai sudah" — bulan ini sudah dicatat di tempat lain. */
export async function markPatternHandled(id: string): Promise<void> {
  const session = await writer()
  await recurringService.markHandled(session, idSchema.parse(id))
  refresh()
}

/** Buat transaksi untuk pola auto_post yang jatuh tempo (idempotent). */
export async function postDuePatterns(): Promise<{ created: number; skipped: number }> {
  const session = await writer()
  const res = await recurringService.postDue(session)
  if (res.created) refresh()
  return res
}
