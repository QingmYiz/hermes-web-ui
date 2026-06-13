<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import {
  createManagedUser,
  deleteManagedUser,
  fetchManagedUsers,
  updateManagedUser,
  type ManagedUser,
  type UserRole,
  type UserStatus,
} from '@/api/auth'
import {
  addCustomModel,
  configureProfileModels,
  fetchAvailableModels,
  fetchAvailableModelsForProfile,
  updateDefaultModel,
  type AvailableModelGroup,
} from '@/api/hermes/system'

const DEFAULT_PROVIDER = 'xiaomi'
const DEFAULT_MODEL = 'mimo-v2.5'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const users = ref<ManagedUser[]>([])
const profiles = ref<string[]>([])
const showModal = ref(false)
const editingUser = ref<ManagedUser | null>(null)
const showModelModal = ref(false)
const modelUser = ref<ManagedUser | null>(null)
const modelGroups = ref<AvailableModelGroup[]>([])
const modelLoading = ref(false)
const modelSaving = ref(false)

const form = reactive({
  username: '',
  password: '',
  role: 'admin' as UserRole,
  status: 'active' as UserStatus,
  profiles: [] as string[],
  defaultProfile: '',
})

const modelForm = reactive({
  profile: '',
  provider: '',
  model: '',
  models: [] as string[],
  customModel: '',
})

const roleOptions = computed(() => [
  { label: t('users.roles.admin'), value: 'admin' },
  { label: t('users.roles.superAdmin'), value: 'super_admin' },
])

const statusOptions = computed(() => [
  { label: t('users.status.active'), value: 'active' },
  { label: t('users.status.disabled'), value: 'disabled' },
])

const profileOptions = computed(() => {
  const all = Array.from(new Set([...profiles.value, ...form.profiles].filter(Boolean)))
  return all.map(profile => ({ label: profile, value: profile }))
})

const editableProfileOptions = computed(() => form.profiles.map(profile => ({ label: profile, value: profile })))
const modelProfileOptions = computed(() => (modelUser.value?.profiles || []).map(profile => ({ label: profile, value: profile })))
const modelProviderOptions = computed(() => modelGroups.value.map(group => ({ label: group.label || group.provider, value: group.provider })))
const modelOptions = computed(() => {
  const group = modelGroups.value.find(item => item.provider === modelForm.provider)
  return (group?.models || []).map(model => ({ label: model, value: model }))
})
const defaultModelOptions = computed(() => modelForm.models.map(model => ({ label: model, value: model })))

function resetForm() {
  editingUser.value = null
  form.username = ''
  form.password = ''
  form.role = 'admin'
  form.status = 'active'
  form.profiles = []
  form.defaultProfile = ''
}

function uniqueGroups(groups: AvailableModelGroup[]): AvailableModelGroup[] {
  const merged = new Map<string, AvailableModelGroup>()
  for (const group of groups) {
    if (!group.provider) continue
    const existing = merged.get(group.provider)
    const models = Array.from(new Set([
      ...(existing?.models || []),
      ...(group.models || []),
      ...(group.available_models || []),
    ].filter(Boolean)))
    merged.set(group.provider, {
      ...group,
      label: group.label || existing?.label || group.provider,
      models,
      available_models: models,
    })
  }
  return [...merged.values()].sort((a, b) => (a.label || a.provider).localeCompare(b.label || b.provider))
}

function pickInitialProvider(groups: AvailableModelGroup[], defaultProvider?: string): string {
  if (defaultProvider && groups.some(group => group.provider === defaultProvider)) return defaultProvider
  if (groups.some(group => group.provider === DEFAULT_PROVIDER)) return DEFAULT_PROVIDER
  return groups[0]?.provider || ''
}

function pickInitialModels(groups: AvailableModelGroup[], provider: string, defaultModel?: string): string[] {
  const group = groups.find(item => item.provider === provider)
  if (!group) return []
  if (defaultModel && group.models.includes(defaultModel)) return [defaultModel]
  if (group.models.includes(DEFAULT_MODEL)) return [DEFAULT_MODEL]
  return group.models[0] ? [group.models[0]] : []
}

