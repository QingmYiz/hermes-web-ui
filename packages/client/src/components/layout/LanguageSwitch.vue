<script setup lang="ts">
import { NSelect } from 'naive-ui'

const locale = 'zh'

const options = [
  { label: '简体中文', value: 'zh' },
]
</script>

<template>
  <NSelect
    :value="locale"
    :options="options"
    size="tiny"
    disabled
    :consistent-menu-width="false"
    class="input-sm"
  />
</template>
