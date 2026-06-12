import { getDb } from '../index'
import { listUsers, type UserSummary } from './users-store'
import {
  CREDIT_TRANSACTIONS_TABLE,
  MODEL_PRICES_TABLE,
  USAGE_TABLE,
  USER_CREDITS_TABLE,
  USER_PROFILES_TABLE,
} from './schemas'

export interface ModelPrice {
  model: string
  input_credit_per_1k: number
  output_credit_per_1k: number
  input_rmb_per_1k: number
  output_rmb_per_1k: number
  created_at: number
  updated_at: number
  explicit?: boolean
}

export interface UserCreditAccount {
  user_id: number
  balance: number
  updated_at: number
}

export interface CreditTransaction {
  id: number
  user_id: number
  amount: number
  balance_after: number
  reason: string
  actor_user_id: number | null
  created_at: number
}

export interface BillingUserModelUsage {
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  sessions: number
  credits_spent: number
  real_rmb: number
}

export interface BillingUserSummary extends UserSummary {
  credits_balance: number
  credits_spent: number
  real_rmb: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  sessions: number
  model_usage: BillingUserModelUsage[]
}

export interface BillingSummary {
  period_days: number
  users: BillingUserSummary[]
  prices: ModelPrice[]
  totals: {
    credits_spent: number
    real_rmb: number
    input_tokens: number
    output_tokens: number
    sessions: number
  }
}

export interface UsageChargeResult {
  charged: boolean
  user_id: number | null
  amount: number
  balance_after: number | null
  credits_spent: number
  real_rmb: number
  input_tokens: number
  output_tokens: number
  model: string
  insufficient: boolean
}

