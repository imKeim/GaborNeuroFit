/*
 * GaborNeuroFit - State Management & LocalStorage Persistency Module
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module encapsulates the unified training state, presets macro mapping,
 * localStorage synchronization, and the mathematical visual adaptive staircase algorithm.
 */

export const Store = {
    // Single Source of Truth for the entire training configuration and session stats
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
        calibratorLeftR: 255,   // Pure Left R subpixel value [0-255]
        calibratorRightG: 255,  // Pure Right G subpixel value [0-255]
        calibratorRightB: 255,  // Pure Right B subpixel value [0-255]
        trialHistory: [] // Ephemeral session history for double-track macro transitions
    },

    // Safely write settings properties with boundary validations (Information Hiding)
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

    // Central mathematical validation engine: Synchronously resolves settings conflicts with Active Interaction Override
    resolveConflicts(lastActiveTrigger = null) {
        const s = this.state;

        // Rule 1: Peripheral vs Crowding mutual exclusion (Active Interaction Override)
        if (lastActiveTrigger === 'peripheral') {
            if (s.isPeripheralEnabled) {
                s.isCrowdingEnabled = false;
            }
        } else if (lastActiveTrigger === 'crowding') {
            if (s.isCrowdingEnabled) {
                s.isPeripheralEnabled = false;
            }
        } else {
            // Fallback for load/init passes: Peripheral takes precedent if both are true
            if (s.isPeripheralEnabled && s.isCrowdingEnabled) {
                s.isCrowdingEnabled = false;
            }
        }

        // Rule 2: Orthogonal and Dynamic modulations require basic Crowding flankers to be active
        if (!s.isCrowdingEnabled) {
            s.isOrthogonalFlankersEnabled = false;
            s.isDynamicFlankersEnabled = false;
        }

        // Rule 3: Flicker Alpha-resonance at 10 Hz strictly requires static target exposure to loop interval cycles
        // Active Interaction Override: Prevent static mode from fighting user input
        if (lastActiveTrigger === 'static' && !s.isStaticEnabled) {
            s.isFlickerEnabled = false;
        } else if (lastActiveTrigger === 'flicker' && s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        } else if (!lastActiveTrigger && s.isFlickerEnabled) {
            // Fallback for initialization load pass
            s.isStaticEnabled = true;
        }
    },

    // Initialize state from localStorage or falls back to robust defaults
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
        } catch (e) {
            console.warn("Local storage read failed, keeping default parameters:", e);
        }
        
        // Align default visual templates for selected macro preset
        if (this.state.presetMode !== 'custom') {
            this.applyPresetTemplate(this.state.presetMode);
        }

        // Sanitize loaded persistent state to resolve any legacy structural conflicts
        this.resolveConflicts(null);
    },

    // Commit current state variables to persistent localStorage
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
        } catch (e) {
            console.warn("Local storage write failed, active settings only cached in RAM:", e);
        }
    },

    // Enforce matching preset macros depending on active checkboxes configuration
    detectMatchingPreset() {
        const s = this.state;
        if (
            s.allowStageAdvance === true &&
            s.flashDurationMode === 'adaptive' &&
            s.isPeripheralEnabled === false &&
            s.isCrowdingEnabled === false &&
            s.isOrthogonalFlankersEnabled === false &&
            s.isDynamicFlankersEnabled === false &&
            s.isStaticEnabled === false &&
            s.isAnaglyphEnabled === false &&
            s.allowWideVariance === false &&
            s.allowShapeVariance === false &&
            s.isFlickerEnabled === false &&
            s.isFusionLockEnabled === false
        ) return 'occlusion';

        if (
            s.allowStageAdvance === true &&
            s.flashDurationMode === 'adaptive' &&
            s.isPeripheralEnabled === false &&
            s.isCrowdingEnabled === true &&
            s.isOrthogonalFlankersEnabled === false &&
            s.isDynamicFlankersEnabled === false &&
            s.isStaticEnabled === false &&
            s.isAnaglyphEnabled === true &&
            s.allowWideVariance === false &&
            s.allowShapeVariance === false &&
            s.isFlickerEnabled === false &&
            s.isFusionLockEnabled === true
        ) return 'binocular';

        if (
            s.allowStageAdvance === true &&
            s.flashDurationMode === '180' &&
            s.isPeripheralEnabled === true &&
            s.isCrowdingEnabled === false &&
            s.isOrthogonalFlankersEnabled === false &&
            s.isDynamicFlankersEnabled === false &&
            s.isStaticEnabled === false &&
            s.isAnaglyphEnabled === true &&
            s.allowWideVariance === false &&
            s.allowShapeVariance === false &&
            s.isFlickerEnabled === false &&
            s.isFusionLockEnabled === true
        ) return 'peripheral';

        if (
            s.allowStageAdvance === true &&
            s.flashDurationMode === '100' &&
            s.isPeripheralEnabled === false &&
            s.isCrowdingEnabled === false &&
            s.isOrthogonalFlankersEnabled === false &&
            s.isDynamicFlankersEnabled === false &&
            s.isStaticEnabled === false &&
            s.isAnaglyphEnabled === false &&
            s.allowWideVariance === true &&
            s.allowShapeVariance === true &&
            s.isFlickerEnabled === false &&
            s.isFusionLockEnabled === false
        ) return 'blitz';

        if (
            s.allowStageAdvance === true &&
            s.flashDurationMode === 'adaptive' &&
            s.isPeripheralEnabled === false &&
            s.isCrowdingEnabled === true &&
            s.isOrthogonalFlankersEnabled === false &&
            s.isDynamicFlankersEnabled === false &&
            s.isStaticEnabled === true &&
            s.isAnaglyphEnabled === true &&
            s.allowWideVariance === false &&
            s.allowShapeVariance === false &&
            s.isFlickerEnabled === true &&
            s.isFusionLockEnabled === true
        ) return 'flicker';

        return 'custom';
    },

    // Apply strict predefined configuration templates for target preset mode
    applyPresetTemplate(mode) {
        this.state.presetMode = mode;
        if (mode === 'occlusion') {
            this.state.allowStageAdvance = true;
            this.state.flashDurationMode = 'adaptive';
            this.state.isPeripheralEnabled = false;
            this.state.isCrowdingEnabled = false;
            this.state.isOrthogonalFlankersEnabled = false;
            this.state.isDynamicFlankersEnabled = false;
            this.state.isStaticEnabled = false;
            this.state.isAnaglyphEnabled = false;
            this.state.allowWideVariance = false;
            this.state.allowShapeVariance = false;
            this.state.isFlickerEnabled = false;
            this.state.isFusionLockEnabled = false;
        } else if (mode === 'binocular') {
            this.state.allowStageAdvance = true;
            this.state.flashDurationMode = 'adaptive';
            this.state.isPeripheralEnabled = false;
            this.state.isCrowdingEnabled = true;
            this.state.isOrthogonalFlankersEnabled = false;
            this.state.isDynamicFlankersEnabled = false;
            this.state.isStaticEnabled = false;
            this.state.isAnaglyphEnabled = true;
            this.state.allowWideVariance = false;
            this.state.allowShapeVariance = false;
            this.state.isFlickerEnabled = false;
            this.state.isFusionLockEnabled = true;
        } else if (mode === 'peripheral') {
            this.state.allowStageAdvance = true;
            this.state.flashDurationMode = '180';
            this.state.isPeripheralEnabled = true;
            this.state.isCrowdingEnabled = false;
            this.state.isOrthogonalFlankersEnabled = false;
            this.state.isDynamicFlankersEnabled = false;
            this.state.isStaticEnabled = false;
            this.state.isAnaglyphEnabled = true;
            this.state.allowWideVariance = false;
            this.state.allowShapeVariance = false;
            this.state.isFlickerEnabled = false;
            this.state.isFusionLockEnabled = true;
        } else if (mode === 'blitz') {
            this.state.allowStageAdvance = true;
            this.state.flashDurationMode = '100';
            this.state.isPeripheralEnabled = false;
            this.state.isCrowdingEnabled = false;
            this.state.isOrthogonalFlankersEnabled = false;
            this.state.isDynamicFlankersEnabled = false;
            this.state.isStaticEnabled = false;
            this.state.isAnaglyphEnabled = false;
            this.state.allowWideVariance = true;
            this.state.allowShapeVariance = true;
            this.state.isFlickerEnabled = false;
            this.state.isFusionLockEnabled = false;
        } else if (mode === 'flicker') {
            this.state.allowStageAdvance = true;
            this.state.flashDurationMode = 'adaptive';
            this.state.isPeripheralEnabled = false;
            this.state.isCrowdingEnabled = true;
            this.state.isOrthogonalFlankersEnabled = false;
            this.state.isDynamicFlankersEnabled = false;
            this.state.isStaticEnabled = true;
            this.state.isAnaglyphEnabled = true;
            this.state.allowWideVariance = false;
            this.state.allowShapeVariance = false;
            this.state.isFlickerEnabled = true;
            this.state.isFusionLockEnabled = true;
        }
    },

    // Pure mathematical Gabor Contrast Adaptive Staircase logic with double-track macro progress
    registerResult(isCorrect) {
        const s = this.state;
        s.total++;
        const minContrast = s.allowLowContrast ? 0.01 : 0.05;

        // Push current result to session history array
        if (!s.trialHistory) s.trialHistory = [];
        s.trialHistory.push(isCorrect ? 1 : 0);
        if (s.trialHistory.length > 30) s.trialHistory.shift();

        // Track B (Macro-block progression): evaluate block accuracy to prevent contrast traps
        if (s.trialHistory.length >= 20) {
            const last20 = s.trialHistory.slice(-20);
            const correctCount = last20.reduce((acc, val) => acc + val, 0);
            const accuracy20 = correctCount / 20;
            if (accuracy20 >= 0.85) {
                if (s.currentLevel < 5) {
                    s.currentLevel++;
                    s.autoContrast = 0.40; // Elevate stage and reset contrast to baseline
                    s.correctStreak = 0;
                    s.staircaseStreak = 0;
                    s.trialHistory = []; // Reset block history to prevent instant triggers cascade
                    if (isCorrect) s.score++; // Still record the score point
                    return;
                }
            }
        }

        // Track B (Macro-block regression): evaluate recent failure rate to prevent stress
        if (s.allowStageAdvance && s.trialHistory.length >= 15) {
            const last15 = s.trialHistory.slice(-15);
            const correctCount = last15.reduce((a, b) => a + b, 0);
            const accuracy = correctCount / 15;
            if (accuracy < 0.60) {
                if (s.currentLevel > 1) {
                    s.currentLevel--;
                    s.autoContrast = 0.50; // Drop stage and reset contrast to comfort zone
                    s.correctStreak = 0;
                    s.staircaseStreak = 0;
                    s.trialHistory = []; // Reset block history
                    return;
                }
            }
        }

        // Track A (Micro-staircase): standard trial-by-trial 3-down 1-up staircase
        if (isCorrect) {
            s.score++;
            s.correctStreak++;
            s.staircaseStreak++;
            
            if (s.staircaseStreak >= 3) {
                if (s.autoContrast <= minContrast) {
                    if (s.currentLevel < 5) {
                        s.currentLevel++;
                        s.autoContrast = 0.40; // Reset contrast baseline for next spatial frequency band
                    }
                } else {
                    s.autoContrast = Math.max(minContrast, s.autoContrast - 0.05);
                }
                s.staircaseStreak = 0;
            }
        } else {
            s.correctStreak = 0;
            s.staircaseStreak = 0;
            
            if (s.allowStageAdvance && s.autoContrast >= 0.70 && s.currentLevel > 1) {
                s.currentLevel--;
                s.autoContrast = 0.30; // Downgrade stage and present easier visual stimuli
            } else {
                s.autoContrast = Math.min(1.0, s.autoContrast + 0.08);
            }
        }
    },

    // Save session snapshot to local highscores leaderboard
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
                // Rich clinical biomarkers schema integration
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
            
            // Sort list by highest score
            history.sort((a, b) => b.score - a.score);
            localStorage.setItem('gabor_history_v2', JSON.stringify(history.slice(0, 7))); // Expanded from 5 to 7 records limit
        } catch (e) {
            console.warn("Leaderboard persistency write failed:", e);
        }
    },

    // Read top 5 recorded highscore sessions
    getHistory() {
        try {
            return JSON.parse(localStorage.getItem('gabor_history_v2') || '[]');
        } catch (e) {
            console.warn("Leaderboard read failed:", e);
            return [];
        }
    }
};