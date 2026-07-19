/**
 * @file settings.ts
 * @description Bidirectional Data Binder for application configurations.
 * Acts as the declarative bridge between the reactive Store and the modal UI, 
 * synchronizing over 50 clinical parameters while enforcing mode-specific visibility rules.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store';
import type { AppState } from '../types/clinical';

/** 
 * @description Definition of a declarative UI-to-State binding field.
 * @architecture Ensures that each DOM identifier corresponds strictly to an AppState key.
 */
interface ConfigField {
    /** @description DOM element ID in index.html */
    id: string;
    /** @description Target key in the reactive AppState tree */
    key: keyof AppState;
    /** @description Component type used to determine parsing logic */
    type: 'checkbox' | 'value' | 'int' | 'float' | 'boolean' | 'percent' | 'pill' | 'grid';
}

/** 
 * @description Master schema mapping UI components to clinical state parameters.
 * Serves as the Single Source of Truth for settings synchronization.
 */
const CONFIG_SCHEMA: ConfigField[] = [
    { id: 'chk-stage-advance', key: 'allowStageAdvance', type: 'checkbox' },
    { id: 'select-flash-duration', key: 'flashDurationMode', type: 'pill' },
    { id: 'chk-peripheral', key: 'isPeripheralEnabled', type: 'checkbox' },
    { id: 'chk-crowding', key: 'isCrowdingEnabled', type: 'checkbox' },
    { id: 'select-crowding-mode', key: 'crowdingMode', type: 'pill' },
    { id: 'select-flanker-distance', key: 'flankerDistanceCoeff', type: 'pill' },
    { id: 'chk-orthogonal-flankers', key: 'isOrthogonalFlankersEnabled', type: 'checkbox' },
    { id: 'chk-dynamic-flankers', key: 'isDynamicFlankersEnabled', type: 'checkbox' },
    { id: 'chk-low-contrast', key: 'allowLowContrast', type: 'checkbox' },
    { id: 'chk-dynamic-level-drift', key: 'allowDynamicLevelDrift', type: 'checkbox' },
    { id: 'chk-density-variance', key: 'allowDensityVariance', type: 'checkbox' },
    { id: 'chk-shape-variance', key: 'allowShapeVariance', type: 'checkbox' },
    { id: 'chk-static', key: 'isStaticEnabled', type: 'checkbox' },
    { id: 'chk-anaglyph', key: 'isAnaglyphEnabled', type: 'checkbox' },
    { id: 'chk-flicker', key: 'isFlickerEnabled', type: 'checkbox' },
    { id: 'chk-fusion-lock', key: 'isFusionLockEnabled', type: 'checkbox' },
    { id: 'select-red-side', key: 'redEyeSide', type: 'pill' },
    { id: 'select-lazy-side', key: 'lazyEyeSide', type: 'pill' },
    { id: 'range-strong-attenuation', key: 'strongEyeContrastFactor', type: 'percent' },
    { id: 'select-start-level', key: 'currentLevel', type: 'pill' },
    { id: 'select-autonext', key: 'autoAdvance', type: 'pill' },
    { id: 'select-session-limit', key: 'sessionLimit', type: 'pill' },
    { id: 'select-rds-session-limit', key: 'rdsSessionLimit', type: 'pill' },
    { id: 'select-timer-limit', key: 'timerLimitMinutes', type: 'pill' },
    { id: 'slider-left-r', key: 'calibratorLeftR', type: 'int' },
    { id: 'slider-right-g', key: 'calibratorRightG', type: 'int' },
    { id: 'slider-right-b', key: 'calibratorRightB', type: 'int' },
    { id: 'select-pull-speed', key: 'synopPullSpeed', type: 'pill' },
    { id: 'select-target-type', key: 'synopTargetType', type: 'pill' },
    { id: 'chk-synop-lazy-grid', key: 'synopShowLazyGrid', type: 'checkbox' },
    { id: 'chk-synop-strong-grid', key: 'synopShowStrongGrid', type: 'checkbox' },
    { id: 'select-target-size', key: 'synopTargetSize', type: 'pill' },
    { id: 'chk-synop-flicker', key: 'synopFlickerActive', type: 'checkbox' },
    { id: 'chk-synop-lock-y', key: 'synopLockVertical', type: 'checkbox' },
    { id: 'chk-synop-lock-x', key: 'synopLockHorizontal', type: 'checkbox' },
    { id: 'chk-permanent-cross', key: 'isPermanentCrossEnabled', type: 'checkbox' },
    { id: 'select-rds-dot-size', key: 'rdsDotSize', type: 'pill' },
    { id: 'select-rds-density', key: 'rdsDensity', type: 'pill' },
    { id: 'select-rds-start-disparity', key: 'rdsStartDisparity', type: 'pill' },
    { id: 'select-rds-autonext', key: 'rdsAutoAdvance', type: 'pill' },
    { id: 'chk-rds-dynamic', key: 'rdsIsDynamic', type: 'checkbox' },
    { id: 'chk-rds-randomize-vertical', key: 'rdsRandomizeVertical', type: 'checkbox' },
    { id: 'chk-rds-floating', key: 'rdsIsFloating', type: 'checkbox' },
    { id: 'select-rds-float-speed', key: 'rdsFloatSpeed', type: 'pill' },
    { id: 'chk-rds-permanent-cross', key: 'rdsIsPermanentCrossEnabled', type: 'checkbox' },
    { id: 'select-lang', key: 'currentLang', type: 'pill' },
    { id: 'select-preset-mode', key: 'presetMode', type: 'grid' }
];

