import { defineStore } from 'pinia'
import { computed, readonly, ref } from 'vue'
import { useSettingsStore } from './settings'
import { createGaborAdapter } from '../adapters/GaborModeAdapter'
import type { IModeController } from '../types/hud'

export const useHudStore = defineStore('hud', () => {
  const settings = useSettingsStore()

  // Фабрика адаптеров
  const activeAdapter = computed<IModeController | null>(() => {
    switch (settings.appMode) {
      case 'gabor':
        return createGaborAdapter()
      // Synoptophore и RDS пока не реализованы
      default:
        return null
    }
  })

  // Проксируем свойства адаптера
  const primaryLabel = computed(() => activeAdapter.value?.primaryLabel ?? 'Start')
  const isPrimaryDisabled = computed(() => activeAdapter.value?.isPrimaryDisabled ?? true)
  function onPrimaryClick() { activeAdapter.value?.onPrimaryClick() }

  const showDirectionButtons = computed(() => activeAdapter.value?.showDirectionButtons ?? false)
  const leftLabel = computed(() => activeAdapter.value?.leftLabel ?? 'Left')
  const isLeftDisabled = computed(() => activeAdapter.value?.isLeftDisabled ?? true)
  function onLeftClick() { activeAdapter.value?.onLeftClick() }

  const rightLabel = computed(() => activeAdapter.value?.rightLabel ?? 'Right')
  const isRightDisabled = computed(() => activeAdapter.value?.isRightDisabled ?? true)
  function onRightClick() { activeAdapter.value?.onRightClick() }

  const showResetButton = computed(() => activeAdapter.value?.showResetButton ?? false)
  const resetLabel = computed(() => activeAdapter.value?.resetLabel ?? 'Reset')
  const isResetDisabled = computed(() => activeAdapter.value?.isResetDisabled ?? true)
  function onResetClick() { activeAdapter.value?.onResetClick() }

  const isPauseDisabled = computed(() => activeAdapter.value?.isPauseDisabled ?? true)

  return {
    primaryLabel: readonly(primaryLabel),
    isPrimaryDisabled: readonly(isPrimaryDisabled),
    onPrimaryClick,
    showDirectionButtons: readonly(showDirectionButtons),
    leftLabel: readonly(leftLabel),
    isLeftDisabled: readonly(isLeftDisabled),
    onLeftClick,
    rightLabel: readonly(rightLabel),
    isRightDisabled: readonly(isRightDisabled),
    onRightClick,
    showResetButton: readonly(showResetButton),
    resetLabel: readonly(resetLabel),
    isResetDisabled: readonly(isResetDisabled),
    onResetClick,
    isPauseDisabled: readonly(isPauseDisabled),
  }
})