const DEFAULT_PRICE: Omit<ModelPrice, 'model' | 'created_at' | 'updated_at' | 'explicit'> = {
  input_credit_per_1k: 0.01,
  output_credit_per_1k: 0.03,
  input_rmb_per_1k: 0.002,
  output_rmb_per_1k: 0.006,
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function normalizePrice(input: Partial<ModelPrice> & { model: string }): ModelPrice {
  return {
    model: input.model.trim() || 'unknown',
    input_credit_per_1k: Math.max(0, normalizeNumber(input.input_credit_per_1k, DEFAULT_PRICE.input_credit_per_1k)),
    output_credit_per_1k: Math.max(0, normalizeNumber(input.output_credit_per_1k, DEFAULT_PRICE.output_credit_per_1k)),
    input_rmb_per_1k: Math.max(0, normalizeNumber(input.input_rmb_per_1k, DEFAULT_PRICE.input_rmb_per_1k)),
    output_rmb_per_1k: Math.max(0, normalizeNumber(input.output_rmb_per_1k, DEFAULT_PRICE.output_rmb_per_1k)),
    created_at: normalizeNumber(input.created_at, 0),
    updated_at: normalizeNumber(input.updated_at, 0),
    explicit: input.explicit === true,
  }
}

export function defaultPriceForModel(model: string): ModelPrice {
  return {
    model: model.trim() || 'unknown',
    ...DEFAULT_PRICE,
    created_at: 0,
    updated_at: 0,
    explicit: false,
  }
}

export function listModelPrices(): ModelPrice[] {
  const db = getDb()
  if (!db) return []

  const explicitRows = db.prepare(`SELECT * FROM ${MODEL_PRICES_TABLE} ORDER BY model ASC`).all() as unknown as ModelPrice[]
  const priceMap = new Map(explicitRows.map(row => [row.model, normalizePrice({ ...row, explicit: true })]))
  const usageModels = db.prepare(
    `SELECT DISTINCT COALESCE(NULLIF(TRIM(model), ''), 'unknown') as model FROM ${USAGE_TABLE} ORDER BY model ASC`,
  ).all() as Array<{ model: string }>

  for (const row of usageModels) {
    const model = row.model || 'unknown'
    if (!priceMap.has(model)) priceMap.set(model, defaultPriceForModel(model))
  }

  return [...priceMap.values()].sort((a, b) => a.model.localeCompare(b.model))
}

export function upsertModelPrice(input: Partial<ModelPrice> & { model: string }): ModelPrice {
  const db = getDb()
  if (!db) throw new Error('Database not available')

  const now = Date.now()
  const price = normalizePrice({
    model: input.model,
    input_credit_per_1k: input.input_credit_per_1k,
    output_credit_per_1k: input.output_credit_per_1k,
    input_rmb_per_1k: input.input_rmb_per_1k,
    output_rmb_per_1k: input.output_rmb_per_1k,
    created_at: now,
    updated_at: now,
    explicit: true,
  })

  db.prepare(`
    INSERT INTO ${MODEL_PRICES_TABLE}
      (model, input_credit_per_1k, output_credit_per_1k, input_rmb_per_1k, output_rmb_per_1k, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model) DO UPDATE SET
      input_credit_per_1k = excluded.input_credit_per_1k,
      output_credit_per_1k = excluded.output_credit_per_1k,
      input_rmb_per_1k = excluded.input_rmb_per_1k,
      output_rmb_per_1k = excluded.output_rmb_per_1k,
      updated_at = excluded.updated_at
  `).run(
    price.model,
    price.input_credit_per_1k,
    price.output_credit_per_1k,
    price.input_rmb_per_1k,
    price.output_rmb_per_1k,
    now,
    now,
  )

  return { ...price, created_at: now, updated_at: now }
}

export function getUserCreditAccount(userId: number): UserCreditAccount {
  const db = getDb()
  if (!db) return { user_id: userId, balance: 0, updated_at: 0 }

  const existing = db.prepare(`SELECT * FROM ${USER_CREDITS_TABLE} WHERE user_id = ?`).get(userId) as UserCreditAccount | undefined
  if (existing) return existing

  const now = Date.now()
  db.prepare(`INSERT INTO ${USER_CREDITS_TABLE} (user_id, balance, updated_at) VALUES (?, 0, ?)`).run(userId, now)
  return { user_id: userId, balance: 0, updated_at: now }
}

export function adjustUserCredits(userId: number, amount: number, reason: string, actorUserId?: number | null): UserCreditAccount {
  const db = getDb()
  if (!db) throw new Error('Database not available')
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Credit amount must be non-zero')

  const now = Date.now()
  db.exec('BEGIN')
  try {
    const current = getUserCreditAccount(userId)
    const nextBalance = current.balance + amount
    db.prepare(`UPDATE ${USER_CREDITS_TABLE} SET balance = ?, updated_at = ? WHERE user_id = ?`)
      .run(nextBalance, now, userId)
    db.prepare(`
      INSERT INTO ${CREDIT_TRANSACTIONS_TABLE} (user_id, amount, balance_after, reason, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, amount, nextBalance, reason.trim(), actorUserId ?? null, now)
    db.exec('COMMIT')
    return { user_id: userId, balance: nextBalance, updated_at: now }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function listCreditTransactions(userId?: number, limit = 100): CreditTransaction[] {
  const db = getDb()
  if (!db) return []
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)))
  if (userId) {
    return db.prepare(`
      SELECT * FROM ${CREDIT_TRANSACTIONS_TABLE}
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(userId, safeLimit) as unknown as CreditTransaction[]
  }
  return db.prepare(`
    SELECT * FROM ${CREDIT_TRANSACTIONS_TABLE}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit) as unknown as CreditTransaction[]
}

function priceMapFromRows(rows: ModelPrice[]): Map<string, ModelPrice> {
  return new Map(rows.map(row => [row.model, normalizePrice(row)]))
}

export function costForUsage(row: Pick<BillingUserModelUsage, 'input_tokens' | 'output_tokens'>, price: ModelPrice): Pick<BillingUserModelUsage, 'credits_spent' | 'real_rmb'> {
  const inputUnits = row.input_tokens / 1000
  const outputUnits = row.output_tokens / 1000
  return {
    credits_spent: inputUnits * price.input_credit_per_1k + outputUnits * price.output_credit_per_1k,
    real_rmb: inputUnits * price.input_rmb_per_1k + outputUnits * price.output_rmb_per_1k,
  }
}

export function priceForModel(model: string): ModelPrice {
  const normalizedModel = model?.trim() || 'unknown'
  return listModelPrices().find(row => row.model === normalizedModel) || defaultPriceForModel(normalizedModel)
}

export function userIdForProfile(profile: string): number | null {
  const db = getDb()
  if (!db) return null
  const profileName = profile?.trim() || 'default'
  const row = db.prepare(`
    SELECT user_id FROM ${USER_PROFILES_TABLE}
    WHERE profile_name = ?
    ORDER BY is_default DESC, user_id ASC
    LIMIT 1
  `).get(profileName) as { user_id?: number } | undefined
  return Number.isInteger(row?.user_id) ? Number(row!.user_id) : null
}

export function chargeProfileUsage(input: {
  profile: string
  model?: string
  inputTokens: number
  outputTokens: number
  previousInputTokens?: number
  previousOutputTokens?: number
  sessionId?: string
}): UsageChargeResult {
  const db = getDb()
  const model = input.model?.trim() || 'unknown'
  const inputDelta = Math.max(0, Math.floor(input.inputTokens || 0) - Math.floor(input.previousInputTokens || 0))
  const outputDelta = Math.max(0, Math.floor(input.outputTokens || 0) - Math.floor(input.previousOutputTokens || 0))
  const emptyResult: UsageChargeResult = {
    charged: false,
    user_id: null,
    amount: 0,
    balance_after: null,
    credits_spent: 0,
    real_rmb: 0,
    input_tokens: inputDelta,
    output_tokens: outputDelta,
    model,
    insufficient: false,
  }
  if (!db || (inputDelta <= 0 && outputDelta <= 0)) return emptyResult

  const userId = userIdForProfile(input.profile)
  if (!userId) return emptyResult

  const price = priceForModel(model)
  const costs = costForUsage({
    input_tokens: inputDelta,
    output_tokens: outputDelta,
  }, price)
  const credits = Math.max(0, costs.credits_spent)
  if (credits <= 0) {
    return {
      ...emptyResult,
      user_id: userId,
      credits_spent: 0,
      real_rmb: costs.real_rmb,
    }
  }

  const now = Date.now()
  db.exec('BEGIN')
  try {
    const current = getUserCreditAccount(userId)
    const nextBalance = current.balance - credits
    db.prepare(`UPDATE ${USER_CREDITS_TABLE} SET balance = ?, updated_at = ? WHERE user_id = ?`)
      .run(nextBalance, now, userId)
    db.prepare(`
      INSERT INTO ${CREDIT_TRANSACTIONS_TABLE} (user_id, amount, balance_after, reason, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      -credits,
      nextBalance,
      `模型用量扣费${input.sessionId ? ` (${input.sessionId})` : ''}`,
      null,
      now,
    )
    db.exec('COMMIT')
    return {
      charged: true,
      user_id: userId,
      amount: -credits,
      balance_after: nextBalance,
      credits_spent: credits,
      real_rmb: costs.real_rmb,
      input_tokens: inputDelta,
      output_tokens: outputDelta,
      model,
      insufficient: nextBalance < 0,
    }
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function userHasPositiveCredits(userId: number): boolean {
  return getUserCreditAccount(userId).balance > 0
}

export function getBillingSummary(days = 30): BillingSummary {
  const db = getDb()
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number.isFinite(days) ? days : 30)))
  const users = listUsers()
  const prices = listModelPrices()
  const priceMap = priceMapFromRows(prices)

  const summaries = new Map<number, BillingUserSummary>()
  for (const user of users) {
    const credit = getUserCreditAccount(user.id)
    summaries.set(user.id, {
      ...user,
      credits_balance: credit.balance,
      credits_spent: 0,
      real_rmb: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      sessions: 0,
      model_usage: [],
    })
  }

  if (!db) {
    return {
      period_days: safeDays,
      users: [...summaries.values()],
      prices,
      totals: { credits_spent: 0, real_rmb: 0, input_tokens: 0, output_tokens: 0, sessions: 0 },
    }
  }

  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000
  const rows = db.prepare(`
    SELECT up.user_id as user_id,
      COALESCE(NULLIF(TRIM(latest.model), ''), 'unknown') as model,
      COALESCE(SUM(latest.input_tokens), 0) as input_tokens,
      COALESCE(SUM(latest.output_tokens), 0) as output_tokens,
      COALESCE(SUM(latest.cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(latest.cache_write_tokens), 0) as cache_write_tokens,
      COALESCE(SUM(latest.reasoning_tokens), 0) as reasoning_tokens,
      COUNT(DISTINCT latest.session_id) as sessions
    FROM ${USAGE_TABLE} latest
    INNER JOIN (
      SELECT session_id, MAX(id) as max_id
      FROM ${USAGE_TABLE}
      WHERE created_at > ?
      GROUP BY session_id
    ) newest ON newest.max_id = latest.id
    INNER JOIN ${USER_PROFILES_TABLE} up ON up.profile_name = latest.profile
    GROUP BY up.user_id, model
    ORDER BY input_tokens + output_tokens DESC
  `).all(cutoffMs) as Array<{
    user_id: number
    model: string
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
    reasoning_tokens: number
    sessions: number
  }>

  for (const raw of rows) {
    const summary = summaries.get(raw.user_id)
    if (!summary) continue
    const model = raw.model || 'unknown'
    const usage: BillingUserModelUsage = {
      model,
      input_tokens: raw.input_tokens,
      output_tokens: raw.output_tokens,
      cache_read_tokens: raw.cache_read_tokens,
      cache_write_tokens: raw.cache_write_tokens,
      reasoning_tokens: raw.reasoning_tokens,
      sessions: raw.sessions,
      credits_spent: 0,
      real_rmb: 0,
    }
    const costs = costForUsage(usage, priceMap.get(model) || defaultPriceForModel(model))
    usage.credits_spent = costs.credits_spent
    usage.real_rmb = costs.real_rmb

    summary.input_tokens += usage.input_tokens
    summary.output_tokens += usage.output_tokens
    summary.cache_read_tokens += usage.cache_read_tokens
    summary.cache_write_tokens += usage.cache_write_tokens
    summary.reasoning_tokens += usage.reasoning_tokens
    summary.sessions += usage.sessions
    summary.credits_spent += usage.credits_spent
    summary.real_rmb += usage.real_rmb
    summary.model_usage.push(usage)
  }

  const userSummaries = [...summaries.values()]
  return {
    period_days: safeDays,
    users: userSummaries,
    prices,
    totals: userSummaries.reduce((total, user) => ({
      credits_spent: total.credits_spent + user.credits_spent,
      real_rmb: total.real_rmb + user.real_rmb,
      input_tokens: total.input_tokens + user.input_tokens,
      output_tokens: total.output_tokens + user.output_tokens,
      sessions: total.sessions + user.sessions,
    }), { credits_spent: 0, real_rmb: 0, input_tokens: 0, output_tokens: 0, sessions: 0 }),
  }
}
