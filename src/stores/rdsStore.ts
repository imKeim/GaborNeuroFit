import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import type { RdsController } from '../controller/rds'
import { Store } from '../store'

export const useRdsStore = defineStore('rds', () => {
  const rdsCtrl = ref<RdsController | null>(null)
  const currentState = ref<string>('IDLE')

  // Реактивные копии свойств из нереактивного Store
  const isWaitingForAnswer = ref(false)
  const rdsTotal = ref(0)

  function syncFromStore() {
    isWaitingForAnswer.value = Store.state.isWaitingForAnswer
    rdsTotal.value = Store.state.rdsTotal
  }

  function setController(ctrl: RdsController) {
    rdsCtrl.value = ctrl
  }

  function updateState(newState: string) {
    currentState.value = newState
    syncFromStore()
  }

  function triggerTrial() {
    rdsCtrl.value?.triggerTrial()
    syncFromStore()
  }

  function submitAnswer(dir: 'left' | 'right') {
    rdsCtrl.value?.submitAnswer(dir)
    syncFromStore()
  }

  return {
    setController,
    updateState,
    triggerTrial,
    submitAnswer,
    currentState: readonly(currentState),
    isWaitingForAnswer: readonly(isWaitingForAnswer),
    rdsTotal: readonly(rdsTotal)
  }
})