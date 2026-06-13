<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import {
  adjustUserCredits,
  fetchBillingSummary,
  saveModelPrice,
  type BillingSummary,
  type BillingUserSummary,
  type ModelPrice,
} from '@/api/hermes/billing'
import { fetchAvailableModels } from '@/api/hermes/system'
import { useAppStore } from '@/stores/hermes/app'

const DEFAULT_PRICE = {
  input_credit_per_1k: 0.01,
  output_credit_per_1k: 0.03,
  input_rmb_per_1k: 0.002,
  output_rmb_per_1k: 0.006,
}

const message = useMessage()
const appStore = useAppStore()
const loading = ref(false)
const savingPrice = ref('')
const savingNewPrice = ref(false)
const adjusting = ref(false)
const selectedPeriod = ref(30)
const summary = ref<BillingSummary | null>(null)
const prices = ref<ModelPrice[]>([])
const knownModels = ref<string[]>([])
const showAdjustModal = ref(false)
const adjustUser = ref<BillingUserSummary | null>(null)
const adjustAmount = ref<number | null>(null)
const adjustReason = ref('')

const newPrice = reactive({
  model: '',
  input_credit_per_1k: DEFAULT_PRICE.input_credit_per_1k,
  output_credit_per_1k: DEFAULT_PRICE.output_credit_per_1k,
  input_rmb_per_1k: DEFAULT_PRICE.input_rmb_per_1k,
  output_rmb_per_1k: DEFAULT_PRICE.output_rmb_per_1k,
})

const periodOptions = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '365 天', value: 365 },
]

const users = computed(() => summary.value?.users || [])
const totals = computed(() => summary.value?.totals || {
  credits_spent: 0,
  real_rmb: 0,
  input_tokens: 0,
  output_tokens: 0,
  sessions: 0,
})

const modelSelectOptions = computed(() => knownModels.value.map(model => ({ label: model, value: model })))

const visiblePrices = computed(() => {
  const map = new Map(prices.value.map(price => [price.model, { ...price }]))
  for (const model of knownModels.value) {
    if (!map.has(model)) {
      map.set(model, {
        model,
        ...DEFAULT_PRICE,
        created_at: 0,
        updated_at: 0,
        explicit: false,
      })
    }
  }
  return [...map.values()].sort((a, b) => a.model.localeCompare(b.model))
})

function formatNumber(value: number | undefined | null, digits = 2): string {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return '0'
  return numberValue.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString()
}

function normalizePriceInput(row: Pick<ModelPrice,
  'model' |
  'input_credit_per_1k' |
  'output_credit_per_1k' |
  'input_rmb_per_1k' |
  'output_rmb_per_1k'
>) {
  return {
    model: row.model.trim(),
    input_credit_per_1k: Math.max(0, Number(row.input_credit_per_1k) || 0),
    output_credit_per_1k: Math.max(0, Number(row.output_credit_per_1k) || 0),
    input_rmb_per_1k: Math.max(0, Number(row.input_rmb_per_1k) || 0),
    output_rmb_per_1k: Math.max(0, Number(row.output_rmb_per_1k) || 0),
  }
}

function collectModelsFromStore(): string[] {
  const models = new Set<string>()
  for (const group of appStore.modelGroups) {
    for (const model of group.models || []) models.add(model)
    for (const model of group.available_models || []) models.add(model)
  }
  for (const profile of appStore.profileModelGroups) {
    for (const group of profile.groups || []) {
      for (const model of group.models || []) models.add(model)
      for (const model of group.available_models || []) models.add(model)
    }
  }
  return [...models]
}

async function loadKnownModels() {
  const models = new Set<string>(collectModelsFromStore())
  try {
    const res = await fetchAvailableModels()
    for (const group of res.groups || []) {
      for (const model of group.models || []) models.add(model)
      for (const model of group.available_models || []) models.add(model)
    }
    for (const profile of res.profiles || []) {
      for (const group of profile.groups || []) {
        for (const model of group.models || []) models.add(model)
        for (const model of group.available_models || []) models.add(model)
      }
    }
  } catch {
    // The manual input remains available when the model catalog cannot be loaded.
  }
  knownModels.value = [...models].filter(Boolean).sort((a, b) => a.localeCompare(b))
}