function pickDefaultModel(models: string[], currentDefault?: string): string {
  if (currentDefault && models.includes(currentDefault)) return currentDefault
  if (models.includes(DEFAULT_MODEL)) return DEFAULT_MODEL
  return models[0] || ''
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await fetchManagedUsers()
    users.value = res.users
    profiles.value = res.profiles
  } catch (err: any) {
    message.error(err.message || t('users.loadFailed'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  resetForm()
  showModal.value = true
}

function openEdit(user: ManagedUser) {
  editingUser.value = user
  form.username = user.username
  form.password = ''
  form.role = user.role
  form.status = user.status
  form.profiles = [...user.profiles]
  form.defaultProfile = user.default_profile || user.profiles[0] || ''
  showModal.value = true
}

function handleProfilesUpdate(value: string[]) {
  form.profiles = Array.from(new Set(value.map(item => item.trim()).filter(Boolean)))
  if (!form.profiles.includes(form.defaultProfile)) {
    form.defaultProfile = form.profiles[0] || ''
  }
}

async function submit() {
  if (form.username.trim().length < 2) {
    message.error(t('login.usernameTooShort'))
    return
  }
  if (!editingUser.value && form.password.length < 6) {
    message.error(t('login.passwordTooShort'))
    return
  }
  if (form.password && form.password.length < 6) {
    message.error(t('login.passwordTooShort'))
    return
  }

  saving.value = true
  try {
    const defaultProfile = form.profiles.includes(form.defaultProfile)
      ? form.defaultProfile
      : form.profiles[0] || null
    const payload = {
      username: form.username.trim(),
      password: form.password || undefined,
      role: form.role,
      status: form.status,
      profiles: form.role === 'super_admin' ? [] : form.profiles,
      defaultProfile,
    }
    const res = editingUser.value
      ? await updateManagedUser(editingUser.value.id, payload)
      : await createManagedUser({ ...payload, password: form.password })
    users.value = res.users
    profiles.value = res.profiles
    showModal.value = false
    resetForm()
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(err.message || t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function loadProfileModels() {
  if (!modelForm.profile) {
    modelGroups.value = []
    modelForm.provider = ''
    modelForm.model = ''
    modelForm.models = []
    return
  }
  modelLoading.value = true
  try {
    const [targetRes, configuredRes] = await Promise.all([
      fetchAvailableModelsForProfile(modelForm.profile),
      fetchAvailableModels(),
    ])
    const groups = uniqueGroups(configuredRes.groups || [])
    modelGroups.value = groups
    modelForm.provider = pickInitialProvider(groups, targetRes.default_provider)
    modelForm.models = pickInitialModels(groups, modelForm.provider, targetRes.default)
    modelForm.model = pickDefaultModel(modelForm.models, targetRes.default)
  } catch (err: any) {
    message.error(err.message || '模型列表加载失败')
  } finally {
    modelLoading.value = false
  }
}

function openModelConfig(user: ManagedUser) {
  modelUser.value = user
  modelForm.profile = user.default_profile || user.profiles[0] || ''
  modelForm.provider = ''
  modelForm.model = ''
  modelForm.models = []
  modelForm.customModel = ''
  modelGroups.value = []
  showModelModal.value = true
  void loadProfileModels()
}

async function handleModelProfileUpdate(profile: string) {
  modelForm.profile = profile
  modelForm.customModel = ''
  await loadProfileModels()
}

function handleModelProviderUpdate(provider: string) {
  modelForm.provider = provider
  modelForm.models = pickInitialModels(modelGroups.value, provider, '')
  modelForm.model = pickDefaultModel(modelForm.models)
}

function handleModelSelectionUpdate(models: string[]) {
  modelForm.models = Array.from(new Set(models.map(model => model.trim()).filter(Boolean)))
  modelForm.model = pickDefaultModel(modelForm.models, modelForm.model)
}

async function saveModelConfig() {
  const customModel = modelForm.customModel.trim()
  const selectedModels = Array.from(new Set([...modelForm.models, customModel].map(model => model.trim()).filter(Boolean)))
  const targetModel = pickDefaultModel(selectedModels, customModel || modelForm.model)
  if (!modelForm.profile || !modelForm.provider || selectedModels.length === 0 || !targetModel) {
    message.error('请选择 profile、模型供应商和模型')
    return
  }
  modelSaving.value = true
  try {
    if (customModel) {
      await addCustomModel({ provider: modelForm.provider, model: customModel })
      modelForm.model = customModel
    }
    const group = modelGroups.value.find(item => item.provider === modelForm.provider)
    await configureProfileModels({
      profile: modelForm.profile,
      sourceProfile: localStorage.getItem('hermes_active_profile_name') || undefined,
      provider: modelForm.provider,
      label: group?.label,
      base_url: group?.base_url,
      api_key: group?.api_key,
      models: selectedModels,
      default: targetModel,
    })
    await updateDefaultModel({
      default: targetModel,
      provider: modelForm.provider,
      profile: modelForm.profile,
    })
    message.success(t('common.saved'))
    showModelModal.value = false
  } catch (err: any) {
    message.error(err.message || t('common.saveFailed'))
  } finally {
    modelSaving.value = false
  }
}

async function setStatus(user: ManagedUser, status: UserStatus) {
  saving.value = true
  try {
    const res = await updateManagedUser(user.id, { status })
    users.value = res.users
    profiles.value = res.profiles
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(err.message || t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeUser(user: ManagedUser) {
  saving.value = true
  try {
    const res = await deleteManagedUser(user.id)
    users.value = res.users
    profiles.value = res.profiles
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(err.message || t('common.deleteFailed'))
  } finally {
    saving.value = false
  }
}

function formatTime(value: number | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const columns = computed<DataTableColumns<ManagedUser>>(() => [
  { title: t('users.username'), key: 'username', minWidth: 140 },
  {
    title: t('users.role'),
    key: 'role',
    width: 130,
    render: row => h(NTag, { size: 'small', type: row.role === 'super_admin' ? 'warning' : 'default' }, {
      default: () => row.role === 'super_admin' ? t('users.roles.superAdmin') : t('users.roles.admin'),
    }),
  },
  {
    title: t('users.statusLabel'),
    key: 'status',
    width: 110,
    render: row => h(NTag, { size: 'small', type: row.status === 'active' ? 'success' : 'error' }, {
      default: () => row.status === 'active' ? t('users.status.active') : t('users.status.disabled'),
    }),
  },
  {
    title: t('users.profiles'),
    key: 'profiles',
    minWidth: 200,
    render: row => row.role === 'super_admin'
      ? h('span', { class: 'muted' }, t('users.allProfiles'))
      : h(NSpace, { size: 4 }, {
        default: () => row.profiles.length
          ? row.profiles.map(profile => h(NTag, { size: 'small', bordered: false }, { default: () => profile }))
          : h('span', { class: 'muted' }, t('users.noProfiles')),
      }),
  },
  { title: t('users.lastLogin'), key: 'last_login_at', minWidth: 170, render: row => formatTime(row.last_login_at) },
  {
    title: t('common.edit'),
    key: 'actions',
    width: 280,
    render: row => h(NSpace, { size: 8 }, {
      default: () => [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => t('common.edit') }),
        h(NButton, {
          size: 'small',
          ghost: true,
          disabled: row.profiles.length === 0,
          onClick: () => openModelConfig(row),
        }, { default: () => '配置模型' }),
        h(NButton, {
          size: 'small',
          type: row.status === 'active' ? 'warning' : 'primary',
          ghost: true,
          loading: saving.value,
          onClick: () => setStatus(row, row.status === 'active' ? 'disabled' : 'active'),
        }, { default: () => row.status === 'active' ? t('users.disable') : t('users.enable') }),
        h(NPopconfirm, { onPositiveClick: () => removeUser(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true, loading: saving.value }, { default: () => t('common.delete') }),
          default: () => t('users.deleteConfirm'),
        }),
      ],
    }),
  },
])

onMounted(loadUsers)
</script>

<template>
  <div class="user-management">
    <div class="toolbar">
      <div>
        <h3 class="section-title">{{ t('users.title') }}</h3>
        <p class="section-desc">{{ t('users.description') }}</p>
      </div>
      <NButton type="primary" @click="openCreate">{{ t('users.create') }}</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="users"
      :loading="loading"
      :bordered="false"
      :single-line="false"
      size="small"
    />

    <NModal v-model:show="showModal" preset="dialog" :title="editingUser ? t('users.edit') : t('users.create')">
      <NForm label-placement="top">
        <NFormItem :label="t('users.username')">
          <NInput v-model:value="form.username" :placeholder="t('login.usernamePlaceholder')" />
        </NFormItem>
        <NFormItem :label="editingUser ? t('users.newPasswordOptional') : t('login.newPassword')">
          <NInput v-model:value="form.password" type="password" show-password-on="click" :placeholder="t('login.passwordPlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('users.role')">
          <NSelect v-model:value="form.role" :options="roleOptions" />
        </NFormItem>
        <NFormItem :label="t('users.statusLabel')">
          <NSelect v-model:value="form.status" :options="statusOptions" />
        </NFormItem>
        <NFormItem v-if="form.role !== 'super_admin'" :label="t('users.profiles')">
          <NSelect
            v-model:value="form.profiles"
            multiple
            filterable
            tag
            :options="profileOptions"
            :placeholder="t('users.profilesPlaceholder')"
            @update:value="handleProfilesUpdate"
          />
        </NFormItem>
        <NFormItem v-if="form.role !== 'super_admin' && form.profiles.length > 0" label="默认配置">
          <NSelect
            v-model:value="form.defaultProfile"
            :options="editableProfileOptions"
            placeholder="选择登录后默认使用的 profile"
          />
        </NFormItem>
      </NForm>
      <template #action>
        <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</NButton>
      </template>
    </NModal>

    <NModal v-model:show="showModelModal" preset="dialog" title="配置用户默认模型">
      <NForm label-placement="top">
        <NFormItem label="目标用户">
          <NInput :value="modelUser?.username || ''" readonly />
        </NFormItem>
        <NFormItem label="目标 profile">
          <NSelect
            :value="modelForm.profile"
            :options="modelProfileOptions"
            :loading="modelLoading"
            @update:value="handleModelProfileUpdate"
          />
        </NFormItem>
        <NFormItem label="供应商">
          <NSelect
            v-model:value="modelForm.provider"
            filterable
            :options="modelProviderOptions"
            :loading="modelLoading"
            @update:value="handleModelProviderUpdate"
          />
        </NFormItem>
        <NFormItem label="默认模型">
          <NSelect
            v-model:value="modelForm.model"
            filterable
            :options="defaultModelOptions"
            :loading="modelLoading"
            :disabled="modelForm.models.length === 0"
            placeholder="选择模型"
          />
        </NFormItem>
        <NFormItem label="可用模型">
          <NSelect
            v-model:value="modelForm.models"
            multiple
            filterable
            :options="modelOptions"
            :loading="modelLoading"
            placeholder="选择这个用户可用的模型"
            @update:value="handleModelSelectionUpdate"
          />
        </NFormItem>
        <NFormItem label="手动添加模型">
          <NInput
            v-model:value="modelForm.customModel"
            placeholder="输入模型 ID，保存后加入可选模型并设为默认"
          />
        </NFormItem>
      </NForm>
      <template #action>
        <NButton @click="showModelModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="modelSaving" @click="saveModelConfig">{{ t('common.save') }}</NButton>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.user-management {
  padding: 8px 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.section-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.section-desc {
  margin: 0;
  font-size: 13px;
  color: $text-muted;
}

:deep(.muted) {
  color: $text-muted;
}
</style>
