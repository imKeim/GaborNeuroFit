/*
 * GaborNeuroFit - Declarative Settings Binder Controller
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';

const CONFIG_SCHEMA = [
    { id: 'chk-stage-advance', key: 'allowStageAdvance', type: 'checkbox' },
    { id: 'select-flash-duration', key: 'flashDurationMode', type: 'value' },
    { id: 'chk-peripheral', key: 'isPeripheralEnabled', type: 'checkbox' },
    { id: 'chk-crowding', key: 'isCrowdingEnabled', type: 'checkbox' },
    { id: 'chk-orthogonal-flankers', key: 'isOrthogonalFlankersEnabled', type: 'checkbox' },
    { id: 'chk-dynamic-flankers', key: 'isDynamicFlankersEnabled', type: 'checkbox' },
    { id: 'chk-low-contrast', key: 'allowLowContrast', type: 'checkbox' },
    { id: 'chk-wide-variance', key: 'allowWideVariance', type: 'checkbox' },
    { id: 'chk-shape-variance', key: 'allowShapeVariance', type: 'checkbox' },
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
    { id: 'slider-right-b', key: 'calibratorRightB', type: 'int' },
    { id: 'select-pull-speed', key: 'synopPullSpeed', type: 'int' },
    { id: 'select-target-type', key: 'synopTargetType', type: 'value' },
    { id: 'chk-synop-lazy-grid', key: 'synopShowLazyGrid', type: 'checkbox' },
    { id: 'chk-synop-strong-grid', key: 'synopShowStrongGrid', type: 'checkbox' },
    { id: 'select-target-size', key: 'synopTargetSize', type: 'int' },
    { id: 'chk-synop-flicker', key: 'synopFlickerActive', type: 'checkbox' },
    { id: 'chk-synop-lock-y', key: 'synopLockVertical', type: 'checkbox' },
    { id: 'chk-permanent-cross', key: 'isPermanentCrossEnabled', type: 'checkbox' }
];

export class SettingsController {
    constructor(onSyncCallback) {
        this.onSyncCallback = onSyncCallback;
        this.anaglyphPanel = document.getElementById('anaglyph-settings-panel');
        this.valStrongAttenuation = document.getElementById('val-strong-attenuation');
        this.selectPresetMode = document.getElementById('select-preset-mode');
        this.rangeStrongAttenuation = document.getElementById('range-strong-attenuation');
    }

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

        Store.resolveConflicts(lastActiveTrigger);
    
        const detectedPreset = Store.detectMatchingPreset();
        Store.updateState('presetMode', detectedPreset);
        if (this.selectPresetMode) {
            this.selectPresetMode.value = detectedPreset;
        }

        const valR = document.getElementById('val-calib-r');
        const valG = document.getElementById('val-calib-g');
        const valB = document.getElementById('val-calib-b');
        
        if (valR) valR.innerText = (s.calibratorLeftR - 127 > 0 ? '+' : '') + (s.calibratorLeftR - 127);
        if (valG) valG.innerText = (s.calibratorRightG - 127 > 0 ? '+' : '') + (s.calibratorRightG - 127);
        if (valB) valB.innerText = (s.calibratorRightB - 127 > 0 ? '+' : '') + (s.calibratorRightB - 127);

        if (typeof this.onSyncCallback === 'function') {
            this.onSyncCallback();
        }
    }

    updatePresetUI() {
        const s = Store.state;

        if (s.presetMode !== 'custom') {
            Store.applyPresetTemplate(s.presetMode);
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;

            if (field.type === 'checkbox') el.checked = s[field.key];
            else if (field.type === 'value') el.value = s[field.key];
            else if (field.type === 'int') el.value = s[field.key].toString();
            else if (field.type === 'boolean') el.value = s[field.key] ? 'true' : 'false';
            else if (field.type === 'percent') {
                el.value = Math.round(s[field.key] * 100).toString();
                if (this.valStrongAttenuation) this.valStrongAttenuation.innerText = el.value + '%';
            }
        });

        const sLeftR = document.getElementById('slider-left-r');
        if (sLeftR) sLeftR.value = s.calibratorLeftR;
        const sRightG = document.getElementById('slider-right-g');
        const sRightB = document.getElementById('slider-right-b');
        if (sRightG) sRightG.value = s.calibratorRightG;
        if (sRightB) sRightB.value = s.calibratorRightB;

        if (this.selectPresetMode) this.selectPresetMode.value = s.presetMode;

        this.updateVisibilityPanels();
    }

    toggleAccordionGroupState(groupNumber, isEnabled) {
        const header = document.getElementById(`accordion-header-${groupNumber}`);
        const content = document.getElementById(`accordion-content-${groupNumber}`);
        if (!header || !content) return;

        if (isEnabled) {
            header.style.opacity = '1';
            header.style.pointerEvents = 'auto';
            content.style.opacity = '1';
            content.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = false;
            });
        } else {
            header.style.opacity = '0.35';
            header.style.pointerEvents = 'none';
            content.style.opacity = '0.35';
            content.classList.remove('open');
            const arrow = header.querySelector('.accordion-arrow');
            if (arrow) arrow.classList.remove('active');
            content.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = true;
            });
        }
    }

    updateVisibilityPanels() {
        const s = Store.state;
        const isSynop = (s.appMode === 'synoptophore');

        this.toggleAccordionGroupState(2, !isSynop); 
        this.toggleAccordionGroupState(3, !isSynop); 
        this.toggleAccordionGroupState(5, isSynop);  

        if (!isSynop) {
            const chkFlicker = document.getElementById('chk-flicker');
            const rowFlicker = document.getElementById('row-flicker');
            if (chkFlicker) chkFlicker.disabled = !s.isStaticEnabled;
            if (rowFlicker) {
                rowFlicker.style.display = 'flex';
                rowFlicker.style.opacity = s.isStaticEnabled ? '1' : '0.5';
            }

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
        }

        const chkAnaglyph = document.getElementById('chk-anaglyph');
        if (chkAnaglyph) {
            chkAnaglyph.disabled = isSynop;
            const rowAnaglyph = chkAnaglyph.closest('.settings-row');
            if (rowAnaglyph) rowAnaglyph.style.opacity = isSynop ? '0.5' : '1';
        }

        const chkFusionLock = document.getElementById('chk-fusion-lock');
        if (chkFusionLock) {
            chkFusionLock.disabled = isSynop;
            const rowFusionLock = chkFusionLock.closest('.settings-row');
            if (rowFusionLock) rowFusionLock.style.opacity = isSynop ? '0.5' : '1';
        }

        // Symmetrically lock and dim Gabor-only baseline options during Synoptophore
        const selectStartLevel = document.getElementById('select-start-level');
        if (selectStartLevel) {
            selectStartLevel.disabled = isSynop;
            const row = selectStartLevel.closest('.settings-row');
            if (row) row.style.opacity = isSynop ? '0.5' : '1';
        }

        const selectAutoNext = document.getElementById('select-autonext');
        if (selectAutoNext) {
            selectAutoNext.disabled = isSynop;
            const row = selectAutoNext.closest('.settings-row');
            if (row) row.style.opacity = isSynop ? '0.5' : '1';
        }

        const selectSessionLimit = document.getElementById('select-session-limit');
        if (selectSessionLimit) {
            selectSessionLimit.disabled = isSynop;
            const row = selectSessionLimit.closest('.settings-row');
            if (row) row.style.opacity = isSynop ? '0.5' : '1';
        }

        if (this.anaglyphPanel) {
            this.anaglyphPanel.style.display = 'block';
            this.anaglyphPanel.style.opacity = (s.isAnaglyphEnabled || isSynop) ? '1' : '0.4';
            this.anaglyphPanel.querySelectorAll('input, select, button').forEach(input => {
                if (input.id === 'range-strong-attenuation' && isSynop) {
                    input.disabled = true;
                    const row = input.closest('.settings-row');
                    if(row) row.style.opacity = '0.35';
                } else if (input.id !== 'chk-fusion-lock' && input.id !== 'chk-anaglyph') {
                    input.disabled = !s.isAnaglyphEnabled;
                }
            });
        }

        const headerAnaglyph = document.getElementById('accordion-header-4');
        const contentAnaglyph = document.getElementById('accordion-content-4');
        if (headerAnaglyph) {
            const isMonocularPreset = (s.presetMode === 'occlusion' || s.presetMode === 'blitz');
            const shouldDisable3D = !s.isAnaglyphEnabled && isMonocularPreset;
            if (shouldDisable3D && !isSynop) {
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

    bindSettingsInteractions() {
        if (this.selectPresetMode) {
            this.selectPresetMode.value = Store.state.presetMode;
            this.selectPresetMode.addEventListener('change', () => {
                Store.updateState('presetMode', this.selectPresetMode.value);
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        }

        const headers = document.querySelectorAll('.accordion-header');
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
                if (this.valStrongAttenuation) this.valStrongAttenuation.innerText = this.rangeStrongAttenuation.value + '%';
                this.syncStateFromUI();
            });
        }

        CONFIG_SCHEMA.forEach(field => {
            const el = document.getElementById(field.id);
            if (!el) return;
            const skipIds = ['select-preset-mode', 'range-strong-attenuation', 'slider-left-r', 'slider-right-g', 'slider-right-b'];
            if (skipIds.includes(field.id)) return;

            el.addEventListener('change', () => {
                this.syncStateFromUI();
                this.updatePresetUI();
                if (typeof this.onSyncCallback === 'function') this.onSyncCallback();
            });
        });
    }
}