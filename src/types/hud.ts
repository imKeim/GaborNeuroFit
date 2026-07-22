import type { ComputedRef } from 'vue'

export interface IModeController {
  // Главная кнопка Start / Next / Lock Fusion
  primaryLabel: ComputedRef<string>
  isPrimaryDisabled: ComputedRef<boolean>
  onPrimaryClick: () => void

  // Кнопки направлений Left / Right
  showDirectionButtons: ComputedRef<boolean>
  leftLabel: ComputedRef<string>
  isLeftDisabled: ComputedRef<boolean>
  onLeftClick: () => void
  rightLabel: ComputedRef<string>
  isRightDisabled: ComputedRef<boolean>
  onRightClick: () => void

  // Кнопка Reset
  showResetButton: ComputedRef<boolean>
  resetLabel: ComputedRef<string>
  isResetDisabled: ComputedRef<boolean>
  onResetClick: () => void

  // Пауза (только флаг disabled, сам toggle делает hudStore)
  isPauseDisabled: ComputedRef<boolean>
}