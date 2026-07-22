import { computed } from 'vue'
import type { IModeController } from '../types/hud'
import { Store } from '../store'
import { useRdsStore } from '../stores/rdsStore'

export function createRdsAdapter(): IModeController {
  const rds = useRdsStore()

  const primaryLabel = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return 'Reset Session'
    if (rds.isWaitingForAnswer) return 'Next Stereogram'
    return rds.rdsTotal > 0 ? 'Next Stereogram' : 'Start Stereogram'
  })

  const isPrimaryDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return false
    const state = rds.currentState
    if (state === 'PRE_CUE' || state === 'STIMULUS_ACTIVE' || state === 'AWAITING_INPUT' || state === 'FEEDBACK') return true
    // TODO: сделать rds.isAutoAdvanceTimerActive по аналогии с Gabor, пока пропускаем
    return false
  })

  const onPrimaryClick = () => rds.triggerTrial()

  const showDirectionButtons = computed(() => true)
  const leftLabel = computed(() => 'Left')
  const rightLabel = computed(() => 'Right')

  const isLeftDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return true
    return rds.currentState !== 'AWAITING_INPUT'
  })
  const onLeftClick = () => rds.submitAnswer('left')

  const isRightDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return true
    return rds.currentState !== 'AWAITING_INPUT'
  })
  const onRightClick = () => rds.submitAnswer('right')

  const showResetButton = computed(() => false)
  const resetLabel = computed(() => 'Reset')
  const isResetDisabled = computed(() => true)
  const onResetClick = () => {}

  const isPauseDisabled = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return true
    const state = rds.currentState
    return state === 'PRE_CUE' || state === 'FEEDBACK'
  })

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
}