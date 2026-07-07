/*
 * GaborNeuroFit - Declarative Settings Binder Controller
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module isolates form synchronization, preset templates application,
 * and custom subpixel RGB slider color calibration rules.
 */

import { Store } from '../store.js';

// Metadata schema for declarative mapping between DOM Inputs and Store State fields
const CONFIG_SCHEMA = [
    { id: 'chk-stage-advance', key: 'allowStageAdvance', type: 'checkbox' },
    { id: 'select-flash-duration', key: 'flashDurationMode', type: 'value' },
    { id: 'chk-peripheral', key: 'isPeripheralEnabled', type: 'checkbox' },
    { id: 'chk-crowding', key: 'isCrowdingEnabled', type: 'checkbox' },
    { id: 'chk-orthogonal-flankers', key: 'isOrthogonalFlankersEnabled', type: 'checkbox' },
    { id: 'chk-dynamic-flankers', key: 'isDynamicFlankersEnabled', type: 'checkbox' },
    { id: 'chk-low-contrast', key: 'allowLowContrast', type: 'checkbox' },
    { id: 'chk-wide-variance', key: 'allowWideVariance', type: 'checkbox' },
    { id: 'chk-static', key: 'isStaticEnabled', type: 'checkbox' },
    { id: 'chk-anaglyph', key: 'isAnaglyphEnabled', type: 'checkbox' },
    { id: 'chk-flicker', key: 'isFlickerEnabled', type: 'checkbox' },
    { id: 'chk-fusion-lock', key: 'isFusionLockEnabled', type: 'checkbox' },
    { id: 'select-red-side', key: 'redEyeSide', type: 'value' },
    { id: 'select-lazy-side', key: 'lazyEyeSide', type: 'value' },
    { id: 'range-strong-attenuation', key: 'strongEyeContrastFactor', type: 'percent' },
    { id: 'select-start-level', key: 'currentLevel', type: 'int' },
    { id: 'select-autonext', key: 'autoAdvance', type: 'boolean' },
    { id: 'select-session-limit', key: 'sessionLimit', type: 'int' },
    { id: 'slider-left-r', key: 'calibratorLeftR', type: 'int' },
    { id: 'slider-right-g', key: 'calibratorRightG', type: 'int' },
    { id: 'slider-right-b', key: 'calibratorRightB', type: 'int' }
];

export class SettingsController {
    constructor(onSyncCallback) {
        this.onSyncCallback = onSyncCallback; // Callback to notify App orchestrator of changes
        
        // Resolve persistent DOM panel elements
        this.anaglyphPanel = document.getElementById('anaglyph-settings-panel');
        this.valStrongAttenuation = document.getElementById('val-strong-attenuation');
        this.selectPresetMode = document.getElementById('select-preset-mode');
        this.rangeStrongAttenuation = document.getElementById('range-strong-attenuation');
    }

