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
        
        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            if (field.type === 'checkbox') {
                s[field.key] = el.checked;
            } else if (field.type === 'value') {
                s[field.key] = el.value;
            } else if (field.type === 'int') {
                s[field.key] = parseInt(el.value) || 0;
            } else if (field.type === 'boolean') {
                s[field.key] = (el.value === 'true');
            } else if (field.type === 'percent') {
                s[field.key] = parseFloat(el.value) / 100;
            }
        });

        // Automatically re-detect macro match after checkboxes are toggled
        s.presetMode = Store.detectMatchingPreset();
        if (this.selectPresetMode) {
            this.selectPresetMode.value = s.presetMode;
        }

        // Live-update numeric badges while sliding
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        if (valR) valR.innerText = s.calibratorLeftR;
        if (valG) valG.innerText = s.calibratorRightG;
        if (valB) valB.innerText = s.calibratorRightB;

        this.updateVisibilityPanels();
        
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

        // Render current numeric values inside calibration badges on load
        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        if (valR) valR.innerText = s.calibratorLeftR;
        if (valG) valG.innerText = s.calibratorRightG;
        if (valB) valB.innerText = s.calibratorRightB;

        if (this.selectPresetMode) {
            this.selectPresetMode.value = s.presetMode;
        }

        this.updateVisibilityPanels();
    }

    updateVisibilityPanels() {
        const s = Store.state;
        if (this.anaglyphPanel) {
            this.anaglyphPanel.style.display = s.isAnaglyphEnabled ? 'block' : 'none';
        }

        // Real-time dynamic sub-rows unfolding inside accordions
        const rowFlicker = document.getElementById('row-flicker');
        if (rowFlicker) {
            rowFlicker.style.display = s.isStaticEnabled ? 'flex' : 'none';
        }

        const rowOrthogonal = document.getElementById('row-orthogonal');
        const rowDynamic = document.getElementById('row-dynamic');
        if (rowOrthogonal) rowOrthogonal.style.display = s.isCrowdingEnabled ? 'flex' : 'none';
        if (rowDynamic) rowDynamic.style.display = s.isCrowdingEnabled ? 'flex' : 'none';

        // Clinical Selective Disclosure: Gray out the entire 3D accordion header if monocular preset is selected
        const headerAnaglyph = document.getElementById('accordion-header-4');
        const contentAnaglyph = document.getElementById('accordion-content-4');
        if (headerAnaglyph) {
            // Hard lock the 3D accordion header ONLY if a strictly monocular preset (occlusion/blitz) is active AND 3D is disabled
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
            this.selectPresetMode.addEventListener('change', () => {
                Store.state.presetMode = this.selectPresetMode.value;
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

        // DOM references for mutual exclusions validation
        const chkPeripheral = document.getElementById('chk-peripheral');
        const chkCrowding = document.getElementById('chk-crowding');
        const chkOrthogonal = document.getElementById('chk-orthogonal-flankers');
        const chkDynamic = document.getElementById('chk-dynamic-flankers');
        const chkAnaglyph = document.getElementById('chk-anaglyph');
        const chkStatic = document.getElementById('chk-static');
        const chkFlicker = document.getElementById('chk-flicker');

        // Bind live dynamic slide updates directly to the active canvas
        const activeSliders = ['slider-left-r', 'slider-right-g', 'slider-right-b'];
        activeSliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.syncStateFromUI());
            }
        });

        // Rule: Peripheral is completely incompatible with spatial crowding flankers
        if (chkPeripheral) {
            chkPeripheral.addEventListener('change', () => {
                if (chkPeripheral.checked) {
                    if (chkCrowding) chkCrowding.checked = false;
                    if (chkOrthogonal) chkOrthogonal.checked = false;
                    if (chkDynamic) chkDynamic.checked = false;
                }
                this.syncStateFromUI();
            });
        }

        if (chkCrowding) {
            chkCrowding.addEventListener('change', () => {
                if (chkCrowding.checked) {
                    if (chkPeripheral) chkPeripheral.checked = false;
                } else {
                    if (chkOrthogonal) chkOrthogonal.checked = false;
                    if (chkDynamic) chkDynamic.checked = false;
                }
                Store.state.isCrowdingEnabled = chkCrowding.checked;
                this.syncStateFromUI();
            });
        }

        if (chkOrthogonal) {
            chkOrthogonal.addEventListener('change', () => {
                if (chkOrthogonal.checked) {
                    if (chkCrowding) chkCrowding.checked = true;
                    if (chkPeripheral) chkPeripheral.checked = false;
                }
                this.syncStateFromUI();
            });
        }

        if (chkDynamic) {
            chkDynamic.addEventListener('change', () => {
                if (chkDynamic.checked) {
                    if (chkCrowding) chkCrowding.checked = true;
                    if (chkPeripheral) chkPeripheral.checked = false;
                }
                this.syncStateFromUI();
            });
        }

        if (chkAnaglyph) {
            chkAnaglyph.addEventListener('change', () => {
                Store.state.isAnaglyphEnabled = chkAnaglyph.checked;
                this.syncStateFromUI();
                
                // If 3D mode was turned off, collapse its accordion
                if (!Store.state.isAnaglyphEnabled) {
                    const contentAnaglyph = document.getElementById('accordion-content-4');
                    if (contentAnaglyph) contentAnaglyph.classList.remove('open');
                }
            });
        }

        if (this.rangeStrongAttenuation) {
            this.rangeStrongAttenuation.addEventListener('input', () => {
                if (this.valStrongAttenuation) {
                    this.valStrongAttenuation.innerText = this.rangeStrongAttenuation.value + '%';
                }
                this.syncStateFromUI();
            });
        }

        // Rule: Flicker frequency locks require static indefinitely visible stimuli
        if (chkStatic) {
            chkStatic.addEventListener('change', () => {
                Store.state.isStaticEnabled = chkStatic.checked;
                if (!Store.state.isStaticEnabled) {
                    if (chkFlicker) chkFlicker.checked = false;
                }
                this.syncStateFromUI();
            });
        }

        if (chkFlicker) {
            chkFlicker.addEventListener('change', () => {
                if (chkFlicker.checked) {
                    if (chkStatic) chkStatic.checked = true;
                }
                this.syncStateFromUI();
            });
        }

        // Automatic binding for all other schema fields changes to run syncStateFromUI()
        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            const skipIds = [
                'select-preset-mode', 'chk-peripheral', 'chk-crowding', 
                'chk-orthogonal-flankers', 'chk-dynamic-flankers', 
                'chk-anaglyph', 'range-strong-attenuation', 'chk-static', 'chk-flicker',
                'slider-left-r', 'slider-right-g', 'slider-right-b'
            ];
            if (skipIds.includes(field.id)) return;

            el.addEventListener('change', () => this.syncStateFromUI());
        });
    }
}