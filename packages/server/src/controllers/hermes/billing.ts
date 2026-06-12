import type { Context } from 'koa'
import {
  adjustUserCredits,
  getBillingSummary,
  listCreditTransactions,
  listModelPrices,
  upsertModelPrice,
} from '../../db/hermes/billing-store'
import { findUserById } from '../../db/hermes/users-store'

function safeDays(value: unknown): number {
  const days = parseInt(String(value ?? '30'), 10)
  return Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30
}

function parsePriceNumber(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : NaN
}

export async function summary(ctx: Context) {
  ctx.body = getBillingSummary(safeDays(ctx.query.days))
}

export async function prices(ctx: Context) {
  ctx.body = { prices: listModelPrices() }
}

export async function savePrice(ctx: Context) {
  const body = ctx.request.body as {
    model?: unknown
    input_credit_per_1k?: unknown
    output_credit_per_1k?: unknown
    input_rmb_per_1k?: unknown
    output_rmb_per_1k?: unknown
  }
  const model = String(body.model || '').trim()
  if (!model) {
    ctx.status = 400
    ctx.body = { error: 'Model is required' }
    return
  }

  const inputCredit = parsePriceNumber(body.input_credit_per_1k)
  const outputCredit = parsePriceNumber(body.output_credit_per_1k)
  const inputRmb = parsePriceNumber(body.input_rmb_per_1k)
  const outputRmb = parsePriceNumber(body.output_rmb_per_1k)
  if ([inputCredit, outputCredit, inputRmb, outputRmb].some(value => Number.isNaN(value))) {
    ctx.status = 400
    ctx.body = { error: 'Prices must be non-negative numbers' }
    return
  }

  const price = upsertModelPrice({
    model,
    input_credit_per_1k: inputCredit,
    output_credit_per_1k: outputCredit,
    input_rmb_per_1k: inputRmb,
    output_rmb_per_1k: outputRmb,
  })
  ctx.body = { success: true, price, prices: listModelPrices() }
}

export async function adjustCredits(ctx: Context) {
  const id = Number(ctx.params.id)
  const user = Number.isInteger(id) ? findUserById(id) : null
  if (!user) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  const body = ctx.request.body as { amount?: unknown; reason?: unknown }
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    ctx.status = 400
    ctx.body = { error: 'Credit amount must be a non-zero number' }
    return
  }

  const account = adjustUserCredits(
    user.id,
    amount,
    String(body.reason || '').trim() || '管理员调整',
    ctx.state.user?.id ?? null,
  )
  ctx.body = {
    success: true,
    account,
    transactions: listCreditTransactions(user.id, 50),
  }
}

export async function transactions(ctx: Context) {
  const id = ctx.query.user_id ? Number(ctx.query.user_id) : undefined
  const limit = ctx.query.limit ? Number(ctx.query.limit) : 100
  ctx.body = {
    transactions: listCreditTransactions(Number.isInteger(id) ? id : undefined, Number.isFinite(limit) ? limit : 100),
  }
}
