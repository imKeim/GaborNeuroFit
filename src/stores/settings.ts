import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Store } from '../store' // старый глобальный Store
import type { GaborPreset, FlashDurationMode, CrowdingMode, SynopTargetType } from '../types/clinical'

export const useSettingsStore = defineStore('settings', () => {
  const presetMode = ref<GaborPreset>(Store.state.presetMode)

  // ========== Новые поля ==========
  const sessionLimit = ref<number>(Store.state.sessionLimit)
  const autoAdvance = ref<boolean>(Store.state.autoAdvance)
  const allowStageAdvance = ref<boolean>(Store.state.allowStageAdvance)
  const flashDurationMode = ref<FlashDurationMode>(Store.state.flashDurationMode)
  const timerLimitMinutes = ref<number>(Store.state.timerLimitMinutes)
  const isMonoAudioEnabled = ref<boolean>(Store.state.isMonoAudioEnabled)

  // Gabor & Complexity
  const isPermanentCrossEnabled = ref<boolean>(Store.state.isPermanentCrossEnabled)
  const allowLowContrast = ref<boolean>(Store.state.allowLowContrast)
  const allowDynamicLevelDrift = ref<boolean>(Store.state.allowDynamicLevelDrift)
  const allowDensityVariance = ref<boolean>(Store.state.allowDensityVariance)
  const allowShapeVariance = ref<boolean>(Store.state.allowShapeVariance)
  const isPeripheralEnabled = ref<boolean>(Store.state.isPeripheralEnabled)
  const isCrowdingEnabled = ref<boolean>(Store.state.isCrowdingEnabled)
  const crowdingMode = ref<CrowdingMode>(Store.state.crowdingMode)
  const flankerDistanceCoeff = ref<number>(Store.state.flankerDistanceCoeff)
  const isOrthogonalFlankersEnabled = ref<boolean>(Store.state.isOrthogonalFlankersEnabled)
  const isDynamicFlankersEnabled = ref<boolean>(Store.state.isDynamicFlankersEnabled)

  // App mode & Anaglyph
  const appMode = ref<'gabor' | 'synoptophore' | 'rds'>(Store.state.appMode)
  const isAnaglyphEnabled = ref<boolean>(Store.state.isAnaglyphEnabled)
  const strongEyeContrastPercent = ref<number>(Math.round(Store.state.strongEyeContrastFactor * 100))

  // Synoptophore
  const synopPullSpeed = ref<number>(Store.state.synopPullSpeed)
  const synopTargetType = ref<SynopTargetType>(Store.state.synopTargetType)
  const synopShowLazyGrid = ref<boolean>(Store.state.synopShowLazyGrid)
  const synopShowStrongGrid = ref<boolean>(Store.state.synopShowStrongGrid)
  const synopTargetSize = ref<number>(Store.state.synopTargetSize)
  const synopFlickerActive = ref<boolean>(Store.state.synopFlickerActive)
  const synopLockVertical = ref<boolean>(Store.state.synopLockVertical)
  const synopLockHorizontal = ref<boolean>(Store.state.synopLockHorizontal)

  // Синхронизация со старым Store
  watch(presetMode, (val) => { Store.updateState('presetMode', val); Store.saveSettings() })
  watch(sessionLimit, (val) => { Store.updateState('sessionLimit', val); Store.saveSettings() })
  watch(autoAdvance, (val) => { Store.updateState('autoAdvance', val); Store.saveSettings() })
  watch(allowStageAdvance, (val) => { Store.updateState('allowStageAdvance', val); Store.saveSettings() })
  watch(flashDurationMode, (val) => { Store.updateState('flashDurationMode', val); Store.saveSettings() })
  watch(timerLimitMinutes, (val) => { Store.updateState('timerLimitMinutes', val); Store.saveSettings() })
  watch(isMonoAudioEnabled, (val) => { Store.updateState('isMonoAudioEnabled', val); Store.saveSettings() })

  watch(isPermanentCrossEnabled, (val) => { Store.updateState('isPermanentCrossEnabled', val); Store.saveSettings() })
  watch(allowLowContrast, (val) => { Store.updateState('allowLowContrast', val); Store.saveSettings() })
  watch(allowDynamicLevelDrift, (val) => { Store.updateState('allowDynamicLevelDrift', val); Store.saveSettings() })
  watch(allowDensityVariance, (val) => { Store.updateState('allowDensityVariance', val); Store.saveSettings() })
  watch(allowShapeVariance, (val) => { Store.updateState('allowShapeVariance', val); Store.saveSettings() })

  // Peripheral / Crowding взаимная блокировка и сброс подопций
  watch(isPeripheralEnabled, (val) => {
    if (val && isCrowdingEnabled.value) isCrowdingEnabled.value = false
    Store.updateState('isPeripheralEnabled', val); Store.saveSettings()
  })
  watch(isCrowdingEnabled, (val) => {
    if (val && isPeripheralEnabled.value) isPeripheralEnabled.value = false
    if (!val) {
      isOrthogonalFlankersEnabled.value = false
      isDynamicFlankersEnabled.value = false
    }
    Store.updateState('isCrowdingEnabled', val); Store.saveSettings()
  })
  watch(crowdingMode, (val) => { Store.updateState('crowdingMode', val); Store.saveSettings() })
  watch(flankerDistanceCoeff, (val) => { Store.updateState('flankerDistanceCoeff', val); Store.saveSettings() })
  watch(isOrthogonalFlankersEnabled, (val) => { Store.updateState('isOrthogonalFlankersEnabled', val); Store.saveSettings() })
  watch(isDynamicFlankersEnabled, (val) => { Store.updateState('isDynamicFlankersEnabled', val); Store.saveSettings() })

  watch(appMode, (val) => { Store.updateState('appMode', val); Store.saveSettings() })
  watch(isAnaglyphEnabled, (val) => { Store.updateState('isAnaglyphEnabled', val); Store.saveSettings() })
  watch(strongEyeContrastPercent, (val) => {
    Store.updateState('strongEyeContrastFactor', val / 100)
    Store.saveSettings()
  })

  watch(synopPullSpeed, (val) => { Store.updateState('synopPullSpeed', val); Store.saveSettings() })
  watch(synopTargetType, (val) => { Store.updateState('synopTargetType', val); Store.saveSettings() })
  watch(synopShowLazyGrid, (val) => { Store.updateState('synopShowLazyGrid', val); Store.saveSettings() })
  watch(synopShowStrongGrid, (val) => { Store.updateState('synopShowStrongGrid', val); Store.saveSettings() })
  watch(synopTargetSize, (val) => { Store.updateState('synopTargetSize', val); Store.saveSettings() })
  watch(synopFlickerActive, (val) => { Store.updateState('synopFlickerActive', val); Store.saveSettings() })

  // Взаимная блокировка lock‑осей
  watch(synopLockVertical, (val) => {
    if (val && synopLockHorizontal.value) synopLockHorizontal.value = false
    Store.updateState('synopLockVertical', val); Store.saveSettings()
  })
  watch(synopLockHorizontal, (val) => {
    if (val && synopLockVertical.value) synopLockVertical.value = false
    Store.updateState('synopLockHorizontal', val); Store.saveSettings()
  })

  // Методы установки
  function setPreset(mode: GaborPreset) { presetMode.value = mode }
  function setSessionLimit(val: number) { sessionLimit.value = val }
  function setAutoAdvance(val: boolean) { autoAdvance.value = val }
  function setStageAdvance(val: boolean) { allowStageAdvance.value = val }
  function setFlashDuration(mode: FlashDurationMode) { flashDurationMode.value = mode }
  function setTimerLimit(minutes: number) { timerLimitMinutes.value = minutes }
  function setMonoAudio(val: boolean) { isMonoAudioEnabled.value = val }
  function setPermanentCross(val: boolean) { isPermanentCrossEnabled.value = val }
  function setLowContrast(val: boolean) { allowLowContrast.value = val }
  function setDynamicLevelDrift(val: boolean) { allowDynamicLevelDrift.value = val }
  function setDensityVariance(val: boolean) { allowDensityVariance.value = val }
  function setShapeVariance(val: boolean) { allowShapeVariance.value = val }
  function setPeripheral(val: boolean) { isPeripheralEnabled.value = val }
  function setCrowding(val: boolean) { isCrowdingEnabled.value = val }
  function setCrowdingMode(mode: CrowdingMode) { crowdingMode.value = mode }
  function setFlankerDistance(coeff: number) { flankerDistanceCoeff.value = coeff }
  function setOrthogonalFlankers(val: boolean) { isOrthogonalFlankersEnabled.value = val }
  function setDynamicFlankers(val: boolean) { isDynamicFlankersEnabled.value = val }
  function setAppMode(mode: 'gabor' | 'synoptophore' | 'rds') { appMode.value = mode }
  function setAnaglyph(val: boolean) { isAnaglyphEnabled.value = val }
  function setStrongContrastPercent(percent: number) { strongEyeContrastPercent.value = percent }
  function setSynopPullSpeed(ms: number) { synopPullSpeed.value = ms }
  function setSynopTargetType(type: SynopTargetType) { synopTargetType.value = type }
  function setSynopLazyGrid(val: boolean) { synopShowLazyGrid.value = val }
  function setSynopStrongGrid(val: boolean) { synopShowStrongGrid.value = val }
  function setSynopTargetSize(px: number) { synopTargetSize.value = px }
  function setSynopFlicker(val: boolean) { synopFlickerActive.value = val }
  function setSynopLockVertical(val: boolean) { synopLockVertical.value = val }
  function setSynopLockHorizontal(val: boolean) { synopLockHorizontal.value = val }

  return {
    presetMode, setPreset,
    sessionLimit, setSessionLimit,
    autoAdvance, setAutoAdvance,
    allowStageAdvance, setStageAdvance,
    flashDurationMode, setFlashDuration,
    timerLimitMinutes, setTimerLimit,
    isMonoAudioEnabled, setMonoAudio,
    isPermanentCrossEnabled, setPermanentCross,
    allowLowContrast, setLowContrast,
    allowDynamicLevelDrift, setDynamicLevelDrift,
    allowDensityVariance, setDensityVariance,
    allowShapeVariance, setShapeVariance,
    isPeripheralEnabled, setPeripheral,
    isCrowdingEnabled, setCrowding,
    crowdingMode, setCrowdingMode,
    flankerDistanceCoeff, setFlankerDistance,
    isOrthogonalFlankersEnabled, setOrthogonalFlankers,
    isDynamicFlankersEnabled, setDynamicFlankers,
    appMode, setAppMode,
    isAnaglyphEnabled, setAnaglyph,
    strongEyeContrastPercent, setStrongContrastPercent,
    synopPullSpeed, setSynopPullSpeed,
    synopTargetType, setSynopTargetType,
    synopShowLazyGrid, setSynopLazyGrid,
    synopShowStrongGrid, setSynopStrongGrid,
    synopTargetSize, setSynopTargetSize,
    synopFlickerActive, setSynopFlicker,
    synopLockVertical, setSynopLockVertical,
    synopLockHorizontal, setSynopLockHorizontal,
  }
})