async function loadBilling(days = selectedPeriod.value) {
  selectedPeriod.value = days
  loading.value = true
  try {
    await appStore.loadModels()
    await loadKnownModels()
    const res = await fetchBillingSummary(days)
    summary.value = res
    prices.value = res.prices.map(price => ({ ...price }))
    for (const price of res.prices) {
      if (!knownModels.value.includes(price.model)) knownModels.value.push(price.model)
    }
    knownModels.value = [...new Set(knownModels.value)].sort((a, b) => a.localeCompare(b))
  } catch (err: any) {
    message.error(err.message || '计费数据加载失败')
  } finally {
    loading.value = false
  }
}

async function persistPrice(row: Pick<ModelPrice,
  'model' |
  'input_credit_per_1k' |
  'output_credit_per_1k' |
  'input_rmb_per_1k' |
  'output_rmb_per_1k'
>) {
  const payload = normalizePriceInput(row)
  if (!payload.model) {
    message.error('请输入模型 ID')
    return null
  }
  const res = await saveModelPrice(payload)
  prices.value = res.prices.map(price => ({ ...price }))
  if (!knownModels.value.includes(payload.model)) {
    knownModels.value = [...knownModels.value, payload.model].sort((a, b) => a.localeCompare(b))
  }
  return res
}

async function handleSavePrice(row: ModelPrice) {
  savingPrice.value = row.model
  try {
    await persistPrice(row)
    await loadBilling()
    message.success('模型价格已保存')
  } catch (err: any) {
    message.error(err.message || '价格保存失败')
  } finally {
    savingPrice.value = ''
  }
}

async function handleAddPrice() {
  savingNewPrice.value = true
  try {
    const res = await persistPrice(newPrice)
    if (!res) return
    message.success('模型价格已保存')
    newPrice.model = ''
    newPrice.input_credit_per_1k = DEFAULT_PRICE.input_credit_per_1k
    newPrice.output_credit_per_1k = DEFAULT_PRICE.output_credit_per_1k
    newPrice.input_rmb_per_1k = DEFAULT_PRICE.input_rmb_per_1k
    newPrice.output_rmb_per_1k = DEFAULT_PRICE.output_rmb_per_1k
    await loadBilling()
  } catch (err: any) {
    message.error(err.message || '价格保存失败')
  } finally {
    savingNewPrice.value = false
  }
}

function openAdjustModal(row: BillingUserSummary) {
  adjustUser.value = row
  adjustAmount.value = null
  adjustReason.value = ''
  showAdjustModal.value = true
}

async function submitAdjustCredits() {
  if (!adjustUser.value || !adjustAmount.value) {
    message.error('请输入要增加或减少的积分')
    return
  }
  adjusting.value = true
  try {
    await adjustUserCredits(
      adjustUser.value.id,
      adjustAmount.value,
      adjustReason.value.trim() || '管理员调整',
    )
    showAdjustModal.value = false
    await loadBilling()
    message.success('积分已调整')
  } catch (err: any) {
    message.error(err.message || '积分调整失败')
  } finally {
    adjusting.value = false
  }
}

