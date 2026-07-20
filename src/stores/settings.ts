import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Store } from '../store' // старый глобальный Store
import type { GaborPreset } from '../types/clinical'

export const useSettingsStore = defineStore('settings', () => {
  const presetMode = ref<GaborPreset>(Store.state.presetMode)

  // При изменении в Pinia — синхронизируем со старым Store
  watch(presetMode, (val) => {
    Store.updateState('presetMode', val)
    Store.saveSettings()
  })

  function setPreset(mode: GaborPreset) {
    presetMode.value = mode
  }

  return { presetMode, setPreset }
})