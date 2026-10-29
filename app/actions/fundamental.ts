"use server"

import { db } from "@/lib/db"
import { requireUserIdAction } from "@/lib/session"
import type { BankAnalysisResult } from "@/lib/fundamental/types"
import type { TechAnalysisResult } from "@/lib/fundamental/tech-types"
import type { EnergyAnalysisResult } from "@/lib/fundamental/energy-types"
import type { PropertyAnalysisResult } from "@/lib/fundamental/property-types"
import crypto from "crypto"
import { revalidatePath } from "next/cache"

function uuid() { return crypto.randomUUID() }

// ── Bank ──────────────────────────────────────────────────────────────────────

export async function saveAnalysis(result: BankAnalysisResult): Promise<string> {
  const userId = await requireUserIdAction()
  const id     = uuid()
  await db.prepare(
    `INSERT INTO fundamental_analyses (id, user_id, sector, stock_code, period, input_data, result_data)
     VALUES (?, ?, 'BANK', ?, ?, ?, ?)`
  ).run(id, userId, result.input.stockCode.toUpperCase(), result.input.period, JSON.stringify(result.input), JSON.stringify(result))
  revalidatePath("/investasi/fundamental")
  return id
}

// ── Tech ──────────────────────────────────────────────────────────────────────

export async function saveTechAnalysis(result: TechAnalysisResult): Promise<string> {
  const userId = await requireUserIdAction()
  const id     = uuid()
  const sector = `TECH_${result.subsector.toUpperCase()}`
  await db.prepare(
    `INSERT INTO fundamental_analyses (id, user_id, sector, stock_code, period, input_data, result_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, sector, result.input.stockCode.toUpperCase(), result.input.period, JSON.stringify(result.input), JSON.stringify(result))
  revalidatePath("/investasi/fundamental")
  return id
}

// ── Energy ────────────────────────────────────────────────────────────────────

export async function saveEnergyAnalysis(result: EnergyAnalysisResult): Promise<string> {
  const userId = await requireUserIdAction()
  const id     = uuid()
  const sector = `ENERGY_${result.subsector.toUpperCase()}`
  await db.prepare(
    `INSERT INTO fundamental_analyses (id, user_id, sector, stock_code, period, input_data, result_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, sector, result.input.stockCode.toUpperCase(), result.input.period, JSON.stringify(result.input), JSON.stringify(result))
  revalidatePath("/investasi/fundamental")
  return id
}

// ── Property ─────────────────────────────────────────────────────────────────

export async function savePropertyAnalysis(result: PropertyAnalysisResult): Promise<string> {
  const userId = await requireUserIdAction()
  const id     = uuid()
  await db.prepare(
    `INSERT INTO fundamental_analyses (id, user_id, sector, stock_code, period, input_data, result_data)
     VALUES (?, ?, 'PROPERTY', ?, ?, ?, ?)`
  ).run(id, userId, result.input.stockCode.toUpperCase(), result.input.period, JSON.stringify(result.input), JSON.stringify(result))
  revalidatePath("/investasi/fundamental")
  return id
}

// ── Shared delete ─────────────────────────────────────────────────────────────

export async function deleteAnalysis(id: string): Promise<void> {
  const userId = await requireUserIdAction()
  await db.prepare("DELETE FROM fundamental_analyses WHERE id = ? AND user_id = ?").run(id, userId)
  revalidatePath("/investasi/fundamental")
}
