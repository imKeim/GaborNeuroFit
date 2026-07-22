import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useSettingsStore } from './settings'
import { createGaborAdapter } from '../adapters/GaborModeAdapter'
import { createSynopAdapter } from '../adapters/SynopModeAdapter'
import { createRdsAdapter } from '../adapters/RdsModeAdapter'
import type { IModeController } from '../types/hud'

export const useHudStore = defineStore('hud', () => {
  const settings = useSettingsStore()

  // Фабрика адаптеров
  const activeAdapter = computed<IModeController | null>(() => {
    switch (settings.appMode) {
      case 'gabor':
        return createGaborAdapter()
      case 'synoptophore':
        return createSynopAdapter()
      case 'rds':
        return createRdsAdapter()
      default:
        return null
    }
  })

  // Проксируем свойства адаптера
  const primaryLabel = computed(() => activeAdapter.value?.primaryLabel.value ?? 'Start')
  const isPrimaryDisabled = computed(() => activeAdapter.value?.isPrimaryDisabled.value ?? true)
  function onPrimaryClick() { activeAdapter.value?.onPrimaryClick() }

  const showDirectionButtons = computed(() => activeAdapter.value?.showDirectionButtons.value ?? false)
  const leftLabel = computed(() => activeAdapter.value?.leftLabel.value ?? 'Left')
  const isLeftDisabled = computed(() => activeAdapter.value?.isLeftDisabled.value ?? true)
  function onLeftClick() { activeAdapter.value?.onLeftClick() }

  const rightLabel = computed(() => activeAdapter.value?.rightLabel.value ?? 'Right')
  const isRightDisabled = computed(() => activeAdapter.value?.isRightDisabled.value ?? true)
  function onRightClick() { activeAdapter.value?.onRightClick() }

  const showResetButton = computed(() => activeAdapter.value?.showResetButton.value ?? false)
  const resetLabel = computed(() => activeAdapter.value?.resetLabel.value ?? 'Reset')
  const isResetDisabled = computed(() => activeAdapter.value?.isResetDisabled.value ?? true)
  function onResetClick() { activeAdapter.value?.onResetClick() }

  const isPauseDisabled = computed(() => activeAdapter.value?.isPauseDisabled.value ?? true)

  return {
    primaryLabel,
    isPrimaryDisabled,
    onPrimaryClick,
    showDirectionButtons,
    leftLabel,
    isLeftDisabled,
    onLeftClick,
    rightLabel,
    isRightDisabled,
    onRightClick,
    showResetButton,
    resetLabel,
    isResetDisabled,
    onResetClick,
    isPauseDisabled,
  }
})