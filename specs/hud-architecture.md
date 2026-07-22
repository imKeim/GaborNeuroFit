# Архитектура HUD на Vue: дизайн-документ

## 1. Общая цель

Перевести HUD (кнопки управления, статус-бар, индикаторы) на реактивный Vue, сохранив существующие контроллеры и логику без изменений. Добиться централизованного управления состояниями кнопок, убрать дублирующие ручные манипуляции DOM из `app.ts`.

## 2. Текущее состояние после миграции настроек

- Модалка настроек полностью на Vue + Pinia (`settingsStore`), старый HTML удалён.
- Кнопка Start для Gabor живёт в Vue (`gaborStore.triggerTrial()`, `hudStore.isStartDisabled`) и визуально заменяет старую.
- Остальные кнопки (Left/Right, Reset, Pause) пока управляются старым кодом.

## 3. Архитектурная схема

```
[Vue App.vue]
  ├── <SettingsModal> (готово)
  ├── <HudButtons>
  │     ├── StartButton  :disabled="hud.isStartDisabled" @click="hud.onPrimaryClick()"
  │     ├── LeftButton   :disabled="hud.isAnswerDisabled" @click="hud.onLeftClick()"
  │     ├── RightButton  :disabled="hud.isAnswerDisabled" @click="hud.onRightClick()"
  │     ├── ResetButton  :disabled="hud.isResetDisabled" @click="hud.onResetClick()"
  │     ├── PauseButton  :disabled="hud.isPauseDisabled" @click="hud.onPauseToggle()"
  └── <StatusBar>
         └── авто‑обновление через Pinia‑computed

[Pinia hudStore]
  ├── activeAdapter: IModeController (фабрика по appMode)
  ├── isStartDisabled, isAnswerDisabled, isResetDisabled, isPauseDisabled (computed)
  ├── primaryLabel, leftLabel, rightLabel, resetLabel (computed)
  ├── onPrimaryClick(), onLeftClick(), ... (экшены)
  └── фабрика адаптеров:
        GaborModeAdapter, SynopModeAdapter, RdsModeAdapter

[Адаптеры (IModeController)]
  Каждый адаптер оборачивает существующий контроллер и предоставляет:
    - primaryLabel, isPrimaryDisabled, onPrimaryClick
    - showDirectionButtons, leftLabel, isLeftDisabled, onLeftClick, аналогично Right
    - showResetButton, isResetDisabled, onResetClick
    - isPauseDisabled
  Адаптер сам следит за FSM‑состоянием контроллера через колбэк / watch и обновляет свои реактивные поля.

[Старые контроллеры] (GaborController, SynoptophoreController, RdsController)
  НЕ ИЗМЕНЯЮТСЯ. Адаптеры только читают их состояние и вызывают публичные методы.
```

## 4. Интерфейс IModeController

```typescript
interface IModeController {
  // Главная кнопка (Start/Next/Lock Fusion/Start Stereogram...)
  primaryLabel: ComputedRef<string>
  isPrimaryDisabled: ComputedRef<boolean>
  onPrimaryClick: () => void

  // Кнопки направлений (Left/Right)
  showDirectionButtons: ComputedRef<boolean>    // видимость секции
  leftLabel: ComputedRef<string>
  isLeftDisabled: ComputedRef<boolean>
  onLeftClick: () => void
  rightLabel: ComputedRef<string>
  isRightDisabled: ComputedRef<boolean>
  onRightClick: () => void

  // Кнопка сброса (Reset)
  showResetButton: ComputedRef<boolean>
  resetLabel: ComputedRef<string>
  isResetDisabled: ComputedRef<boolean>
  onResetClick: () => void

  // Пауза
  isPauseDisabled: ComputedRef<boolean>
  // сам toggle вызывается глобально через hudStore.onPauseToggle()
}
```

## 5. Правила блокировки кнопок (централизовано в hudStore)

### Старт (primary)

- `isPaused`
- `isSessionCompleted` → НЕ блокируем, чтобы можно было сбросить
- Для Gabor: FSM в PRE_CUE | STIMULUS_ACTIVE | FEEDBACK
- Для Gabor: `isStaticEnabled && isWaitingForAnswer`
- Для Gabor: `autoAdvance && isAutoAdvanceTimerActive`
- Для Synoptophore: `synopState !== 'idle' && synopState !== 'align' && synopState !== 'pulling'` (т.е. только в покое доступна)
- Для RDS: контроллер сообщает через адаптер

### Направления (Left/Right)

- `isPaused`
- `isSessionCompleted`
- Для Gabor: `FSM !== AWAITING_INPUT`
- Для Synoptophore: всегда disabled (кнопки скрыты)
- Для RDS: `FSM !== AWAITING_INPUT`

### Сброс (Reset)

- `isPaused`
- `isSessionCompleted`
- Для Synoptophore: `synopState !== 'align'`
- Для Gabor/RDS: кнопка скрыта (`showResetButton: false`)

### Пауза

- `isSessionCompleted`
- Для Gabor: FSM в PRE_CUE | FEEDBACK
- Для Synoptophore: `synopState === 'pulling'`
- Для RDS: PRE_CUE | FEEDBACK

## 6. План миграции HUD (поэтапный)

1. **Создать интерфейс IModeController и адаптеры** (новые файлы `src/adapters/...`).
2. **GaborModeAdapter** – обернуть уже готовый `gaborStore` (он уже знает `triggerTrial`, `reFlash`, состояние FSM). Проверить, что Start работает.
3. **SynopModeAdapter** – временно вызывать методы из старого `SynoptophoreController`, состояние брать из `Store.state.synopState`.
4. **RdsModeAdapter** – аналогично временно использовать `RdsController`.
5. **hudStore** – добавить фабрику адаптеров, вычисляемые свойства для всех кнопок.
6. **Заменить все кнопки в App.vue** через `<HudButtons>`, скрыть старые HTML‑кнопки.
7. **Удалить старые манипуляции** с кнопками из `app.ts` и `ViewController`, включая `pauseController.togglePause` (перевести на `hudStore`).
8. **Добавить анимации и стилизацию** (victory‑pulse, start‑pulse) через классы Vue.

## 7. Преимущества подхода

- Единый источник истины для состояний кнопок.
- Лёгкое добавление новых режимов – только новый адаптер.
- Полное разделение UI и бизнес‑логики (контроллеры не знают о Vue).
- Все правила блокировки формализованы и легко тестируются.