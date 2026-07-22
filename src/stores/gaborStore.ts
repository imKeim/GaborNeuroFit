import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GaborController } from '../controller/gabor'
import { Store } from '../store'

export const useGaborStore = defineStore('gabor', () => {
  const gaborCtrl = ref<GaborController | null>(null)
  const currentState = ref<string>('IDLE')

  function setController(ctrl: GaborController) {
    gaborCtrl.value = ctrl
  }

  function updateState(newState: string) {
    currentState.value = newState
  }

  function triggerTrial() {
    if (!gaborCtrl.value) return
    const s = Store.state
    if (s.isWaitingForAnswer) {
      gaborCtrl.value.reFlashCurrentGabor()
    } else {
      gaborCtrl.value.triggerTrial()
    }
  }

  function submitAnswer(dir: 'left' | 'right') {
    gaborCtrl.value?.submitAnswer(dir)
  }

  // Обрати внимание: мы больше не используем эти свойства здесь,
  // так как логика перенесена в GaborModeAdapter.
  // Но если ты оставляешь их для совместимости с App.vue:
  const isStartDisabled = computed(() => {
    if (!gaborCtrl.value) return true
    const s = Store.state
    if (s.isPaused) return true
    const state = currentState.value
    if (state === 'PRE_CUE' || state === 'STIMULUS_ACTIVE' || state === 'FEEDBACK') return true
    if (s.isStaticEnabled && s.isWaitingForAnswer) return true
    if (s.autoAdvance && s.isAutoAdvanceTimerActive) return true
    return false
  })

  const startLabel = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return 'Reset Session'
    if (s.isWaitingForAnswer) return 'Re-Flash'
    return s.total > 0 ? 'Next' : 'Start'
  })

  return {
    setController,
    updateState,
    triggerTrial,
    submitAnswer,
    isStartDisabled,
    startLabel,
    currentState
  }
})