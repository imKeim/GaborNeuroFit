import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import type { GaborController } from '../controller/gabor'
import { Store } from '../store'

export const useGaborStore = defineStore('gabor', () => {
  const gaborCtrl = ref<GaborController | null>(null)
  const currentState = ref<string>('IDLE')
  const isWaitingForAnswer = ref(false)
  const isAutoAdvanceTimerActive = ref(false)

  function syncFromStore() {
    isWaitingForAnswer.value = Store.state.isWaitingForAnswer
    isAutoAdvanceTimerActive.value = Store.state.isAutoAdvanceTimerActive
  }

  function setController(ctrl: GaborController) {
    gaborCtrl.value = ctrl
  }

  function updateState(newState: string) {
    currentState.value = newState
    syncFromStore()
  }

  function triggerTrial() {
    if (!gaborCtrl.value) return
    const s = Store.state
    if (s.isWaitingForAnswer) {
      gaborCtrl.value.reFlashCurrentGabor()
    } else {
      gaborCtrl.value.triggerTrial()
    }
    syncFromStore()
  }

  function submitAnswer(dir: 'left' | 'right') {
    gaborCtrl.value?.submitAnswer(dir)
    syncFromStore()
  }

  const isStartDisabled = computed(() => {
    if (!gaborCtrl.value) return true
    const s = Store.state
    if (s.isPaused) return true
    const state = currentState.value
    if (state === 'PRE_CUE' || state === 'STIMULUS_ACTIVE' || state === 'FEEDBACK') return true
    if (s.isStaticEnabled && isWaitingForAnswer.value) return true
    if (s.autoAdvance && isAutoAdvanceTimerActive.value) return true
    return false
  })

  const startLabel = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return 'Reset Session'
    if (isWaitingForAnswer.value) return 'Re-Flash'
    return s.total > 0 ? 'Next' : 'Start'
  })

  return {
    setController,
    updateState,
    triggerTrial,
    submitAnswer,
    isStartDisabled: readonly(isStartDisabled),
    startLabel: readonly(startLabel),
    currentState: readonly(currentState),
    isWaitingForAnswer: readonly(isWaitingForAnswer),
    isAutoAdvanceTimerActive: readonly(isAutoAdvanceTimerActive),
  }
})