const userColumns = computed<DataTableColumns<BillingUserSummary>>(() => [
  {
    type: 'expand',
    renderExpand: row => h('div', { class: 'model-usage-list' }, row.model_usage.length
      ? row.model_usage.map(item => h('div', { class: 'model-usage-row', key: `${row.id}-${item.model}` }, [
        h('span', { class: 'model-name', title: item.model }, item.model),
        h('span', `Token ${formatInteger(item.input_tokens + item.output_tokens)}`),
        h('span', `积分 ${formatNumber(item.credits_spent, 4)}`),
        h('span', `RMB ${formatNumber(item.real_rmb, 4)}`),
      ]))
      : h('span', { class: 'muted' }, '暂无模型用量')),
  },
  { title: '用户', key: 'username', minWidth: 140 },
  {
    title: 'Profile',
    key: 'profiles',
    minWidth: 160,
    render: row => row.role === 'super_admin'
      ? h(NTag, { size: 'small', type: 'warning', bordered: false }, { default: () => '全部' })
      : h(NSpace, { size: 4 }, {
        default: () => row.profiles.length
          ? row.profiles.map(profile => h(NTag, { size: 'small', bordered: false }, { default: () => profile }))
          : h('span', { class: 'muted' }, '未绑定'),
      }),
  },
  { title: '余额', key: 'credits_balance', width: 120, render: row => formatNumber(row.credits_balance, 2) },
  { title: 'Token', key: 'tokens', width: 140, render: row => formatInteger(row.input_tokens + row.output_tokens) },
  { title: '消耗积分', key: 'credits_spent', width: 130, render: row => formatNumber(row.credits_spent, 4) },
  { title: '真实 RMB', key: 'real_rmb', width: 130, render: row => formatNumber(row.real_rmb, 4) },
  { title: '会话', key: 'sessions', width: 90, render: row => formatInteger(row.sessions) },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    render: row => h(NButton, { size: 'small', onClick: () => openAdjustModal(row) }, { default: () => '调积分' }),
  },
])

const priceColumns: DataTableColumns<ModelPrice> = [
  {
    title: '模型',
    key: 'model',
    minWidth: 220,
    render: row => h('div', { class: 'price-model' }, [
      h('span', { class: 'model-name', title: row.model }, row.model),
      row.explicit ? null : h(NTag, { size: 'tiny', bordered: false }, { default: () => '默认价' }),
    ]),
  },
  {
    title: '输入积分 / 1K',
    key: 'input_credit_per_1k',
    width: 150,
    render: row => h(NInputNumber, {
      value: row.input_credit_per_1k,
      min: 0,
      precision: 6,
      size: 'small',
      style: { width: '100%' },
      onUpdateValue: value => { row.input_credit_per_1k = Number(value || 0) },
    }),
  },
  {
    title: '输出积分 / 1K',
    key: 'output_credit_per_1k',
    width: 150,
    render: row => h(NInputNumber, {
      value: row.output_credit_per_1k,
      min: 0,
      precision: 6,
      size: 'small',
      style: { width: '100%' },
      onUpdateValue: value => { row.output_credit_per_1k = Number(value || 0) },
    }),
  },
  {
    title: '输入 RMB / 1K',
    key: 'input_rmb_per_1k',
    width: 150,
    render: row => h(NInputNumber, {
      value: row.input_rmb_per_1k,
      min: 0,
      precision: 6,
      size: 'small',
      style: { width: '100%' },
      onUpdateValue: value => { row.input_rmb_per_1k = Number(value || 0) },
    }),
  },
  {
    title: '输出 RMB / 1K',
    key: 'output_rmb_per_1k',
    width: 150,
    render: row => h(NInputNumber, {
      value: row.output_rmb_per_1k,
      min: 0,
      precision: 6,
      size: 'small',
      style: { width: '100%' },
      onUpdateValue: value => { row.output_rmb_per_1k = Number(value || 0) },
    }),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: row => h(NButton, {
      size: 'small',
      type: 'primary',
      secondary: true,
      loading: savingPrice.value === row.model,
      onClick: () => handleSavePrice(row),
    }, { default: () => '保存' }),
  },
]

onMounted(() => {
  void loadBilling()
})
</script>