    // Declaratively reads input forms values and commits them to the Store Model
    syncStateFromUI() {
        const s = Store.state;
        let lastActiveTrigger = null;

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;
    
            let val;
            if (field.type === 'checkbox') {
                val = el.checked;
                if (s[field.key] !== val) {
                    if (field.key === 'isPeripheralEnabled') lastActiveTrigger = 'peripheral';
                    if (field.key === 'isCrowdingEnabled') lastActiveTrigger = 'crowding';
                    if (field.key === 'isStaticEnabled') lastActiveTrigger = 'static';
                    if (field.key === 'isFlickerEnabled') lastActiveTrigger = 'flicker';
                }
            } else if (field.type === 'value') {
                val = el.value;
            } else if (field.type === 'int') {
                val = parseInt(el.value) || 0;
            } else if (field.type === 'boolean') {
                val = (el.value === 'true');
            } else if (field.type === 'percent') {
                val = parseFloat(el.value) / 100;
            }
            
            Store.updateState(field.key, val);
        });

        // Resolve setting constraints in central memory with active trigger detection
        Store.resolveConflicts(lastActiveTrigger);
    
        // Automatically re-detect macro match after checkboxes are toggled
        const detectedPreset = Store.detectMatchingPreset();
        Store.updateState('presetMode', detectedPreset);
        if (this.selectPresetMode) {
            this.selectPresetMode.value = detectedPreset;
        }

        // Live-update numeric badges while sliding, mapped to a highly intuitive -127 to +128 equilibrium scale
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        
        if (valR) {
            const offsetR = s.calibratorLeftR - 127;
            valR.innerText = offsetR > 0 ? `+${offsetR}` : offsetR;
        }
        if (valG) {
            const offsetG = s.calibratorRightG - 127;
            valG.innerText = offsetG > 0 ? `+${offsetG}` : offsetG;
        }
        if (valB) {
            const offsetB = s.calibratorRightB - 127;
            valB.innerText = offsetB > 0 ? `+${offsetB}` : offsetB;
        }

        if (typeof this.onSyncCallback === 'function') {
            this.onSyncCallback();
        }
    }

    // Declaratively reads Store Model state and writes values to the active HTML inputs
    updatePresetUI() {
        const s = Store.state;

        if (s.presetMode !== 'custom') {
            Store.applyPresetTemplate(s.presetMode);
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            if (field.type === 'checkbox') {
                el.checked = s[field.key];
            } else if (field.type === 'value') {
                el.value = s[field.key];
            } else if (field.type === 'int') {
                el.value = s[field.key].toString();
            } else if (field.type === 'boolean') {
                el.value = s[field.key] ? 'true' : 'false';
            } else if (field.type === 'percent') {
                el.value = Math.round(s[field.key] * 100).toString();
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = el.value + '%';
                }
            }
        });

        // Direct numeric sliders bindings (Pure RGB calibration, zero obsolete Hex fields)
        const sLeftR = document.getElementById('slider-left-r');
        if (sLeftR) sLeftR.value = s.calibratorLeftR;

        const sRightG = document.getElementById('slider-right-g');
        const sRightB = document.getElementById('slider-right-b');
        if (sRightG) sRightG.value = s.calibratorRightG;
        if (sRightB) sRightB.value = s.calibratorRightB;

        // Render current numeric values mapped to a highly intuitive -127 to +128 equilibrium scale on load
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        
        if (valR) {
            const offsetR = s.calibratorLeftR - 127;
            valR.innerText = offsetR > 0 ? `+${offsetR}` : offsetR;
        }
        if (valG) {
            const offsetG = s.calibratorRightG - 127;
            valG.innerText = offsetG > 0 ? `+${offsetG}` : offsetG;
        }
        if (valB) {
            const offsetB = s.calibratorRightB - 127;
            valB.innerText = offsetB > 0 ? `+${offsetB}` : offsetB;
        }

        if (this.selectPresetMode) {
            this.selectPresetMode.value = s.presetMode;
        }

        this.updateVisibilityPanels();
    }

    updateVisibilityPanels() {
        const s = Store.state;

        // 1. Accordion 2: Flicker row control (Always display flex, opacity & disabled toggle)
        const chkFlicker = document.getElementById('chk-flicker');
        const rowFlicker = document.getElementById('row-flicker');
        if (chkFlicker) chkFlicker.disabled = !s.isStaticEnabled;
        if (rowFlicker) {
            rowFlicker.style.display = 'flex';
            rowFlicker.style.opacity = s.isStaticEnabled ? '1' : '0.5';
        }

        // 2. Accordion 3: Crowding sub-rows control (Always display flex, opacity & disabled toggle)
        const chkOrthogonal = document.getElementById('chk-orthogonal-flankers');
        const chkDynamic = document.getElementById('chk-dynamic-flankers');
        const rowOrthogonal = document.getElementById('row-orthogonal');
        const rowDynamic = document.getElementById('row-dynamic');

        if (chkOrthogonal) chkOrthogonal.disabled = !s.isCrowdingEnabled;
        if (chkDynamic) chkDynamic.disabled = !s.isCrowdingEnabled;

        if (rowOrthogonal) {
            rowOrthogonal.style.display = 'flex';
            rowOrthogonal.style.opacity = s.isCrowdingEnabled ? '1' : '0.5';
        }
        if (rowDynamic) {
            rowDynamic.style.display = 'flex';
            rowDynamic.style.opacity = s.isCrowdingEnabled ? '1' : '0.5';
        }

        // 3. Accordion 4: Anaglyph calibration panel control (Always display block, opacity & disabled toggle for all child inputs)
        if (this.anaglyphPanel) {
            this.anaglyphPanel.style.display = 'block';
            this.anaglyphPanel.style.opacity = s.isAnaglyphEnabled ? '1' : '0.4';

            const calibInputs = this.anaglyphPanel.querySelectorAll('input, select, button');
            calibInputs.forEach(input => {
                input.disabled = !s.isAnaglyphEnabled;
            });
        }

        // 4. Clinical Selective Disclosure: Gray out the entire 3D accordion header if monocular preset is selected
        const headerAnaglyph = document.getElementById('accordion-header-4');
        const contentAnaglyph = document.getElementById('accordion-content-4');
        if (headerAnaglyph) {
            const isMonocularPreset = (s.presetMode === 'occlusion' || s.presetMode === 'blitz');
            const shouldDisable3D = !s.isAnaglyphEnabled && isMonocularPreset;

            if (shouldDisable3D) {
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

    // Binds events and enforces clinical options validation (mutual exclusions)
    bindSettingsInteractions() {
        if (this.selectPresetMode) {
            this.selectPresetMode.value = Store.state.presetMode;
            this.selectPresetMode.addEventListener('change', () => {
                Store.updateState('presetMode', this.selectPresetMode.value);
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') {
                    this.onSyncCallback();
                }
            });
        }

        // Bind interactive collapsible accordion cards clicks
        for (let i = 1; i <= 4; i++) {
            const header = document.getElementById(`accordion-header-${i}`);
            const content = document.getElementById(`accordion-content-${i}`);
            if (header && content) {
                header.addEventListener('click', () => {
                    const isOpen = content.classList.contains('open');
                    
                    // Collapse all other groups first for pristine vertical screen space economy
                    for (let j = 1; j <= 4; j++) {
                        const c = document.getElementById(`accordion-content-${j}`);
                        const h = document.getElementById(`accordion-header-${j}`);
                        if (c) c.classList.remove('open');
                        if (h) {
                            const arrow = h.querySelector('.accordion-arrow');
                            if (arrow) arrow.classList.remove('active');
                        }
                    }

                    // If clicked header was closed, expand it!
                    if (!isOpen) {
                        content.classList.add('open');
                        const arrow = header.querySelector('.accordion-arrow');
                        if (arrow) arrow.classList.add('active');
                    }
                });
            }
        }

        // Bind live dynamic slider updates directly to active canvas
        const activeSliders = ['slider-left-r', 'slider-right-g', 'slider-right-b'];
        activeSliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    this.syncStateFromUI();
                });
            }
        });

        if (this.rangeStrongAttenuation) {
            this.rangeStrongAttenuation.addEventListener('input', () => {
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = this.rangeStrongAttenuation.value + '%';
                }
                this.syncStateFromUI();
            });
        }

        // Automatic binding for all schema fields changes to run syncStateFromUI() and force visual update
        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            const skipIds = [
                'select-preset-mode', 'range-strong-attenuation',
                'slider-left-r', 'slider-right-g', 'slider-right-b'
            ];
            if (skipIds.includes(field.id)) return;

            el.addEventListener('change', () => {
                this.syncStateFromUI();
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') {
                    this.onSyncCallback();
                }
            });
        });
    }
}