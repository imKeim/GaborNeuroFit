import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Store } from '../store' // старый глобальный Store
import type { GaborPreset, FlashDurationMode } from '../types/clinical'

export const useSettingsStore = defineStore('settings', () => {
  const presetMode = ref<GaborPreset>(Store.state.presetMode)

  // ========== Новые поля ==========
  const sessionLimit = ref<number>(Store.state.sessionLimit)
  const autoAdvance = ref<boolean>(Store.state.autoAdvance)
  const allowStageAdvance = ref<boolean>(Store.state.allowStageAdvance)
  const flashDurationMode = ref<FlashDurationMode>(Store.state.flashDurationMode)
  const timerLimitMinutes = ref<number>(Store.state.timerLimitMinutes)
  const isMonoAudioEnabled = ref<boolean>(Store.state.isMonoAudioEnabled)

  // Синхронизация со старым Store
  watch(presetMode, (val) => {
    Store.updateState('presetMode', val)
    Store.saveSettings()
  })
  watch(sessionLimit, (val) => {
    Store.updateState('sessionLimit', val)
    Store.saveSettings()
  })
  watch(autoAdvance, (val) => {
    Store.updateState('autoAdvance', val)
    Store.saveSettings()
  })
  watch(allowStageAdvance, (val) => {
    Store.updateState('allowStageAdvance', val)
    Store.saveSettings()
  })
  watch(flashDurationMode, (val) => {
    Store.updateState('flashDurationMode', val)
    Store.saveSettings()
  })
  watch(timerLimitMinutes, (val) => {
    Store.updateState('timerLimitMinutes', val)
    Store.saveSettings()
  })
  watch(isMonoAudioEnabled, (val) => {
    Store.updateState('isMonoAudioEnabled', val)
    Store.saveSettings()
  })

  // Методы установки
  function setPreset(mode: GaborPreset) { presetMode.value = mode }
  function setSessionLimit(val: number) { sessionLimit.value = val }
  function setAutoAdvance(val: boolean) { autoAdvance.value = val }
  function setStageAdvance(val: boolean) { allowStageAdvance.value = val }
  function setFlashDuration(mode: FlashDurationMode) { flashDurationMode.value = mode }
  function setTimerLimit(minutes: number) { timerLimitMinutes.value = minutes }
  function setMonoAudio(val: boolean) { isMonoAudioEnabled.value = val }

  return {
    presetMode, setPreset,
    sessionLimit, setSessionLimit,
    autoAdvance, setAutoAdvance,
    allowStageAdvance, setStageAdvance,
    flashDurationMode, setFlashDuration,
    timerLimitMinutes, setTimerLimit,
    isMonoAudioEnabled, setMonoAudio,
  }
})