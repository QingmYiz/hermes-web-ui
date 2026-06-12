import { request } from '../client'
import type { ManagedUser } from '../auth'

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

export interface BillingUserSummary extends ManagedUser {
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

export interface MyBillingResponse {
  period_days: number
  account: { user_id: number; balance: number; updated_at: number }
  user: BillingUserSummary | null
  transactions: CreditTransaction[]
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

export async function fetchBillingSummary(days = 30): Promise<BillingSummary> {
  const params = new URLSearchParams()
  params.set('days', String(Math.max(1, Math.floor(days))))
  return request<BillingSummary>(`/api/hermes/billing/summary?${params}`)
}

export async function fetchMyBilling(days = 30): Promise<MyBillingResponse> {
  const params = new URLSearchParams()
  params.set('days', String(Math.max(1, Math.floor(days))))
  return request<MyBillingResponse>(`/api/hermes/billing/me?${params}`)
}

export async function saveModelPrice(input: Pick<ModelPrice,
  'model' |
  'input_credit_per_1k' |
  'output_credit_per_1k' |
  'input_rmb_per_1k' |
  'output_rmb_per_1k'
>): Promise<{ success: boolean; price: ModelPrice; prices: ModelPrice[] }> {
  return request('/api/hermes/billing/model-prices', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function adjustUserCredits(userId: number, amount: number, reason: string): Promise<{
  success: boolean
  account: { user_id: number; balance: number; updated_at: number }
  transactions: CreditTransaction[]
}> {
  return request(`/api/hermes/billing/users/${userId}/credits`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  })
}
