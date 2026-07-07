/*
 * GaborNeuroFit - State Management & LocalStorage Persistency Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module encapsulates the unified training state, presets macro mapping,
 * localStorage synchronization, and the mathematical visual adaptive staircase algorithm.
 */

export const Store = {
    // STATE SCHEMA: Single Source of Truth for the active session, indicators, and configuration parameters.
    // WARNING: Do not prune, rename, or delete any keys. They map 1:1 to DOM CONFIG_SCHEMA fields.
    state: {
        sessionId: 'session_' + Date.now(),
        currentAngleDeg: 0,
        isWaitingForAnswer: false,
        score: 0,
        total: 0,
        autoContrast: 0.5,
        correctStreak: 0,
        staircaseStreak: 0,
        currentLevel: 1,
        currentLang: 'en',
        presetMode: 'occlusion',
        sessionLimit: 0,
        autoAdvance: true,
        allowStageAdvance: true,
        flashDurationMode: 'adaptive',
        isPeripheralEnabled: false,
        isCrowdingEnabled: true,
        isOrthogonalFlankersEnabled: false,
        isDynamicFlankersEnabled: false,
        allowLowContrast: false,
        allowWideVariance: false,
        allowShapeVariance: false,
        isStaticEnabled: false,
        isAnaglyphEnabled: true,
        redEyeSide: 'left',
        lazyEyeSide: 'left',
        strongEyeContrastFactor: 0.3,
        isFlickerEnabled: false,
        isFusionLockEnabled: true,
        isMuted: false,
        calibratorLeftR: 255, // Pure Left subpixel Red balance [0-255]
        calibratorRightG: 255, // Pure Right subpixel Green balance [0-255]
        calibratorRightB: 255, // Pure Right subpixel Blue balance [0-255]
        trialHistory: [] // Ephemeral sliding window (max 30 items) for block progression checks
    },

    // BOUNDARY PROTECTION: Hard-locks critical clinical parameters to prevent DOM UI crashes
    updateState(key, value) {
        if (key === 'currentLevel') {
            this.state.currentLevel = Math.max(1, Math.min(5, parseInt(value) || 1));
            return;
        }
        if (key === 'strongEyeContrastFactor') {
            this.state.strongEyeContrastFactor = Math.max(0.1, Math.min(1.0, parseFloat(value) || 0.3));
            return;
        }
        this.state[key] = value;
    },

    // ACTIVE INTERACTION OVERRIDE: Resolves conflicting optometric constraints symmetrically.
    // Uses lastActiveTrigger to determine which checkbox wins, completely avoiding dead-locks in UI.
    resolveConflicts(lastActiveTrigger = null) {
        const s = this.state;

        // Rule 1: Peripheral shifts vs Crowding flankers (Mutual Exclusion)
        if (lastActiveTrigger === 'peripheral') {
            if (s.isPeripheralEnabled) s.isCrowdingEnabled = false;
        } else if (lastActiveTrigger === 'crowding') {
            if (s.isCrowdingEnabled) s.isPeripheralEnabled = false;
        } else {
            // Cold boot fallback
            if (s.isPeripheralEnabled && s.isCrowdingEnabled) s.isCrowdingEnabled = false;
        }

        // Rule 2: Dynamic and Orthogonal flankers strictly require Crowding to be active
        if (!s.isCrowdingEnabled) {
            s.isOrthogonalFlankersEnabled = false;
            s.isDynamicFlankersEnabled = false;
        }

        // Rule 3: 10 Hz Flicker strictly requires a static, non-hiding background container (SSVEP lock)
        if (lastActiveTrigger === 'static' && !s.isStaticEnabled) {
            s.isFlickerEnabled = false;
        } else if (lastActiveTrigger === 'flicker' && s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        } else if (!lastActiveTrigger && s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        }
    },

    // PERSISTENCE ENGINE: Safely synchronizes model state with localStorage.
    // Gracefully falls back to robust default values if parsing or browser security policies fail.
    loadSettings() {
        try {
            this.state.presetMode = localStorage.getItem('gabor_preset_mode') || 'occlusion';
            this.state.currentLevel = parseInt(localStorage.getItem('gabor_start_level') || '1');
            this.state.autoAdvance = localStorage.getItem('gabor_autonext') !== 'false';
            this.state.sessionLimit = parseInt(localStorage.getItem('gabor_limit') || '0');
            this.state.allowStageAdvance = localStorage.getItem('gabor_stage_advance') !== 'false';
            this.state.flashDurationMode = localStorage.getItem('gabor_flash_mode') || 'adaptive';
            this.state.isPeripheralEnabled = localStorage.getItem('gabor_peripheral') === 'true';
            this.state.isCrowdingEnabled = localStorage.getItem('gabor_crowding') === 'true';
            this.state.isOrthogonalFlankersEnabled = localStorage.getItem('gabor_orthogonal') === 'true';
            this.state.isDynamicFlankersEnabled = localStorage.getItem('gabor_dynamic_flankers') === 'true';
            this.state.allowLowContrast = localStorage.getItem('gabor_low_contrast') === 'true';
            this.state.allowWideVariance = localStorage.getItem('gabor_wide_variance') === 'true';
            this.state.allowShapeVariance = localStorage.getItem('gabor_shape_variance') === 'true';
            this.state.isStaticEnabled = localStorage.getItem('gabor_static') === 'true';
            this.state.isAnaglyphEnabled = localStorage.getItem('gabor_anaglyph') === 'true';
            this.state.redEyeSide = localStorage.getItem('gabor_red_side') || 'left';
            this.state.lazyEyeSide = localStorage.getItem('gabor_lazy_side') || 'left';
            this.state.strongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_strong_factor') || '0.3');
            this.state.isFlickerEnabled = localStorage.getItem('gabor_flicker') === 'true';
            this.state.isFusionLockEnabled = localStorage.getItem('gabor_fusion_lock') !== 'false';
            this.state.isMuted = localStorage.getItem('gabor_muted') === 'true';
            this.state.currentLang = localStorage.getItem('gabor_lang') || 'en';
            this.state.calibratorLeftR = parseInt(localStorage.getItem('gabor_calib_left_r') || '255');
            this.state.calibratorRightG = parseInt(localStorage.getItem('gabor_calib_right_g') || '255');
            this.state.calibratorRightB = parseInt(localStorage.getItem('gabor_calib_right_b') || '255');
        } catch (e) {}
        
        if (this.state.presetMode !== 'custom') {
            this.applyPresetTemplate(this.state.presetMode);
        }
        this.resolveConflicts(null);
    },

    saveSettings() {
        try {
            localStorage.setItem('gabor_preset_mode', this.state.presetMode);
            localStorage.setItem('gabor_start_level', this.state.currentLevel);
            localStorage.setItem('gabor_autonext', this.state.autoAdvance ? "true" : "false");
            localStorage.setItem('gabor_limit', this.state.sessionLimit);
            localStorage.setItem('gabor_stage_advance', this.state.allowStageAdvance ? "true" : "false");
            localStorage.setItem('gabor_flash_mode', this.state.flashDurationMode);
            localStorage.setItem('gabor_peripheral', this.state.isPeripheralEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding', this.state.isCrowdingEnabled ? "true" : "false");
            localStorage.setItem('gabor_orthogonal', this.state.isOrthogonalFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_dynamic_flankers', this.state.isDynamicFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_low_contrast', this.state.allowLowContrast ? "true" : "false");
            localStorage.setItem('gabor_wide_variance', this.state.allowWideVariance ? "true" : "false");
            localStorage.setItem('gabor_shape_variance', this.state.allowShapeVariance ? "true" : "false");
            localStorage.setItem('gabor_static', this.state.isStaticEnabled ? "true" : "false");
            localStorage.setItem('gabor_anaglyph', this.state.isAnaglyphEnabled ? "true" : "false");
            localStorage.setItem('gabor_red_side', this.state.redEyeSide);
            localStorage.setItem('gabor_lazy_side', this.state.lazyEyeSide);
            localStorage.setItem('gabor_strong_factor', this.state.strongEyeContrastFactor.toString());
            localStorage.setItem('gabor_flicker', this.state.isFlickerEnabled ? "true" : "false");
            localStorage.setItem('gabor_fusion_lock', this.state.isFusionLockEnabled ? "true" : "false");
            localStorage.setItem('gabor_muted', this.state.isMuted ? "true" : "false");
            localStorage.setItem('gabor_lang', this.state.currentLang);
            localStorage.setItem('gabor_calib_left_r', this.state.calibratorLeftR.toString());
            localStorage.setItem('gabor_calib_right_g', this.state.calibratorRightG.toString());
            localStorage.setItem('gabor_calib_right_b', this.state.calibratorRightB.toString());
        } catch (e) {}
    },

    // CLINICAL PRESETS MATRIX: Maps active macro checkboxes. 
    // WARNING: Any change to the state schema must be registered here to avoid custom-mode leakages.
    detectMatchingPreset() {
        const s = this.state;
        if (s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'occlusion';
        if (s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'binocular';
        if (s.allowStageAdvance === true && s.flashDurationMode === '180' && s.isPeripheralEnabled === true && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'peripheral';
        if (s.allowStageAdvance === true && s.flashDurationMode === '100' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowWideVariance === true && s.allowShapeVariance === true && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'blitz';
        if (s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === true && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === true && s.isFusionLockEnabled === true) return 'flicker';
        return 'custom';
    },

    applyPresetTemplate(mode) {
        this.state.presetMode = mode;
        if (mode === 'occlusion') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = false; this.state.allowWideVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = false;
        } else if (mode === 'binocular') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = true; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = true; this.state.allowWideVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = true;
        } else if (mode === 'peripheral') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = '180'; this.state.isPeripheralEnabled = true; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = true; this.state.allowWideVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = true;
        } else if (mode === 'blitz') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = '100'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = false; this.state.allowWideVariance = true; this.state.allowShapeVariance = true; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = false;
        } else if (mode === 'flicker') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = true; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = true; this.state.isAnaglyphEnabled = true; this.state.allowWideVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = true; this.state.isFusionLockEnabled = true;
        }
    },

    // ADAPTIVE STAIRCASE ENGINE: Implements optometric 3-down 1-up clinical feedback loop.
    // Coordinates micro-staircase contrast adjustments and macro-block (sliding window) stage transitions.
    registerResult(isCorrect) {
        const s = this.state;
        s.total++;
        const minContrast = s.allowLowContrast ? 0.01 : 0.05;

        if (!s.trialHistory) s.trialHistory = [];
        s.trialHistory.push(isCorrect ? 1 : 0);
        if (s.trialHistory.length > 30) s.trialHistory.shift();

        // Macro-Track B Progression: 20-trial sliding window. If success rate >= 85%, advance spatial stage difficulty
        if (s.trialHistory.length >= 20) {
            const correctCount = s.trialHistory.slice(-20).reduce((a, b) => a + b, 0);
            if (correctCount / 20 >= 0.85) {
                if (s.currentLevel < 5) {
                    s.currentLevel++; s.autoContrast = 0.40; s.correctStreak = 0; s.staircaseStreak = 0; s.trialHistory = [];
                    if (isCorrect) s.score++;
                    return;
                }
            }
        }

        // Macro-Track B Regression: 15-trial sliding window. If success rate < 60%, regress spatial stage to avoid stress
        if (s.allowStageAdvance && s.trialHistory.length >= 15) {
            const correctCount = s.trialHistory.slice(-15).reduce((a, b) => a + b, 0);
            if (correctCount / 15 < 0.60) {
                if (s.currentLevel > 1) {
                    s.currentLevel--; s.autoContrast = 0.50; s.correctStreak = 0; s.staircaseStreak = 0; s.trialHistory = [];
                    return;
                }
            }
        }

        // Micro-Track A: Standard trial-by-trial staircase. 3 correct answers drop contrast; 1 error raises contrast.
        if (isCorrect) {
            s.score++; s.correctStreak++; s.staircaseStreak++;
            if (s.staircaseStreak >= 3) {
                if (s.autoContrast <= minContrast) {
                    if (s.currentLevel < 5) { s.currentLevel++; s.autoContrast = 0.40; }
                } else {
                    s.autoContrast = Math.max(minContrast, s.autoContrast - 0.05);
                }
                s.staircaseStreak = 0;
            }
        } else {
            s.correctStreak = 0; s.staircaseStreak = 0;
            if (s.allowStageAdvance && s.autoContrast >= 0.70 && s.currentLevel > 1) {
                s.currentLevel--; s.autoContrast = 0.30;
            } else {
                s.autoContrast = Math.min(1.0, s.autoContrast + 0.08);
            }
        }
    },

    // PERSISTENCE LEADERBOARD: Saves active session state. 
    // Preserves legacy flat list (gabor_history_v2) with a maximum cap of 7 records.
    saveSession() {
        if (this.state.total === 0) return;
        try {
            const history = JSON.parse(localStorage.getItem('gabor_history_v2') || '[]');
            const currentSession = {
                id: this.state.sessionId,
                score: this.state.score,
                total: this.state.total,
                level: this.state.currentLevel,
                contrast: Math.round(this.state.autoContrast * 100),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                protocol: this.state.presetMode,
                speed: this.state.flashDurationMode,
                isAnaglyph: this.state.isAnaglyphEnabled,
                balance: Math.round(this.state.strongEyeContrastFactor * 100)
            };
            
            const existingIdx = history.findIndex(h => h.id === this.state.sessionId);
            if (existingIdx > -1) {
                history[existingIdx] = currentSession;
            } else {
                history.push(currentSession);
            }
            
            history.sort((a, b) => b.score - a.score);
            localStorage.setItem('gabor_history_v2', JSON.stringify(history.slice(0, 7)));
        } catch (e) {}
    },

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem('gabor_history_v2') || '[]');
        } catch (e) { return []; }
    }
};