<template>
  <div class="billing-settings">
    <div class="toolbar">
      <div>
        <h3 class="section-title">计费与积分</h3>
        <p class="section-desc">按用户 profile 用量核算积分消耗和真实 RMB 成本。</p>
      </div>
      <div class="period-selector">
        <NButton
          v-for="option in periodOptions"
          :key="option.value"
          size="small"
          :type="selectedPeriod === option.value ? 'primary' : 'default'"
          :secondary="selectedPeriod === option.value"
          :quaternary="selectedPeriod !== option.value"
          @click="loadBilling(option.value)"
        >
          {{ option.label }}
        </NButton>
        <NButton size="small" quaternary :loading="loading" @click="loadBilling()">刷新</NButton>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <span class="summary-label">总 Token</span>
        <strong>{{ formatInteger(totals.input_tokens + totals.output_tokens) }}</strong>
      </div>
      <div class="summary-item">
        <span class="summary-label">消耗积分</span>
        <strong>{{ formatNumber(totals.credits_spent, 4) }}</strong>
      </div>
      <div class="summary-item">
        <span class="summary-label">真实 RMB</span>
        <strong>{{ formatNumber(totals.real_rmb, 4) }}</strong>
      </div>
      <div class="summary-item">
        <span class="summary-label">会话</span>
        <strong>{{ formatInteger(totals.sessions) }}</strong>
      </div>
    </div>

    <section class="section-block">
      <h4 class="sub-title">用户用量</h4>
      <NDataTable
        :columns="userColumns"
        :data="users"
        :loading="loading"
        :bordered="false"
        :single-line="false"
        size="small"
      />
    </section>

    <section class="section-block">
      <div class="price-heading">
        <h4 class="sub-title">模型价格</h4>
      </div>
      <div class="price-editor">
        <NSelect
          v-model:value="newPrice.model"
          class="price-model-input"
          filterable
          tag
          clearable
          :options="modelSelectOptions"
          placeholder="选择或输入模型 ID"
        />
        <NInputNumber v-model:value="newPrice.input_credit_per_1k" :min="0" :precision="6" placeholder="输入积分/1K" />
        <NInputNumber v-model:value="newPrice.output_credit_per_1k" :min="0" :precision="6" placeholder="输出积分/1K" />
        <NInputNumber v-model:value="newPrice.input_rmb_per_1k" :min="0" :precision="6" placeholder="输入 RMB/1K" />
        <NInputNumber v-model:value="newPrice.output_rmb_per_1k" :min="0" :precision="6" placeholder="输出 RMB/1K" />
        <NButton type="primary" :loading="savingNewPrice" @click="handleAddPrice">添加/保存</NButton>
      </div>
      <NDataTable
        :columns="priceColumns"
        :data="visiblePrices"
        :loading="loading"
        :bordered="false"
        :single-line="false"
        size="small"
      />
    </section>

    <NModal v-model:show="showAdjustModal" preset="dialog" title="调整用户积分">
      <NForm label-placement="top">
        <NFormItem label="用户">
          <NInput :value="adjustUser?.username || ''" readonly />
        </NFormItem>
        <NFormItem label="增加/减少积分">
          <NInputNumber
            v-model:value="adjustAmount"
            :precision="2"
            placeholder="正数为增加，负数为减少"
            style="width: 100%"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="adjustReason" placeholder="例如：充值、扣费修正、人工补偿" />
        </NFormItem>
      </NForm>
      <template #action>
        <NButton @click="showAdjustModal = false">取消</NButton>
        <NButton type="primary" :loading="adjusting" @click="submitAdjustCredits">确定</NButton>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.billing-settings {
  padding: 8px 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.section-title,
.sub-title {
  margin: 0;
  color: $text-primary;
  font-weight: 600;
}

.section-title {
  margin-bottom: 6px;
  font-size: 16px;
}

.section-desc,
.muted {
  color: $text-muted;
}

.section-desc {
  margin: 0;
  font-size: 13px;
}

.period-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.summary-item {
  padding: 12px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-card;
}

.summary-label {
  display: block;
  margin-bottom: 6px;
  color: $text-muted;
  font-size: 12px;
}

.summary-item strong {
  color: $text-primary;
  font-size: 18px;
}

.section-block {
  margin-top: 18px;
}

.sub-title {
  margin-bottom: 10px;
  font-size: 14px;
}

.price-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.price-editor {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(4, minmax(120px, 1fr)) auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.price-model-input {
  min-width: 0;
}

.model-usage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: $bg-secondary;
  border-radius: $radius-sm;
}

.model-usage-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) repeat(3, minmax(90px, auto));
  gap: 12px;
  align-items: center;
  color: $text-secondary;
  font-size: 12px;
}

.price-model {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .price-editor {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .toolbar {
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .price-editor {
    grid-template-columns: 1fr;
  }
}
</style>
