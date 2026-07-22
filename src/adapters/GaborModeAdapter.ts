import { computed, readonly } from 'vue'
import type { IModeController } from '../types/hud'
import { useGaborStore } from '../stores/gaborStore'
import { Store } from '../store'

export function createGaborAdapter(): IModeController {
  const gabor = useGaborStore()

  const primaryLabel = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return 'Reset Session'
    if (gabor.isWaitingForAnswer) return 'Re-Flash'
    return s.total > 0 ? 'Next' : 'Start'
  })

  const isPrimaryDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return false
    const state = gabor.currentState
    if (state === 'PRE_CUE' || state === 'STIMULUS_ACTIVE' || state === 'FEEDBACK') return true
    if (s.isStaticEnabled && gabor.isWaitingForAnswer) return true
    if (s.autoAdvance && gabor.isAutoAdvanceTimerActive) return true
    return false
  })

  const onPrimaryClick = () => gabor.triggerTrial()

  const showDirectionButtons = computed(() => true)

  const leftLabel = computed(() => 'Left')
  const rightLabel = computed(() => 'Right')

  const isLeftDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return true
    return gabor.currentState !== 'AWAITING_INPUT'
  })

  const onLeftClick = () => gabor.submitAnswer('left')

  const isRightDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return true
    return gabor.currentState !== 'AWAITING_INPUT'
  })

  const onRightClick = () => gabor.submitAnswer('right')

  const showResetButton = computed(() => false)
  const resetLabel = computed(() => 'Reset')
  const isResetDisabled = computed(() => true)
  const onResetClick = () => {}

  const isPauseDisabled = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return true
    const state = gabor.currentState
    return state === 'PRE_CUE' || state === 'FEEDBACK'
  })

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
}