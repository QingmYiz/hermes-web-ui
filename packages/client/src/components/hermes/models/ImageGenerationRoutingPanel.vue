<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { NAlert, NButton, NSelect, NSpin, NSwitch, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import {
  fetchImageGenerationRouting,
  updateImageGenerationRouting,
  type AvailableModelGroup,
} from '@/api/hermes/system'
import { useAppStore } from '@/stores/hermes/app'
import { useModelsStore } from '@/stores/hermes/models'

const { t } = useI18n()
const message = useMessage()
const appStore = useAppStore()
const modelsStore = useModelsStore()

const loading = ref(false)
const saving = ref(false)
const groups = ref<AvailableModelGroup[]>([])
const hydrating = ref(false)

const form = reactive({
  enabled: false,
  provider: '',
  model: '',
})

const providerSignature = computed(() => modelsStore.providers
  .map(group => `${group.provider}:${(group.available_models || group.models).join(',')}`)
  .join('|'))

const providerOptions = computed(() => groups.value.map(group => ({
  label: group.label || group.provider,
  value: group.provider,
})))

const modelOptions = computed(() => {
  const group = groups.value.find(item => item.provider === form.provider)
  return (group?.models || []).map(model => ({
    label: appStore.displayModelName(model, group?.provider || form.provider),
    value: model,
  }))
})

function applyResponse(data: { config: { enabled: boolean; provider: string; model: string }; groups: AvailableModelGroup[] }) {
  groups.value = data.groups || []
  hydrating.value = true
  form.enabled = data.config.enabled === true
  form.provider = data.config.provider || ''
  form.model = data.config.model || ''

  if (form.provider) {
    const providerGroup = groups.value.find(group => group.provider === form.provider)
    if (providerGroup && !providerGroup.models.includes(form.model)) {
      form.model = providerGroup.models[0] || ''
    }
  }
  hydrating.value = false
}

async function loadRouting() {
  loading.value = true
  try {
    const data = await fetchImageGenerationRouting()
    applyResponse(data)
  } catch (err: any) {
    message.error(err?.message || t('models.imageRoutingLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveRouting() {
  if (form.enabled && !form.provider) {
    message.error(t('models.imageRoutingProviderRequired'))
    return
  }
  if (form.enabled && !form.model) {
    message.error(t('models.imageRoutingModelRequired'))
    return
  }

  saving.value = true
  try {
    const data = await updateImageGenerationRouting({
      enabled: form.enabled,
      provider: form.provider,
      model: form.model,
    })
    applyResponse(data)
    message.success(t('models.imageRoutingSaved'))
  } catch (err: any) {
    message.error(err?.message || t('models.imageRoutingSaveFailed'))
  } finally {
    saving.value = false
  }
}

watch(() => form.provider, (provider) => {
  if (hydrating.value) return
  const providerGroup = groups.value.find(group => group.provider === provider)
  if (!providerGroup) {
    form.model = ''
    return
  }
  if (!providerGroup.models.includes(form.model)) {
    form.model = providerGroup.models[0] || ''
  }
})

watch(providerSignature, (signature, previous) => {
  if (!signature || signature === previous) return
  void loadRouting()
})

onMounted(() => {
  void loadRouting()
})
</script>

<template>
  <section class="image-routing-panel">
    <div class="panel-header">
      <div>
        <h3>{{ t('models.imageRoutingTitle') }}</h3>
        <p>{{ t('models.imageRoutingSubtitle') }}</p>
      </div>
      <NButton size="small" quaternary :loading="loading" @click="loadRouting">
        {{ t('models.imageRoutingRefresh') }}
      </NButton>
    </div>

    <NAlert type="info" :bordered="false" class="panel-alert">
      {{ t('models.imageRoutingHint') }}
    </NAlert>

    <NSpin :show="loading">
      <div class="panel-grid">
        <label class="field-row">
          <span>{{ t('models.imageRoutingEnabled') }}</span>
          <NSwitch v-model:value="form.enabled" />
        </label>

        <label class="field-block">
          <span>{{ t('models.imageRoutingProvider') }}</span>
          <NSelect
            v-model:value="form.provider"
            :options="providerOptions"
            :disabled="!form.enabled"
            :placeholder="t('models.chooseProvider')"
            filterable
          />
        </label>

        <label class="field-block">
          <span>{{ t('models.imageRoutingModel') }}</span>
          <NSelect
            v-model:value="form.model"
            :options="modelOptions"
            :disabled="!form.enabled || !form.provider"
            :placeholder="t('models.selectModel')"
            filterable
          />
        </label>
      </div>

      <div v-if="form.enabled && !providerOptions.length" class="empty-hint">
        {{ t('models.imageRoutingEmpty') }}
      </div>
    </NSpin>

    <div class="panel-actions">
      <NButton :disabled="saving" @click="loadRouting">{{ t('common.cancel') }}</NButton>
      <NButton type="primary" :loading="saving" @click="saveRouting">{{ t('common.save') }}</NButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.image-routing-panel {
  background-color: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  margin-bottom: 16px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid $border-light;

  h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: $text-muted;
  }
}

.panel-alert {
  margin: 12px 16px 0;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(180px, 220px) repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}

.field-row,
.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  > span {
    color: $text-secondary;
    font-size: 12px;
    font-weight: 500;
  }
}

.field-row {
  justify-content: center;
}

.empty-hint {
  padding: 0 16px 16px;
  color: $text-muted;
  font-size: 12px;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}

@media (max-width: 860px) {
  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
