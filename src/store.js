/*
 * GaborNeuroFit - State Management & LocalStorage Persistency Module
 * Copyright (C) 2026 Pavel Korotkov
 */

import { DataRepository } from './store/repository.js';

export const Store = {
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
        lastGaborPreset: 'occlusion',
        sessionLimit: 0,
        timerLimitMinutes: 0,
        timerRemainingSeconds: 0,
        timerIsRunning: false,
        autoAdvance: true,
        allowStageAdvance: true,
        flashDurationMode: 'adaptive',
        isPeripheralEnabled: false,
        isCrowdingEnabled: true,
        crowdingMode: 'vertical',
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
        synopStrongEyeContrastFactor: 0.3, // Isolated contrast for Synoptophore
        isFlickerEnabled: false,
        isFusionLockEnabled: true,
        isMuted: false,
        calibratorLeftR: 255, 
        calibratorRightG: 255, 
        calibratorRightB: 255, 
        synopCalibratorLeftR: 255,     // Separate Synoptophore calibrator Left R
        synopCalibratorRightG: 255,    // Separate Synoptophore calibrator Right G
        synopCalibratorRightB: 255,    // Separate Synoptophore calibrator Right B
        trialHistory: [],
        isPermanentCrossEnabled: false, // Smoothly faded persistent central anchor
        
        // Synoptophore (Prism & Vergence Training) State Space
        appMode: 'gabor',               
        synopState: 'align',            
        synopTargetX: 0,                
        synopTargetY: 0,                
        synopStartDistance: 0,          
        synopPullSpeed: 2500,           
        synopTargetType: 'ring-dot',
        synopShowLazyGrid: false,
        synopShowStrongGrid: false,
        synopTargetSize: 65,            
        synopScore: 0,
        synopFlickerActive: false,      // 10Hz resonance toggle for Synoptophore
        synopLockVertical: false,       // Y-Axis physical restriction lock
        synopLockHorizontal: false,     // X-Axis physical restriction lock
        flankerDistanceCoeff: 2.0       // 2.0 = Crowding (default), 4.0 = Lateral Facilitation
    },

    /**
     * @description Rotates the current session ID. This is done when switching between Gabor and Synoptophore modes,
     * or when a Synoptophore session completes/slips, to ensure each distinct training block is recorded uniquely.
     * Clinically, this prevents cross-contamination of metrics between different therapeutic approaches.
     * @returns {void}
     */
    rotateSessionId() {
        this.state.sessionId = 'session_' + Date.now();
    },

    /**
     * @description Centralized, validated state updater. All modifications to the Store.state
     * must pass through this method to enforce data integrity, bounds checking, and reactive side-effects.
     * This embodies the Single Source of Truth (SSoT) principle.
     * @param {string} key - The state property to update.
     * @param {*} value - The new value for the state property.
     * @returns {void}
     */
    updateState(key, value) {
        let isPresetChanged = false;

        // Ensure session ID rotates when primary application mode or Gabor preset changes.
        // Clinically, each distinct therapeutic mode is a new "session" for data tracking.
        if (key === 'appMode' || key === 'presetMode') {
            if (this.state[key] !== value) {
                this.rotateSessionId();
                if (key === 'presetMode') isPresetChanged = true;
            }
        }

        // Enforce mutual exclusivity for Synoptophore axis locks
        if (key === 'synopLockVertical') {
            this.state.synopLockVertical = !!value;
            if (this.state.synopLockVertical) {
                this.state.synopTargetY = 0; // Instantly neutralize any existing vertical deviation to prevent confusion.
                this.state.synopLockHorizontal = false; // Physically prevents simultaneous X/Y locks.
            }
            return;
        }
        if (key === 'synopLockHorizontal') {
            this.state.synopLockHorizontal = !!value;
            if (this.state.synopLockHorizontal) {
                this.state.synopTargetX = 0; // Instantly neutralize any existing horizontal deviation.
                this.state.synopLockVertical = false; // Physically prevents simultaneous X/Y locks.
            }
            return;
        }

        // Validate Gabor level bounds
        if (key === 'currentLevel') {
            this.state.currentLevel = Math.max(1, Math.min(5, parseInt(value) || 1));
            return;
        }

        // Validate contrast factor for strong eye (Gabor and Synoptophore)
        // Clinically, contrast reduction must be within a safe, perceptible range.
        if (key === 'strongEyeContrastFactor' || key === 'synopStrongEyeContrastFactor') {
            this.state[key] = Math.max(0.1, Math.min(1.0, parseFloat(value) || 0.3));
            return;
        }

        // Validate Synoptophore target X coordinate with bounds and axis lock enforcement.
        // Critical for precise orthoptic training and preventing target drift.
        if (key === 'synopTargetX') {
            if (this.state.synopLockHorizontal) {
                this.state.synopTargetX = 0; // If horizontal lock is active, force X to 0.
            } else {
                this.state.synopTargetX = Math.max(-50, Math.min(50, Math.round(parseFloat(value) || 0)));
            }
            return;
        }
        // Validate Synoptophore target Y coordinate with bounds and axis lock enforcement.
        // Ensures stability during vergence exercises.
        if (key === 'synopTargetY') {
            if (this.state.synopLockVertical) {
                this.state.synopTargetY = 0; // If vertical lock is active, force Y to 0.
            } else {
                this.state.synopTargetY = Math.max(-50, Math.min(50, Math.round(parseFloat(value) || 0)));
            }
            return;
        }

        // Validate Synoptophore pulling speed, clamped to a clinically appropriate range.
        // Prevents too rapid pulling (fusion break) or too slow (fatigue).
        if (key === 'synopPullSpeed') {
            this.state.synopPullSpeed = Math.max(1000, Math.min(5000, parseInt(value) || 2500));
            return;
        }

        // Validate Synoptophore target size, ensuring it remains within foveal/macular ranges.
        // Crucial for targeting specific retinal areas.
        if (key === 'synopTargetSize') {
            this.state.synopTargetSize = Math.max(30, Math.min(65, parseInt(value) || 65));
            return;
        }

        // Validate Synoptophore score, always non-negative.
        if (key === 'synopScore') {
            this.state.synopScore = Math.max(0, parseInt(value) || 0);
            return;
        }

        // Validate RGB calibration values, ensuring they are integers within range.
        // Essential for accurate dichoptic color channel separation.
        if (
            key === 'calibratorLeftR' || key === 'calibratorRightG' || key === 'calibratorRightB' ||
            key === 'synopCalibratorLeftR' || key === 'synopCalibratorRightG' || key === 'synopCalibratorRightB'
        ) {
            const parsed = Math.round(parseFloat(value)); // Ensure integer and round for precision
            this.state[key] = Math.max(0, Math.min(255, isNaN(parsed) ? 255 : parsed));
            return;
        }
        
        // Default assignment for other keys
        this.state[key] = value;

        // Trigger application routing ONLY when preset actually changes
        if (key === 'presetMode' && isPresetChanged) {
            this.applyPresetTemplate(value);
        }
    },

    resetSessionProgress() {
        this.state.autoContrast = 0.50;
        this.state.correctStreak = 0;
        this.state.staircaseStreak = 0;
        this.state.isWaitingForAnswer = false;
        this.state.trialHistory = [];
        this.state.timerRemainingSeconds = this.state.timerLimitMinutes * 60;
        this.state.timerIsRunning = false;
        this.rotateSessionId();
    },

    startTimerIfNeeded() {
        if (this.state.timerLimitMinutes > 0) {
            if (this.state.timerRemainingSeconds <= 0) {
                this.state.timerRemainingSeconds = this.state.timerLimitMinutes * 60;
            }
            if (!this.state.timerIsRunning) {
                this.updateState('timerIsRunning', true);
            }
        }
    },

    resolveConflicts(lastActiveTrigger = null) {
        const s = this.state;
        if (lastActiveTrigger === 'peripheral') {
            if (s.isPeripheralEnabled) s.isCrowdingEnabled = false;
        } else if (lastActiveTrigger === 'crowding') {
            if (s.isCrowdingEnabled) s.isPeripheralEnabled = false;
        } else {
            if (s.isPeripheralEnabled && s.isCrowdingEnabled) s.isCrowdingEnabled = false;
        }
        if (!s.isCrowdingEnabled) {
            s.isOrthogonalFlankersEnabled = false;
            s.isDynamicFlankersEnabled = false;
        }
        if (lastActiveTrigger === 'static' && !s.isStaticEnabled) {
            s.isFlickerEnabled = false;
        } else if (lastActiveTrigger === 'flicker' && s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        } else if (!lastActiveTrigger && s.isFlickerEnabled) {
            s.isStaticEnabled = true;
        }
    },

    loadSettings() {
        try {
            this.state.presetMode = localStorage.getItem('gabor_preset_mode') || 'occlusion';
            this.state.lastGaborPreset = localStorage.getItem('gabor_last_gabor_preset') || 'occlusion';
            this.state.currentLevel = parseInt(localStorage.getItem('gabor_start_level') || '1');
            this.state.autoAdvance = localStorage.getItem('gabor_autonext') !== 'false';
            this.state.sessionLimit = parseInt(localStorage.getItem('gabor_limit') || '0');
            this.state.timerLimitMinutes = parseInt(localStorage.getItem('gabor_timer_limit') || '0');
            this.state.allowStageAdvance = localStorage.getItem('gabor_stage_advance') !== 'false';
            this.state.flashDurationMode = localStorage.getItem('gabor_flash_mode') || 'adaptive';
            this.state.isPeripheralEnabled = localStorage.getItem('gabor_peripheral') === 'true';
            this.state.isCrowdingEnabled = localStorage.getItem('gabor_crowding') === 'true';
            this.state.crowdingMode = localStorage.getItem('gabor_crowding_mode') || 'vertical';
            this.state.isOrthogonalFlankersEnabled = localStorage.getItem('gabor_orthogonal') === 'true';
            this.state.isDynamicFlankersEnabled = localStorage.getItem('gabor_dynamic_flankers') === 'true';
            this.state.allowLowContrast = localStorage.getItem('gabor_low_contrast') === 'true';
            this.state.allowWideVariance = localStorage.getItem('gabor_wide_variance') === 'true';
            this.state.allowShapeVariance = localStorage.getItem('gabor_shape_variance') === 'true';
            this.state.isStaticEnabled = localStorage.getItem('gabor_static') === 'true';
            this.state.isFlickerEnabled = localStorage.getItem('gabor_flicker') === 'true';
            this.state.isMuted = localStorage.getItem('gabor_muted') === 'true';
            this.state.currentLang = localStorage.getItem('gabor_lang') || 'en';
            this.state.isPermanentCrossEnabled = localStorage.getItem('gabor_permanent_cross') === 'true';
            
            // Hardware & 3D Settings (Global)
            this.state.isAnaglyphEnabled = localStorage.getItem('gabor_anaglyph') !== 'false';
            this.state.redEyeSide = localStorage.getItem('gabor_red_side') || 'left';
            this.state.lazyEyeSide = localStorage.getItem('gabor_lazy_side') || 'left';
            this.state.strongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_strong_factor') || '0.3');
            this.state.synopStrongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_synop_strong_factor') || '0.3');
            this.state.isFusionLockEnabled = localStorage.getItem('gabor_fusion_lock') !== 'false';
            
            this.state.calibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_left_r') || '255')));
            this.state.calibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_g') || '255')));
            this.state.calibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_b') || '255')));

            this.state.synopCalibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_left_r') || '255')));
            this.state.synopCalibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_g') || '255')));
            this.state.synopCalibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_b') || '255')));

            // Persistent Synoptophore properties loads
            this.state.synopPullSpeed = parseInt(localStorage.getItem('gabor_synop_pull_speed') || '2500');
            this.state.synopTargetType = localStorage.getItem('gabor_synop_target_type') || 'ring-dot';
            this.state.synopShowLazyGrid = localStorage.getItem('gabor_synop_lazy_grid') === 'true';
            this.state.synopShowStrongGrid = localStorage.getItem('gabor_synop_strong_grid') === 'true';
            this.state.synopTargetSize = parseInt(localStorage.getItem('gabor_synop_target_size') || '65');
            this.state.synopScore = parseInt(localStorage.getItem('gabor_synop_score') || '0');
            this.state.synopFlickerActive = localStorage.getItem('gabor_synop_flicker_active') === 'true';
            this.state.synopLockVertical = localStorage.getItem('gabor_synop_lock_y') === 'true';
            this.state.synopLockHorizontal = localStorage.getItem('gabor_synop_lock_x') === 'true';
        } catch (e) {}
        
        const storedAppMode = localStorage.getItem('gabor_app_mode');
        if (storedAppMode === 'synoptophore') {
            this.state.appMode = 'synoptophore';
        } else {
            this.state.appMode = 'gabor';
            this.applyPresetTemplate(this.state.presetMode);
        }

        this.resolveConflicts(null);
    },

    saveSettings() {
        try {
            localStorage.setItem('gabor_app_mode', this.state.appMode);
            localStorage.setItem('gabor_preset_mode', this.state.presetMode);
            localStorage.setItem('gabor_last_gabor_preset', this.state.lastGaborPreset);
            localStorage.setItem('gabor_start_level', this.state.currentLevel);
            localStorage.setItem('gabor_autonext', this.state.autoAdvance ? "true" : "false");
            localStorage.setItem('gabor_limit', this.state.sessionLimit);
            localStorage.setItem('gabor_timer_limit', this.state.timerLimitMinutes.toString());
            localStorage.setItem('gabor_stage_advance', this.state.allowStageAdvance ? "true" : "false");
            localStorage.setItem('gabor_flash_mode', this.state.flashDurationMode);
            localStorage.setItem('gabor_peripheral', this.state.isPeripheralEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding', this.state.isCrowdingEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding_mode', this.state.crowdingMode);
            localStorage.setItem('gabor_orthogonal', this.state.isOrthogonalFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_dynamic_flankers', this.state.isDynamicFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_low_contrast', this.state.allowLowContrast ? "true" : "false");
            localStorage.setItem('gabor_wide_variance', this.state.allowWideVariance ? "true" : "false");
            localStorage.setItem('gabor_shape_variance', this.state.allowShapeVariance ? "true" : "false");
            localStorage.setItem('gabor_static', this.state.isStaticEnabled ? "true" : "false");
            localStorage.setItem('gabor_flicker', this.state.isFlickerEnabled ? "true" : "false");
            localStorage.setItem('gabor_muted', this.state.isMuted ? "true" : "false");
            localStorage.setItem('gabor_lang', this.state.currentLang);
            localStorage.setItem('gabor_permanent_cross', this.state.isPermanentCrossEnabled ? "true" : "false");
            localStorage.setItem('gabor_flanker_distance_coeff', this.state.flankerDistanceCoeff.toString()); // New: Flanker distance
            
            // Hardware & 3D Settings (Global)
            this.state.isAnaglyphEnabled = localStorage.getItem('gabor_anaglyph') !== 'false';
            this.state.redEyeSide = localStorage.getItem('gabor_red_side') || 'left';
            this.state.lazyEyeSide = localStorage.getItem('gabor_lazy_side') || 'left';
            this.state.strongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_strong_factor') || '0.3');
            this.state.synopStrongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_synop_strong_factor') || '0.3');
            this.state.isFusionLockEnabled = localStorage.getItem('gabor_fusion_lock') !== 'false';
            
            this.state.calibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_left_r') || '255')));
            this.state.calibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_g') || '255')));
            this.state.calibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_b') || '255')));

            this.state.synopCalibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_left_r') || '255')));
            this.state.synopCalibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_g') || '255')));
            this.state.synopCalibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_b') || '255')));

            // Persistent Synoptophore properties loads
            this.state.synopPullSpeed = parseInt(localStorage.getItem('gabor_synop_pull_speed') || '2500');
            this.state.synopTargetType = localStorage.getItem('gabor_synop_target_type') || 'ring-dot';
            this.state.synopShowLazyGrid = localStorage.getItem('gabor_synop_lazy_grid') === 'true';
            this.state.synopShowStrongGrid = localStorage.getItem('gabor_synop_strong_grid') === 'true';
            this.state.synopTargetSize = parseInt(localStorage.getItem('gabor_synop_target_size') || '65');
            this.state.synopScore = parseInt(localStorage.getItem('gabor_synop_score') || '0');
            this.state.synopFlickerActive = localStorage.getItem('gabor_synop_flicker_active') === 'true';
            this.state.synopLockVertical = localStorage.getItem('gabor_synop_lock_y') === 'true';
            this.state.synopLockHorizontal = localStorage.getItem('gabor_synop_lock_x') === 'true';
        } catch (e) {}
        
        const storedAppMode = localStorage.getItem('gabor_app_mode');
        if (storedAppMode === 'synoptophore') {
            this.state.appMode = 'synoptophore';
        } else {
            this.state.appMode = 'gabor';
            this.applyPresetTemplate(this.state.presetMode);
        }
        this.state.flankerDistanceCoeff = parseFloat(localStorage.getItem('gabor_flanker_distance_coeff') || '2.0'); // New: Flanker distance

        this.resolveConflicts(null);
    },

    saveSettings() {
        try {
            localStorage.setItem('gabor_app_mode', this.state.appMode);
            localStorage.setItem('gabor_preset_mode', this.state.presetMode);
            localStorage.setItem('gabor_last_gabor_preset', this.state.lastGaborPreset);
            localStorage.setItem('gabor_start_level', this.state.currentLevel);
            localStorage.setItem('gabor_autonext', this.state.autoAdvance ? "true" : "false");
            localStorage.setItem('gabor_limit', this.state.sessionLimit);
            localStorage.setItem('gabor_timer_limit', this.state.timerLimitMinutes.toString());
            localStorage.setItem('gabor_stage_advance', this.state.allowStageAdvance ? "true" : "false");
            localStorage.setItem('gabor_flash_mode', this.state.flashDurationMode);
            localStorage.setItem('gabor_peripheral', this.state.isPeripheralEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding', this.state.isCrowdingEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding_mode', this.state.crowdingMode);
            localStorage.setItem('gabor_orthogonal', this.state.isOrthogonalFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_dynamic_flankers', this.state.isDynamicFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_low_contrast', this.state.allowLowContrast ? "true" : "false");
            localStorage.setItem('gabor_wide_variance', this.state.allowWideVariance ? "true" : "false");
            localStorage.setItem('gabor_shape_variance', this.state.allowShapeVariance ? "true" : "false");
            localStorage.setItem('gabor_static', this.state.isStaticEnabled ? "true" : "false");
            localStorage.setItem('gabor_flicker', this.state.isFlickerEnabled ? "true" : "false");
            localStorage.setItem('gabor_muted', this.state.isMuted ? "true" : "false");
            localStorage.setItem('gabor_lang', this.state.currentLang);
            localStorage.setItem('gabor_permanent_cross', this.state.isPermanentCrossEnabled ? "true" : "false");
            localStorage.setItem('gabor_flanker_distance_coeff', this.state.flankerDistanceCoeff.toString()); // New: Flanker distance
            
            // Hardware & 3D Parameters (Global)
            localStorage.setItem('gabor_anaglyph', this.state.isAnaglyphEnabled ? "true" : "false");
            localStorage.setItem('gabor_red_side', this.state.redEyeSide);
            localStorage.setItem('gabor_lazy_side', this.state.lazyEyeSide);
            localStorage.setItem('gabor_strong_factor', this.state.strongEyeContrastFactor.toString());
            localStorage.setItem('gabor_synop_strong_factor', this.state.synopStrongEyeContrastFactor.toString());
            localStorage.setItem('gabor_fusion_lock', this.state.isFusionLockEnabled ? "true" : "false");
            localStorage.setItem('gabor_calib_left_r', this.state.calibratorLeftR.toString());
            localStorage.setItem('gabor_calib_right_g', this.state.calibratorRightG.toString());
            localStorage.setItem('gabor_calib_right_b', this.state.calibratorRightB.toString());

            localStorage.setItem('gabor_synop_calib_left_r', this.state.synopCalibratorLeftR.toString());
            localStorage.setItem('gabor_synop_calib_right_g', this.state.synopCalibratorRightG.toString());
            localStorage.setItem('gabor_synop_calib_right_b', this.state.synopCalibratorRightB.toString());
            
            // Persistent Synoptophore properties saves
            localStorage.setItem('gabor_synop_pull_speed', this.state.synopPullSpeed.toString());
            localStorage.setItem('gabor_synop_target_type', this.state.synopTargetType);
            localStorage.setItem('gabor_synop_lazy_grid', this.state.synopShowLazyGrid ? "true" : "false");
            localStorage.setItem('gabor_synop_strong_grid', this.state.synopShowStrongGrid ? "true" : "false");
            localStorage.setItem('gabor_synop_target_size', this.state.synopTargetSize.toString());
            localStorage.setItem('gabor_synop_score', this.state.synopScore.toString());
            localStorage.setItem('gabor_synop_flicker_active', this.state.synopFlickerActive ? "true" : "false");
            localStorage.setItem('gabor_synop_lock_y', this.state.synopLockVertical ? "true" : "false");
            localStorage.setItem('gabor_synop_lock_x', this.state.synopLockHorizontal ? "true" : "false");
        } catch (e) {}
    },

    detectMatchingPreset() {
        const s = this.state;
        if (s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'occlusion';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'binocular';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === '180' && s.isPeripheralEnabled === true && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'peripheral';
        if (s.allowStageAdvance === true && s.flashDurationMode === '100' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowWideVariance === true && s.allowShapeVariance === true && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'blitz';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === true && s.isAnaglyphEnabled === true && s.allowWideVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === true && s.isFusionLockEnabled === true) return 'flicker';
        return 'custom';
    },

    applyPresetTemplate(mode) {
        this.state.presetMode = mode;
        this.state.appMode = 'gabor'; // Presets only apply to Gabor mode!
        this.state.flankerDistanceCoeff = 2.0; // Symmetrically reset flanker spacing to standard crowding bounds during preset activation
        
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

    registerResult(isCorrect) {
        const s = this.state;
        s.total++;
        const minContrast = s.allowLowContrast ? 0.01 : 0.05;

        if (!s.trialHistory) s.trialHistory = [];
        s.trialHistory.push(isCorrect ? 1 : 0);
        if (s.trialHistory.length > 30) s.trialHistory.shift();

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

        if (s.allowStageAdvance && s.trialHistory.length >= 15) {
            const correctCount = s.trialHistory.slice(-15).reduce((a, b) => a + b, 0);
            if (correctCount / 15 < 0.60) {
                if (s.currentLevel > 1) {
                    s.currentLevel--; s.autoContrast = 0.50; s.correctStreak = 0; s.staircaseStreak = 0; s.trialHistory = [];
                    return;
                }
            }
        }

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

    saveSession() {
        if (this.state.total === 0) return;
        DataRepository.saveSession(
            this.state.sessionId,
            this.state.score,
            this.state.total,
            this.state.currentLevel,
            this.state.autoContrast,
            this.state.presetMode,
            this.state.flashDurationMode,
            this.state.isAnaglyphEnabled,
            this.state.strongEyeContrastFactor,
            this.state.lazyEyeSide,
            this.state.isFlickerEnabled,
            this.state.isCrowdingEnabled,
            this.state.isPeripheralEnabled,
            this.state.isPermanentCrossEnabled,
            null, null, null, null,
            this.state.flankerDistanceCoeff // Append current flanker spacing to the persistence pipeline
        );
    },
    getHistory() {
        return DataRepository.getSessionsForActiveUser();
    }
};