/**
 * @description Controller responsible for modal settings UI orchestration.
 */
export class SettingsController {
    private anaglyphPanel: HTMLElement | null;
    private valStrongAttenuation: HTMLElement | null;
    private rangeStrongAttenuation: HTMLInputElement | null;

    constructor(
        private onSyncCallback: () => void
    ) {
        this.anaglyphPanel = document.getElementById('anaglyph-settings-panel');
        this.valStrongAttenuation = document.getElementById('val-strong-attenuation');
        this.rangeStrongAttenuation = document.getElementById('range-strong-attenuation') as HTMLInputElement | null;
    }

    /**
     * @description Dynamically updates the visual 'filled' portion of a range slider.
     * @mathematical Computes percentage fill and injects it into the CSS '--percent' variable.
     */
    updateSliderTrackGradient(slider: HTMLInputElement | null): void {
        if (!slider || slider.type !== 'range') return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.setProperty('--percent', percent + '%');
    }

    /**
     * @description Synchronizes the global Store state based on current DOM input values.
     * 
     * @architecture
     * Iterates through CONFIG_SCHEMA to perform type-safe value extraction and 
     * triggers preset detection if manual overrides occurred.
     */
    syncStateFromUI(): void {
        const s = Store.state;
        let lastActiveTrigger: string | null = null;

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let val: any;

            if (field.type === 'checkbox') {
                const inputEl = el as HTMLInputElement;
                val = inputEl.checked;
                if ((s[field.key] as boolean) !== val) {
                    if (field.key === 'isPeripheralEnabled') lastActiveTrigger = 'peripheral';
                    if (field.key === 'isCrowdingEnabled') lastActiveTrigger = 'crowding';
                    if (field.key === 'isStaticEnabled') lastActiveTrigger = 'static';
                    if (field.key === 'isFlickerEnabled') lastActiveTrigger = 'flicker';
                    if (field.key === 'rdsRandomizeVertical') lastActiveTrigger = 'rdsRandomizeVertical';
                    if (field.key === 'rdsIsFloating') lastActiveTrigger = 'rdsIsFloating';
                }
            } else if (field.type === 'pill' || field.type === 'grid') {
                const activeChild = el.querySelector('.active') as HTMLElement | null;
                const rawVal = activeChild ? activeChild.getAttribute('data-value') || '' : '';
                
                if (field.key === 'autoAdvance' || field.key === 'rdsAutoAdvance') {
                    val = (rawVal === 'true');
                } else if (typeof s[field.key] === 'number') {
                    val = rawVal.includes('.') ? parseFloat(rawVal) : parseInt(rawVal, 10);
                    if (isNaN(val)) val = 0;
                } else {
                    val = rawVal;
                }
            } else {
                const inputEl = el as HTMLInputElement | HTMLSelectElement;
                if (field.type === 'value') {
                    val = inputEl.value;
                } else if (field.type === 'int') {
                    val = parseInt(inputEl.value, 10) || 0;
                } else if (field.type === 'float') {
                    val = parseFloat(inputEl.value) || 2.0;
                } else if (field.type === 'boolean') {
                    val = (inputEl.value === 'true');
                } else if (field.type === 'percent') {
                    val = parseFloat(inputEl.value) / 100;
                }
            }

            if (field.id === 'range-strong-attenuation') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopStrongEyeContrastFactor' : 'strongEyeContrastFactor', val);
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = (el as HTMLInputElement).value + '%';
                }
            } else if (field.id === 'slider-left-r') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorLeftR' : 'calibratorLeftR', val);
            } else if (field.id === 'slider-right-g') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightG' : 'calibratorRightG', val);
            } else if (field.id === 'slider-right-b') {
                Store.updateState(s.appMode === 'synoptophore' ? 'synopCalibratorRightB' : 'calibratorRightB', val);
            } else {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                Store.updateState(field.key, val);
            }

            this.updateSliderTrackGradient(el as HTMLInputElement);
        });

        Store.resolveConflicts(lastActiveTrigger);

        if (s.appMode === 'gabor') {
            if (s.presetMode !== 'custom') {
                const detectedPreset = Store.detectMatchingPreset();
                Store.updateState('presetMode', detectedPreset);
            }
        }

        this.updateCalibrationLabels(s);

        if (typeof this.onSyncCallback === 'function') {
            this.onSyncCallback();
        }
    }

    /**
     * @description Hydrates modal UI elements based on the current Store state.
     * 
     * @clinical 
     * Automatically clamps Gabor subpixel calibrations to >= 127 to prevent negative phase 
     * underflow during active perceptual trials.
     */
    updatePresetUI(): void {
        const s = Store.state;
        const isSynop = s.appMode === 'synoptophore';

        if (!isSynop) {
            if (s.calibratorLeftR < 127) s.calibratorLeftR = 127;
            if (s.calibratorRightG < 127) s.calibratorRightG = 127;
            if (s.calibratorRightB < 127) s.calibratorRightB = 127;
        }

        const sliderR = document.getElementById('slider-left-r') as HTMLInputElement | null;
        const sliderG = document.getElementById('slider-right-g') as HTMLInputElement | null;
        const sliderB = document.getElementById('slider-right-b') as HTMLInputElement | null;
        if (sliderR) sliderR.min = isSynop ? "0" : "127";
        if (sliderG) sliderG.min = isSynop ? "0" : "127";
        if (sliderB) sliderB.min = isSynop ? "0" : "127";

        if (s.appMode === 'gabor' && s.presetMode !== 'custom') {
            Store.applyPresetTemplate(s.presetMode);
        }

        const btnTabGabor = document.getElementById('settings-tab-gabor');
        const btnTabSynop = document.getElementById('settings-tab-synop');
        const btnTabRds = document.getElementById('settings-tab-rds');

        if (btnTabGabor && btnTabSynop && btnTabRds) {
            btnTabGabor.classList.remove('active');
            btnTabSynop.classList.remove('active');
            btnTabRds.classList.remove('active');

            if (s.appMode === 'synoptophore') {
                btnTabSynop.classList.add('active');
            } else if (s.appMode === 'rds') {
                btnTabRds.classList.add('active');
            } else {
                btnTabGabor.classList.add('active');
            }
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            if (field.id === 'range-strong-attenuation') {
                const inputEl = el as HTMLInputElement;
                const targetFactor = s.appMode === 'synoptophore' ? s.synopStrongEyeContrastFactor : s.strongEyeContrastFactor;
                inputEl.value = Math.round(targetFactor * 100).toString();
                if (this.valStrongAttenuation) this.valStrongAttenuation.innerText = inputEl.value + '%';
                this.updateSliderTrackGradient(inputEl);
                return;
            }

            if (field.type === 'checkbox') {
                const inputEl = el as HTMLInputElement;
                inputEl.checked = s[field.key] as boolean;
            } else if (field.type === 'pill' || field.type === 'grid') {
                const currentValue = String(s[field.key]);
                const children = el.querySelectorAll('.pill-btn, .preset-card');
                children.forEach(child => {
                    if (child.getAttribute('data-value') === currentValue) {
                        child.classList.add('active');
                    } else {
                        child.classList.remove('active');
                    }
                });
            } else {
                const inputEl = el as HTMLSelectElement | HTMLInputElement;
                if (field.type === 'value') inputEl.value = s[field.key] as string;
                else if (field.type === 'int') inputEl.value = (s[field.key] as number).toString();
                else if (field.type === 'float') inputEl.value = (s[field.key] as number).toString();
                else if (field.type === 'boolean') inputEl.value = s[field.key] ? 'true' : 'false';
            }

            if (field.id === 'slider-left-r') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR).toString();
            } else if (field.id === 'slider-right-g') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG).toString();
            } else if (field.id === 'slider-right-b') {
                (el as HTMLInputElement).value = (s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB).toString();
            }

            if (field.type === 'checkbox' || el.tagName === 'SELECT' || field.type === 'pill' || field.type === 'grid') {
                // Skip track updates for non-range controls
            } else {
                this.updateSliderTrackGradient(el as HTMLInputElement);
            }
        });

        if (sliderR) this.updateSliderTrackGradient(sliderR);
        if (sliderG) this.updateSliderTrackGradient(sliderG);
        if (sliderB) this.updateSliderTrackGradient(sliderB);

        this.updateCalibrationLabels(s);
        this.updateVisibilityPanels();
    }

    /** @description Refreshes subpixel RGB numeric labels on the calibration panel. */
    updateCalibrationLabels(s: AppState): void {
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');

        const r = s.appMode === 'synoptophore' ? s.synopCalibratorLeftR : s.calibratorLeftR;
        const g = s.appMode === 'synoptophore' ? s.synopCalibratorRightG : s.calibratorRightG;
        const b = s.appMode === 'synoptophore' ? s.synopCalibratorRightB : s.calibratorRightB;

        if (valR) valR.innerText = (r - 127 > 0 ? '+' : '') + (r - 127);
        if (valG) valG.innerText = (g - 127 > 0 ? '+' : '') + (g - 127);
        if (valB) valB.innerText = (b - 127 > 0 ? '+' : '') + (b - 127);
    }

    /**
     * @description Orchestrates the contextual visibility of settings groups.
     * 
     * @clinical 
     * Filters out parameters that are irrelevant to the current training modality, 
     * significantly reducing cognitive workload and preventing misconfigurations.
     */
    updateVisibilityPanels(): void {
        const s = Store.state;
        const isSynop = (s.appMode === 'synoptophore');
        const currentMode = s.appMode;

        document.querySelectorAll<HTMLElement>('[data-visible-in]').forEach(el => {
            const allowedModes = (el.dataset.visibleIn || "").split(',');
            const isVisible = allowedModes.includes(currentMode);
            el.style.display = isVisible ? '' : 'none';
        });

        if (!isSynop) {
            const chkFlicker = document.getElementById('chk-flicker') as HTMLInputElement | null;
            const rowFlicker = document.getElementById('row-flicker');
            if (chkFlicker) chkFlicker.disabled = !s.isStaticEnabled;
            if (rowFlicker) {
                rowFlicker.style.opacity = s.isStaticEnabled ? '1' : '0.5';
            }

            const chkOrthogonal = document.getElementById('chk-orthogonal-flankers') as HTMLInputElement | null;
            const chkDynamic = document.getElementById('chk-dynamic-flankers') as HTMLInputElement | null;
            const rowOrthogonal = document.getElementById('row-orthogonal');
            const rowDynamic = document.getElementById('row-dynamic');
            const rowCrowdingMode = document.getElementById('row-crowding-mode');
            const rowFlankerDistance = document.getElementById('row-flanker-distance');

            if (chkOrthogonal) chkOrthogonal.disabled = !s.isCrowdingEnabled;
            if (chkDynamic) chkDynamic.disabled = !s.isCrowdingEnabled;
            const crowdingOpacity = s.isCrowdingEnabled ? '1' : '0.5';

            if (rowCrowdingMode) {
                rowCrowdingMode.style.opacity = crowdingOpacity;
                const pillGroup = rowCrowdingMode.querySelector('.pill-group') as HTMLElement | null;
                if (pillGroup) pillGroup.style.pointerEvents = s.isCrowdingEnabled ? 'auto' : 'none';
            }
            if (rowFlankerDistance) {
                rowFlankerDistance.style.opacity = crowdingOpacity;
                const pillGroup = rowFlankerDistance.querySelector('.pill-group') as HTMLElement | null;
                if (pillGroup) pillGroup.style.pointerEvents = s.isCrowdingEnabled ? 'auto' : 'none';
            }
            if (rowOrthogonal) rowOrthogonal.style.opacity = crowdingOpacity;
            if (rowDynamic) rowDynamic.style.opacity = crowdingOpacity;
        }

        const rowRdsFloatSpeed = document.getElementById('row-rds-floating-speed');
        if (rowRdsFloatSpeed) {
            rowRdsFloatSpeed.style.opacity = s.rdsIsFloating ? '1' : '0.5';
            const pillGroup = rowRdsFloatSpeed.querySelector('.pill-group') as HTMLElement | null;
            if (pillGroup) pillGroup.style.pointerEvents = s.rdsIsFloating ? 'auto' : 'none';
        }

        if (this.anaglyphPanel) {
            const isAnaglyphActive = s.isAnaglyphEnabled || isSynop || s.appMode === 'rds';

            this.anaglyphPanel.style.display = 'block';
            this.anaglyphPanel.style.opacity = isAnaglyphActive ? '1' : '0.4';
            
            this.anaglyphPanel.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(input => {
                if (input.id !== 'chk-anaglyph') {
                    input.disabled = !isAnaglyphActive;
                }
            });

            this.anaglyphPanel.querySelectorAll<HTMLElement>('.pill-group').forEach(group => {
                group.style.pointerEvents = isAnaglyphActive ? 'auto' : 'none';
            });
        }

        const headerAnaglyph = document.getElementById('accordion-header-4');
        const contentAnaglyph = document.getElementById('accordion-content-4');
        if (headerAnaglyph) {
            const isMonocularPreset = (s.presetMode === 'occlusion' || s.presetMode === 'blitz');
            const shouldDisable3D = !s.isAnaglyphEnabled && isMonocularPreset;
            if (shouldDisable3D && !isSynop && s.appMode !== 'rds') {
                headerAnaglyph.style.opacity = '0.35';
                headerAnaglyph.style.pointerEvents = 'none';
                if (contentAnaglyph) contentAnaglyph.classList.remove('open');
                const arrow = headerAnaglyph.querySelector('.accordion-arrow');
                if (arrow) arrow.classList.remove('active');
            } else {
                headerAnaglyph.style.opacity = '1';
                headerAnaglyph.style.pointerEvents = 'auto';
            }
        }
    }

    /**
     * @description Attaches high-performance input listeners to settings controls.
     * 
     * @architecture
     * - Event Delegation: Binds click events to horizontal pill/grid groups to reduce memory overhead.
     * - W3C A11y Bridge: Delegates Space/Enter keypresses on focused headers to native click actions.
     * - High-Precision Nudges: Implements Pointer-down auto-repeat loops for fine-tuning range values.
     */
    bindSettingsInteractions(): void {
        const chkY = document.getElementById('chk-synop-lock-y') as HTMLInputElement | null;
        const chkX = document.getElementById('chk-synop-lock-x') as HTMLInputElement | null;
        if (chkY && chkX) {
            chkY.addEventListener('change', () => {
                if (chkY.checked) chkX.checked = false;
            });
            chkX.addEventListener('change', () => {
                if (chkX.checked) chkY.checked = false;
            });
        }

        const btnTabGabor = document.getElementById('settings-tab-gabor');
        const btnTabSynop = document.getElementById('settings-tab-synop');
        const btnTabRds = document.getElementById('settings-tab-rds');

        if (btnTabGabor && btnTabSynop && btnTabRds) {
            btnTabGabor.addEventListener('click', () => {
                Store.updateState('appMode', 'gabor');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
            btnTabSynop.addEventListener('click', () => {
                Store.updateState('appMode', 'synoptophore');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
            btnTabRds.addEventListener('click', () => {
                Store.updateState('appMode', 'rds');
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        }

        document.querySelectorAll('.pill-group, .preset-grid').forEach(parent => {
            parent.addEventListener('click', (event) => {
                const target = event.target as HTMLElement;
                const button = target.closest('.pill-btn, .preset-card') as HTMLElement | null;
                if (!button || button.classList.contains('active')) return;

                parent.querySelectorAll('.pill-btn, .preset-card').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                this.syncStateFromUI();
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        });

        const headers = document.querySelectorAll<HTMLElement>('.accordion-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const contentId = header.id.replace('header', 'content');
                const content = document.getElementById(contentId);
                if (!content) return;

                const isOpen = content.classList.contains('open');

                document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('open'));
                document.querySelectorAll('.accordion-arrow').forEach(a => a.classList.remove('active'));

                if (!isOpen) {
                    content.classList.add('open');
                    const arrow = header.querySelector('.accordion-arrow');
                    if (arrow) arrow.classList.add('active');

                    // Smooth viewport anchoring for opened sections
                    setTimeout(() => {
                        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 220); 
                }
            });

            header.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });
        });

        const activeSliders = ['slider-left-r', 'slider-right-g', 'slider-right-b'];
        activeSliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.syncStateFromUI());
        });

        if (this.rangeStrongAttenuation) {
            this.rangeStrongAttenuation.addEventListener('input', () => {
                this.syncStateFromUI();
            });
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;
            const skipIds = ['select-preset-mode', 'range-strong-attenuation', 'slider-left-r', 'slider-right-g', 'slider-right-b'];
            if (skipIds.includes(field.id) || field.type === 'pill' || field.type === 'grid') return;

            el.addEventListener('change', () => {
                this.syncStateFromUI();
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        });

        // Initialize high-frequency nudge buttons for precise calibration
        document.querySelectorAll<HTMLElement>('.nudge-btn').forEach(btn => {
            let nudgeIntervalId: number | null = null;
            let nudgeTimeoutId: number | null = null;

            const performNudge = () => {
                const buttonHtml = btn as HTMLButtonElement;
                const targetId = buttonHtml.dataset.nudgeTarget;
                const step = parseInt(buttonHtml.dataset.nudgeStep || '1', 10) || 1;
                const dir = parseInt(buttonHtml.dataset.nudgeDir || '1', 10) || 1;

                if (!targetId) return;
                const slider = document.getElementById(targetId) as HTMLInputElement | null;
                if (!slider) return;

                const min = parseInt(slider.min, 10) || 0;
                const max = parseInt(slider.max, 10) || 255;
                const current = parseInt(slider.value, 10) || 0;
                slider.value = Math.max(min, Math.min(max, current + dir * step)).toString();
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            };

            const clearNudgeTimers = () => {
                if (nudgeTimeoutId !== null) window.clearTimeout(nudgeTimeoutId);
                if (nudgeIntervalId !== null) window.clearInterval(nudgeIntervalId);
                nudgeTimeoutId = null;
                nudgeIntervalId = null;
            };

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                clearNudgeTimers();
                performNudge();

                // Start auto-repeat loop after 350ms initial hold delay
                nudgeTimeoutId = window.setTimeout(() => {
                    nudgeIntervalId = window.setInterval(performNudge, 45);
                }, 350);
            });

            // Enable keyboard activation (Enter/Space) for nudge buttons
            btn.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    performNudge();
                }
            });

            btn.addEventListener('pointerup', clearNudgeTimers);
            btn.addEventListener('pointerleave', clearNudgeTimers);
            btn.addEventListener('pointercancel', clearNudgeTimers);
        });
    }
}
