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
        sessionLimit: 80,
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
        isPaused: false,
        savedTimerRunningState: false,
        
        // Synoptophore (Prism & Vergence Training) State Space
        appMode: 'gabor',               
        synopState: 'idle',            
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
        flankerDistanceCoeff: 2.0,      // 2.0 = Crowding (default), 4.0 = Lateral Facilitation
        
        // Stereopsis / Random Dot Stereogram (RDS) State Space
        rdsLevel: 1,                    // Active depth resolution stage (1 to 5)
        rdsDotSize: 4,                  // Pixel scale of a single noise cell (2, 4, 6)
        rdsDensity: 0.50,               // Ratio of active noise cells (0.35, 0.50, 0.65)
        rdsStartDisparity: 8,           // Starting cell shift (1 to 8 - default 8px / Stage 1)
        rdsDisparity: 8,                // Active depth disparity (computed based on rdsLevel)
        rdsAutoAdvance: true,           // Dedicated active stereogram auto-pacing toggle
        rdsTargetSide: 'left',          // 'left' or 'right' hidden shape position
        rdsScore: 0,
        rdsTotal: 0,
        rdsStreak: 0,
        rdsStaircaseStreak: 0,
        rdsHistory: [],
        rdsIsDynamic: true,             // Clinical gold standard default (Boiling Noise)
        rdsRandomizeVertical: false,    // Off by default for comfortable initial training
        rdsTargetY: 0,                  // Active dynamic vertical offset in grid cells
        rdsIsFloating: false,           // Dynamic pursuit tracking off by default
        rdsFloatSpeed: 'medium',        // Fluid velocity scaling for pursuit tracking
        rdsIsPermanentCrossEnabled: true, // Show central zero-disparity anchor by default
        rdsDriftX: 0,                   // Smooth real-time drift X offset
        rdsDriftY: 0,                   // Smooth real-time drift Y offset
        rdsSessionLimit: 25             // SSoT Isomorphic Independent RDS Limit
    },

    rotateSessionId() {
        this.state.sessionId = 'session_' + Date.now();
    },

    updateState(key, value) {
        let isPresetChanged = false;

        if (key === 'appMode' || key === 'presetMode') {
            if (this.state[key] !== value) {
                this.rotateSessionId();
                if (key === 'presetMode') isPresetChanged = true;
            }
        }

        // SSoT Clinical Safeguard: RDS requires strictly active anaglyph color channel splitting
        if (key === 'appMode') {
            if (value === 'rds') {
                this.state.isAnaglyphEnabled = true;
            }
        }
        if (key === 'isAnaglyphEnabled' && this.state.appMode === 'rds') {
            this.state.isAnaglyphEnabled = true;
            return; // Block turning off 3D during active RDS session
        }

        // Validate RDS properties and enforce strict limits at the Store level
        if (key === 'rdsLevel') {
            this.state.rdsLevel = Math.max(1, Math.min(5, parseInt(value) || 1));
            return;
        }
        if (key === 'rdsDotSize') {
            const parsed = parseInt(value);
            this.state.rdsDotSize = [2, 4, 6].includes(parsed) ? parsed : 4;
            return;
        }
        if (key === 'rdsDensity') {
            const parsed = parseFloat(value);
            this.state.rdsDensity = [0.35, 0.50, 0.65].includes(parsed) ? parsed : 0.50;
            return;
        }
        if (key === 'rdsStartDisparity') {
            this.state.rdsStartDisparity = Math.max(1, Math.min(8, parseInt(value) || 4));
            return;
        }
        if (key === 'rdsScore' || key === 'rdsTotal' || key === 'rdsStreak' || key === 'rdsStaircaseStreak') {
            this.state[key] = Math.max(0, parseInt(value) || 0);
            return;
        }

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

        // Symmetrically sync RDS macro-level whenever disparity or start disparity changes
        if (key === 'rdsStartDisparity' || key === 'rdsDisparity') {
            const d = this.state[key];
            let newLvl = 1;
            if (d <= 8 && d >= 7) newLvl = 1;
            else if (d <= 6 && d >= 5) newLvl = 2;
            else if (d <= 4 && d >= 3) newLvl = 3;
            else if (d === 2) newLvl = 4;
            else if (d === 1) newLvl = 5;
            this.state.rdsLevel = newLvl;
            if (key === 'rdsStartDisparity') this.state.rdsDisparity = d;
        }

        // Trigger application routing ONLY when preset actually changes and we are in Gabor mode
        if (key === 'presetMode' && isPresetChanged && this.state.appMode === 'gabor') {
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
        this.state.synopState = 'idle';
        this.state.isPaused = false;
        this.state.savedTimerRunningState = false;
        
        // Reset active RDS session metrics symmetrically
        this.state.rdsScore = 0;
        this.state.rdsTotal = 0;
        this.state.rdsStreak = 0;
        this.state.rdsStaircaseStreak = 0;
        this.state.rdsHistory = [];
        
        // Symmetrically synchronize the active disparity threshold to the newly saved starting parameters
        this.state.rdsDisparity = this.state.rdsStartDisparity;

        // Dynamically resolve rdsLevel based on active rdsDisparity on session reset
        let resetLvl = 1;
        const rd = this.state.rdsDisparity;
        if (rd <= 8 && rd >= 7) resetLvl = 1;
        else if (rd <= 6 && rd >= 5) resetLvl = 2;
        else if (rd <= 4 && rd >= 3) resetLvl = 3;
        else if (rd === 2) resetLvl = 4;
        else if (rd === 1) resetLvl = 5;
        this.state.rdsLevel = resetLvl;
            
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

        // Symmetrical mutual exclusivity for RDS eccentricity vs pursuit
        if (lastActiveTrigger === 'rdsRandomizeVertical') {
            if (s.rdsRandomizeVertical) s.rdsIsFloating = false;
        } else if (lastActiveTrigger === 'rdsIsFloating') {
            if (s.rdsIsFloating) s.rdsRandomizeVertical = false;
        } else {
            if (s.rdsRandomizeVertical && s.rdsIsFloating) s.rdsIsFloating = false;
        }
    },

    loadSettings() {
        try {
            this.state.presetMode = localStorage.getItem('gabor_preset_mode') || 'occlusion';
            this.state.lastGaborPreset = localStorage.getItem('gabor_last_gabor_preset') || 'occlusion';
            this.state.currentLevel = parseInt(localStorage.getItem('gabor_start_level') || '1');
            this.state.autoAdvance = localStorage.getItem('gabor_autonext') !== 'false';
            this.state.sessionLimit = parseInt(localStorage.getItem('gabor_limit') || '80');
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
            
            // Unified locale bootstrapping (Bootstrap user settings or fallback to browser system language)
            const storedLang = localStorage.getItem('gabor_lang');
            if (storedLang) {
                this.state.currentLang = storedLang;
            } else {
                const supportedLanguages = ['en', 'ru'];
                const browserLang = navigator.language ? navigator.language.split('-')[0].toLowerCase() : 'en';
                this.state.currentLang = supportedLanguages.includes(browserLang) ? browserLang : 'en';
            }
            
            this.state.isPermanentCrossEnabled = localStorage.getItem('gabor_permanent_cross') === 'true';
            this.state.flankerDistanceCoeff = parseFloat(localStorage.getItem('gabor_flanker_distance_coeff') || '2.0');
            
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
            
            // Persistent RDS properties loads
            this.state.rdsLevel = Math.max(1, Math.min(5, parseInt(localStorage.getItem('gabor_rds_level') || '1')));
            this.state.rdsDotSize = parseInt(localStorage.getItem('gabor_rds_dot_size') || '4');
            this.state.rdsDensity = parseFloat(localStorage.getItem('gabor_rds_density') || '0.50');
            this.state.rdsStartDisparity = Math.max(1, Math.min(8, parseInt(localStorage.getItem('gabor_rds_start_disparity') || '4')));
            this.state.rdsAutoAdvance = localStorage.getItem('gabor_rds_autonext') !== 'false';
            this.state.rdsIsDynamic = localStorage.getItem('gabor_rds_dynamic') !== 'false';
            this.state.rdsRandomizeVertical = localStorage.getItem('gabor_rds_randomize_vertical') === 'true';
            this.state.rdsIsFloating = localStorage.getItem('gabor_rds_floating') === 'true';
            this.state.rdsFloatSpeed = localStorage.getItem('gabor_rds_float_speed') || 'medium';
            this.state.rdsIsPermanentCrossEnabled = localStorage.getItem('gabor_rds_permanent_cross') !== 'false';
            this.state.rdsSessionLimit = parseInt(localStorage.getItem('gabor_rds_session_limit') || '25');

            // Dynamically resolve active rdsLevel based on rdsDisparity on cold launch (F5)
            let initLvl = 1;
            const d = this.state.rdsDisparity;
            if (d <= 8 && d >= 7) initLvl = 1;
            else if (d <= 6 && d >= 5) initLvl = 2;
            else if (d <= 4 && d >= 3) initLvl = 3;
            else if (d === 2) initLvl = 4;
            else if (d === 1) initLvl = 5;
            this.state.rdsLevel = initLvl;
        } catch (e) {}
        
        const storedAppMode = localStorage.getItem('gabor_app_mode');
        if (storedAppMode === 'synoptophore') {
            this.state.appMode = 'synoptophore';
        } else if (storedAppMode === 'rds') {
            this.state.appMode = 'rds';
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
            
            // Persistent RDS properties saves
            localStorage.setItem('gabor_rds_level', this.state.rdsLevel.toString());
            localStorage.setItem('gabor_rds_dot_size', this.state.rdsDotSize.toString());
            localStorage.setItem('gabor_rds_density', this.state.rdsDensity.toString());
            localStorage.setItem('gabor_rds_start_disparity', this.state.rdsStartDisparity.toString());
            localStorage.setItem('gabor_rds_autonext', this.state.rdsAutoAdvance ? "true" : "false");
            localStorage.setItem('gabor_rds_dynamic', this.state.rdsIsDynamic ? "true" : "false");
            localStorage.setItem('gabor_rds_randomize_vertical', this.state.rdsRandomizeVertical ? "true" : "false");
            localStorage.setItem('gabor_rds_floating', this.state.rdsIsFloating ? "true" : "false");
            localStorage.setItem('gabor_rds_float_speed', this.state.rdsFloatSpeed);
            localStorage.setItem('gabor_rds_permanent_cross', this.state.rdsIsPermanentCrossEnabled ? "true" : "false");
            localStorage.setItem('gabor_rds_session_limit', this.state.rdsSessionLimit.toString());
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
        DataRepository.saveSession({
            sessionId: this.state.sessionId,
            score: this.state.score,
            total: this.state.total,
            level: this.state.currentLevel,
            contrast: this.state.autoContrast,
            protocol: this.state.presetMode,
            speed: this.state.flashDurationMode,
            isAnaglyph: this.state.isAnaglyphEnabled,
            balance: this.state.strongEyeContrastFactor,
            lazyEyeSide: this.state.lazyEyeSide,
            isFlicker: this.state.isFlickerEnabled,
            isCrowding: this.state.isCrowdingEnabled,
            isPeripheral: this.state.isPeripheralEnabled,
            isPermanentCross: this.state.isPermanentCrossEnabled,
            flankerDistanceCoeff: this.state.flankerDistanceCoeff
        });
    },
    getHistory() {
        return DataRepository.getSessionsForActiveUser();
    }
};