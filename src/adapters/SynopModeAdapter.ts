import { computed } from 'vue'
import type { IModeController } from '../types/hud'
import { Store } from '../store'
import { drawSynoptophoreTargets } from '../engine/synop-render'
import { playCue, playError } from '../engine/audio'

export function createSynopAdapter(): IModeController {
  // Временный адаптер, пока не создано собственное Pinia-хранилище
  const getController = () => (window as any).__synopController
  const getOverlayCanvas = () => document.getElementById('overlayCanvas') as HTMLCanvasElement
  const getOverlayCtx = () => getOverlayCanvas()?.getContext('2d') as CanvasRenderingContext2D

  const primaryLabel = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return 'Reset Session'
    if (s.synopState === 'idle') return 'Start Alignment'
    if (s.synopState === 'align') return 'Lock Fusion'
    return 'Slipped / Reset'
  })

  const isPrimaryDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    return false
  })

  const onPrimaryClick = () => {
    const s = Store.state
    const ctrl = getController()
    if (!ctrl) return

    if (s.isSessionCompleted) {
      window.dispatchEvent(new CustomEvent('synop-reset'))
      return
    }
    if (s.synopState === 'idle') {
      playCue(s.isMuted)
      Store.updateState('isCurtainActive', false)
      Store.updateState('synopState', 'align')
      Store.startTimerIfNeeded()
      const canvas = getOverlayCanvas()
      const ctx = getOverlayCtx()
      if (canvas && ctx) drawSynoptophoreTargets(canvas, ctx, s)
    } else {
      ctrl.handlePrimaryAction()
    }
  }

  const showDirectionButtons = computed(() => false)
  const leftLabel = computed(() => '')
  const isLeftDisabled = computed(() => true)
  const onLeftClick = () => {}
  const rightLabel = computed(() => '')
  const isRightDisabled = computed(() => true)
  const onRightClick = () => {}

  const showResetButton = computed(() => true)
  const resetLabel = computed(() => 'Reset')
  const isResetDisabled = computed(() => {
    const s = Store.state
    if (s.isPaused) return true
    if (s.isSessionCompleted) return true
    return s.synopState !== 'align'
  })
  const onResetClick = () => {
    const s = Store.state
    Store.updateState('synopTargetX', 0)
    Store.updateState('synopTargetY', 0)
    playError(s.isMuted)
  }

  const isPauseDisabled = computed(() => {
    const s = Store.state
    if (s.isSessionCompleted) return true
    return s.synopState === 'pulling'
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