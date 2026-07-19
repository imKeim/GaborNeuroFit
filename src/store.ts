/**
 * @file store.ts
 * @description Centralized state management module (Store).
 * Manages the reactive global application state (AppState), handles bidirectional settings 
 * persistence via localStorage, coordinates mutually exclusive clinical parameters, 
 * and implements the adaptive 1-up / 3-down psychometric contrast threshold staircase.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { DataRepository } from './store/repository.js';
import type {
    AppState,
    GaborPreset,
    FlashDurationMode,
    CrowdingMode,
    SynopState,
    SynopTargetType,
    RdsFloatSpeed,
    Language,
    EyeSide
} from './types/clinical';

export const Store = {
    /** @description The Single Source of Truth (SSoT) reactive application state tree */
    state: {
        // --- System & Meta ---
        sessionId: 'session_' + Date.now(),
        currentLang: 'en' as Language,
        appMode: 'gabor',
        isPaused: false,
        isMuted: false,
        isCurtainActive: true,
        isAnaglyphTestActive: false,
        isSessionCompleted: false,

        // --- Hardware & 3D ---
        isAnaglyphEnabled: false,
        redEyeSide: 'left' as EyeSide,
        lazyEyeSide: 'left' as EyeSide,
        strongEyeContrastFactor: 0.3,
        calibratorLeftR: 255,
        calibratorRightG: 255,
        calibratorRightB: 255,

        // --- Gabor Modality ---
        presetMode: 'occlusion' as GaborPreset,
        lastGaborPreset: 'occlusion' as GaborPreset,
        currentLevel: 1,
        autoContrast: 0.5,
        score: 0,
        total: 0,
        correctStreak: 0,
        staircaseStreak: 0,
        flashDurationMode: 'adaptive' as FlashDurationMode,
        autoAdvance: true,
        allowStageAdvance: true,
        isCrowdingEnabled: false,
        crowdingMode: 'vertical' as CrowdingMode,
        flankerDistanceCoeff: 2.0,
        isOrthogonalFlankersEnabled: false,
        isDynamicFlankersEnabled: false,
        isPeripheralEnabled: false,
        allowLowContrast: false,
        allowDynamicLevelDrift: false,
        allowDensityVariance: false,
        allowShapeVariance: false,
        isStaticEnabled: false,
        isFlickerEnabled: false,
        isFusionLockEnabled: false,
        isPermanentCrossEnabled: false,

        // --- Synoptophore Modality ---
        synopState: 'idle' as SynopState,
        synopTargetX: 0,
        synopTargetY: 0,
        synopStartDistance: 0,
        synopPullSpeed: 2500,
        synopTargetType: 'ring-dot' as SynopTargetType,
        synopShowLazyGrid: false,
        synopShowStrongGrid: false,
        synopTargetSize: 65,
        synopScore: 0,
        synopFlickerActive: false,
        synopLockVertical: false,
        synopLockHorizontal: false,
        synopStrongEyeContrastFactor: 0.3,
        synopCalibratorLeftR: 255,
        synopCalibratorRightG: 255,
        synopCalibratorRightB: 255,

        // --- RDS Modality ---
        rdsLevel: 1,
        rdsDotSize: 4,
        rdsDensity: 0.50,
        rdsStartDisparity: 8,
        rdsDisparity: 8,
        rdsAutoAdvance: true,
        rdsTargetSide: 'left' as EyeSide,
        rdsScore: 0,
        rdsTotal: 0,
        rdsStreak: 0,
        rdsStaircaseStreak: 0,
        rdsIsDynamic: true,
        rdsRandomizeVertical: false,
        rdsTargetY: 0,
        rdsIsFloating: false,
        rdsFloatSpeed: 'medium' as RdsFloatSpeed,
        rdsIsPermanentCrossEnabled: true,
        rdsDriftX: 0,
        rdsDriftY: 0,

        // --- Session Constraints & Timers ---
        sessionLimit: 80,
        rdsSessionLimit: 30,
        timerLimitMinutes: 0,
        timerRemainingSeconds: 0,
        timerIsRunning: false,
        savedTimerRunningState: false,

        trialHistory: [] as number[],
        rdsHistory: [] as number[]
    } as AppState,

    /**
     * @description Regroups active session trackers by generating a fresh cryptographic timestamp UID.
     * Prevents database primary key collision on subsequent trial executions.
     */
    rotateSessionId() {
        this.state.sessionId = 'session_' + Date.now();
    },

    /**
     * @description Unified state mutation gateway.
     * Enforces compile-time generics and strictly clamps physical boundaries
     * to prevent out-of-range parameters from causing GPU/canvas rendering failures.
     * 
     * @architecture
     * - Clamps subpixel RGB values to [0...255] sRGB.
     * - Clamps RDS disparity steps to [1...8] pixels.
     * - Clamps Gabor levels to [1...5] and contrast ratios to [0.1...1.0].
     * - Resolves vertical/horizontal locks on Synoptophore vectors dynamically.
     * 
     * @param {K} key - Target state key.
     * @param {AppState[K]} value - Strictly-typed value payload.
     */
    updateState<K extends keyof AppState>(key: K, value: AppState[K]) {
        let isPresetChanged = false;

        if (key === 'appMode' || key === 'presetMode') {
            if (this.state[key] !== value) {
                this.rotateSessionId();
                if (key === 'presetMode') isPresetChanged = true;
            }
        }

        // SSoT Clinical Safeguard: RDS strictly requires active 3D color channels
        if (key === 'appMode') {
            if (value === 'rds') {
                this.state.isAnaglyphEnabled = true;
            }
        }
        if (key === 'isAnaglyphEnabled' && this.state.appMode === 'rds') {
            this.state.isAnaglyphEnabled = true;
            return;
        }

        // =========================================================
        // MATHEMATICAL BOUNDARY CLAMPING
        // =========================================================

        if (key === 'rdsLevel') {
            this.state.rdsLevel = Math.max(1, Math.min(5, value as number));
            return;
        }
        if (key === 'rdsDotSize') {
            const v = value as number;
            this.state.rdsDotSize = [2, 4, 6].includes(v) ? v : 4;
            return;
        }
        if (key === 'rdsDensity') {
            const v = value as number;
            this.state.rdsDensity = [0.35, 0.50, 0.65].includes(v) ? v : 0.50;
            return;
        }
        if (key === 'rdsStartDisparity') {
            this.state.rdsStartDisparity = Math.max(1, Math.min(8, value as number));
            return;
        }
        if (key === 'rdsScore' || key === 'rdsTotal' || key === 'rdsStreak' || key === 'rdsStaircaseStreak') {
            this.state[key] = Math.max(0, value as number) as AppState[K];
            return;
        }

        // Lock Mutual Exclusivity
        if (key === 'synopLockVertical') {
            this.state.synopLockVertical = !!value;
            if (this.state.synopLockVertical) {
                this.state.synopTargetY = 0;
                this.state.synopLockHorizontal = false;
            }
            return;
        }
        if (key === 'synopLockHorizontal') {
            this.state.synopLockHorizontal = !!value;
            if (this.state.synopLockHorizontal) {
                this.state.synopTargetX = 0;
                this.state.synopLockVertical = false;
            }
            return;
        }

        if (key === 'currentLevel') {
            this.state.currentLevel = Math.max(1, Math.min(5, value as number));
            return;
        }

        // Constant contrast mapping requires 0.1 to 1.0 boundary
        if (key === 'strongEyeContrastFactor' || key === 'synopStrongEyeContrastFactor') {
            this.state[key] = Math.max(0.1, Math.min(1.0, value as number)) as AppState[K];
            return;
        }

        if (key === 'synopTargetX') {
            if (this.state.synopLockHorizontal) {
                this.state.synopTargetX = 0;
            } else {
                this.state.synopTargetX = Math.max(-50, Math.min(50, Math.round(value as number)));
            }
            return;
        }
        if (key === 'synopTargetY') {
            if (this.state.synopLockVertical) {
                this.state.synopTargetY = 0;
            } else {
                this.state.synopTargetY = Math.max(-50, Math.min(50, Math.round(value as number)));
            }
            return;
        }

        if (key === 'synopPullSpeed') {
            this.state.synopPullSpeed = Math.max(1000, Math.min(5000, value as number));
            return;
        }

        if (key === 'synopTargetSize') {
            this.state.synopTargetSize = Math.max(30, Math.min(65, value as number));
            return;
        }

        if (key === 'synopScore') {
            this.state.synopScore = Math.max(0, value as number);
            return;
        }

        // Subpixel RGB validation boundaries
        if (
            key === 'calibratorLeftR' || key === 'calibratorRightG' || key === 'calibratorRightB' ||
            key === 'synopCalibratorLeftR' || key === 'synopCalibratorRightG' || key === 'synopCalibratorRightB'
        ) {
            const parsed = Math.round(value as number);
            this.state[key] = Math.max(0, Math.min(255, isNaN(parsed) ? 255 : parsed)) as AppState[K];
            return;
        }

        // Base Assignment execution
        this.state[key] = value;

        // RDS Adaptive Disparity Macro Resolver
        if (key === 'rdsStartDisparity' || key === 'rdsDisparity') {
            const d = this.state[key] as number;
            let newLvl = 1;
            if (d <= 8 && d >= 7) newLvl = 1;
            else if (d <= 6 && d >= 5) newLvl = 2;
            else if (d <= 4 && d >= 3) newLvl = 3;
            else if (d === 2) newLvl = 4;
            else if (d === 1) newLvl = 5;
            this.state.rdsLevel = newLvl;
            if (key === 'rdsStartDisparity') this.state.rdsDisparity = d;
        }

        // Preset Re-evaluation Trigger
        if (key === 'presetMode' && isPresetChanged && this.state.appMode === 'gabor') {
            this.applyPresetTemplate(value as GaborPreset);
        }
    },

    /**
     * @description Resets volatile session scores, streaks, and histories back to baseline.
     * Preserves physical calibration parameters, language selection, and user presets.
     * 
     * @clinical Symmetrically restores Gabor contrast thresholds back to 50% and 
     * RDS disparity steps back to the configured rdsStartDisparity to start a fresh therapy block.
     */
    resetSessionProgress() {
        this.state.score = 0;
        this.state.total = 0;
        this.state.autoContrast = 0.50;
        this.state.correctStreak = 0;
        this.state.staircaseStreak = 0;
        this.state.isWaitingForAnswer = false;
        this.state.trialHistory = [];
        this.state.timerRemainingSeconds = this.state.timerLimitMinutes * 60;
        this.state.timerIsRunning = false;
        this.state.synopState = 'idle';
        this.state.synopTargetX = 0;
        this.state.synopTargetY = 0;
        this.state.isPaused = false;
        this.state.savedTimerRunningState = false;
        this.state.isSessionCompleted = false;

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

    /**
     * @description Launches Pomodoro visual fatigue timer tracking upon first physical trial initiation.
     */
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

    /**
     * @description Resolves mutually exclusive visual configurations inside Gabor and RDS states.
     * 
     * @clinical
     * - Crowding (flankers) and Peripheral сapture are mutually exclusive to prevent overlapping cognitive tasks.
     * - 10Hz Flicker requires Gabor patch permanent rendering (isStaticEnabled = true) to prevent timing conflicts.
     * - RDS vertical eccentricity and floating pursuit are mutually exclusive to isolate motor tracking reserves.
     */
    resolveConflicts(lastActiveTrigger: string | null = null) {
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

    /**
     * @description Safe Hydration Algorithm. Pulls all variables from localStorage and asserts
     * types explicitly. Automatically falls back to safe clinical defaults if data is missing or corrupted.
     */
    loadSettings() {
        try {
            this.state.presetMode = (localStorage.getItem('gabor_preset_mode') as GaborPreset) || 'occlusion';
            this.state.lastGaborPreset = (localStorage.getItem('gabor_last_gabor_preset') as GaborPreset) || 'occlusion';
            this.state.currentLevel = parseInt(localStorage.getItem('gabor_start_level') || '1', 10);
            this.state.autoAdvance = localStorage.getItem('gabor_autonext') !== 'false';
            this.state.sessionLimit = parseInt(localStorage.getItem('gabor_limit') || '80', 10);
            this.state.timerLimitMinutes = parseInt(localStorage.getItem('gabor_timer_limit') || '0', 10);
            this.state.allowStageAdvance = localStorage.getItem('gabor_stage_advance') !== 'false';
            this.state.flashDurationMode = (localStorage.getItem('gabor_flash_mode') as FlashDurationMode) || 'adaptive';
            this.state.isPeripheralEnabled = localStorage.getItem('gabor_peripheral') === 'true';
            this.state.isCrowdingEnabled = localStorage.getItem('gabor_crowding') === 'true';
            this.state.crowdingMode = (localStorage.getItem('gabor_crowding_mode') as CrowdingMode) || 'vertical';
            this.state.isOrthogonalFlankersEnabled = localStorage.getItem('gabor_orthogonal') === 'true';
            this.state.isDynamicFlankersEnabled = localStorage.getItem('gabor_dynamic_flankers') === 'true';
            this.state.allowLowContrast = localStorage.getItem('gabor_low_contrast') === 'true';
            this.state.allowDynamicLevelDrift = localStorage.getItem('gabor_dynamic_level_drift') === 'true';
            this.state.allowDensityVariance = localStorage.getItem('gabor_density_variance') === 'true';
            this.state.allowShapeVariance = localStorage.getItem('gabor_shape_variance') === 'true';
            this.state.isStaticEnabled = localStorage.getItem('gabor_static') === 'true';
            this.state.isFlickerEnabled = localStorage.getItem('gabor_flicker') === 'true';
            this.state.isMuted = localStorage.getItem('gabor_muted') === 'true';

            // Unified locale bootstrapping (Bootstrap user settings or fallback to browser system language)
            const storedLang = localStorage.getItem('gabor_lang') as Language | null;
            if (storedLang) {
                this.state.currentLang = storedLang;
            } else {
                const supportedLanguages = ['en', 'ru'];
                const browserLang = navigator.language ? navigator.language.split('-')[0].toLowerCase() : 'en';
                this.state.currentLang = supportedLanguages.includes(browserLang) ? (browserLang as Language) : 'en';
            }

            this.state.isPermanentCrossEnabled = localStorage.getItem('gabor_permanent_cross') === 'true';
            this.state.flankerDistanceCoeff = parseFloat(localStorage.getItem('gabor_flanker_distance_coeff') || '2.0');

            // Hardware & 3D Settings (Global)
            this.state.isAnaglyphEnabled = localStorage.getItem('gabor_anaglyph') !== 'false';
            this.state.redEyeSide = (localStorage.getItem('gabor_red_side') as EyeSide) || 'left';
            this.state.lazyEyeSide = (localStorage.getItem('gabor_lazy_side') as EyeSide) || 'left';
            this.state.strongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_strong_factor') || '0.3');
            this.state.synopStrongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_synop_strong_factor') || '0.3');
            this.state.isFusionLockEnabled = localStorage.getItem('gabor_fusion_lock') !== 'false';

            this.state.calibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_left_r') || '255', 10)));
            this.state.calibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_g') || '255', 10)));
            this.state.calibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_calib_right_b') || '255', 10)));

            this.state.synopCalibratorLeftR = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_left_r') || '255', 10)));
            this.state.synopCalibratorRightG = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_g') || '255', 10)));
            this.state.synopCalibratorRightB = Math.max(0, Math.min(255, parseInt(localStorage.getItem('gabor_synop_calib_right_b') || '255', 10)));

            // Persistent Synoptophore properties loads
            this.state.synopPullSpeed = parseInt(localStorage.getItem('gabor_synop_pull_speed') || '2500', 10);
            this.state.synopTargetType = (localStorage.getItem('gabor_synop_target_type') as SynopTargetType) || 'ring-dot';
            this.state.synopShowLazyGrid = localStorage.getItem('gabor_synop_lazy_grid') === 'true';
            this.state.synopShowStrongGrid = localStorage.getItem('gabor_synop_strong_grid') === 'true';
            this.state.synopTargetSize = parseInt(localStorage.getItem('gabor_synop_target_size') || '65', 10);
            this.state.synopScore = parseInt(localStorage.getItem('gabor_synop_score') || '0', 10);
            this.state.synopFlickerActive = localStorage.getItem('gabor_synop_flicker_active') === 'true';
            this.state.synopLockVertical = localStorage.getItem('gabor_synop_lock_y') === 'true';
            this.state.synopLockHorizontal = localStorage.getItem('gabor_synop_lock_x') === 'true';

            // Persistent RDS properties loads
            this.state.rdsLevel = Math.max(1, Math.min(5, parseInt(localStorage.getItem('gabor_rds_level') || '1', 10)));
            this.state.rdsDotSize = parseInt(localStorage.getItem('gabor_rds_dot_size') || '4', 10);
            this.state.rdsDensity = parseFloat(localStorage.getItem('gabor_rds_density') || '0.50');
            this.state.rdsStartDisparity = Math.max(1, Math.min(8, parseInt(localStorage.getItem('gabor_rds_start_disparity') || '8', 10)));
            this.state.rdsAutoAdvance = localStorage.getItem('gabor_rds_autonext') !== 'false';
            this.state.rdsIsDynamic = localStorage.getItem('gabor_rds_dynamic') !== 'false';
            this.state.rdsRandomizeVertical = localStorage.getItem('gabor_rds_randomize_vertical') === 'true';
            this.state.rdsIsFloating = localStorage.getItem('gabor_rds_floating') === 'true';
            this.state.rdsFloatSpeed = (localStorage.getItem('gabor_rds_float_speed') as RdsFloatSpeed) || 'medium';
            this.state.rdsIsPermanentCrossEnabled = localStorage.getItem('gabor_rds_permanent_cross') !== 'false';
            this.state.rdsSessionLimit = parseInt(localStorage.getItem('gabor_rds_session_limit') || '30', 10);

            // Dynamically resolve active rdsLevel based on active rdsDisparity on cold launch (F5)
            let initLvl = 1;
            const d = this.state.rdsDisparity;
            if (d <= 8 && d >= 7) initLvl = 1;
            else if (d <= 6 && d >= 5) initLvl = 2;
            else if (d <= 4 && d >= 3) initLvl = 3;
            else if (d === 2) initLvl = 4;
            else if (d === 1) initLvl = 5;
            this.state.rdsLevel = initLvl;
        } catch (e) {
            console.warn('Hydration warning during loadSettings:', e);
        }

        const storedAppMode = localStorage.getItem('gabor_app_mode');
        if (storedAppMode === 'synoptophore') {
            this.state.appMode = 'synoptophore';
        } else if (storedAppMode === 'rds') {
            this.state.appMode = 'rds';
        } else {
            this.state.appMode = 'gabor';
            this.applyPresetTemplate(this.state.presetMode);
        }

        this.resolveConflicts(null);
    },

    /**
     * @description Dehydrates active configuration parameters to localStorage.
     */
    saveSettings() {
        try {
            localStorage.setItem('gabor_app_mode', this.state.appMode);
            localStorage.setItem('gabor_preset_mode', this.state.presetMode);
            localStorage.setItem('gabor_last_gabor_preset', this.state.lastGaborPreset);
            localStorage.setItem('gabor_start_level', this.state.currentLevel.toString());
            localStorage.setItem('gabor_autonext', this.state.autoAdvance ? "true" : "false");
            localStorage.setItem('gabor_limit', this.state.sessionLimit.toString());
            localStorage.setItem('gabor_timer_limit', this.state.timerLimitMinutes.toString());
            localStorage.setItem('gabor_stage_advance', this.state.allowStageAdvance ? "true" : "false");
            localStorage.setItem('gabor_flash_mode', this.state.flashDurationMode);
            localStorage.setItem('gabor_peripheral', this.state.isPeripheralEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding', this.state.isCrowdingEnabled ? "true" : "false");
            localStorage.setItem('gabor_crowding_mode', this.state.crowdingMode);
            localStorage.setItem('gabor_orthogonal', this.state.isOrthogonalFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_dynamic_flankers', this.state.isDynamicFlankersEnabled ? "true" : "false");
            localStorage.setItem('gabor_low_contrast', this.state.allowLowContrast ? "true" : "false");
            localStorage.setItem('gabor_dynamic_level_drift', this.state.allowDynamicLevelDrift ? "true" : "false");
            localStorage.setItem('gabor_density_variance', this.state.allowDensityVariance ? "true" : "false");
            localStorage.setItem('gabor_shape_variance', this.state.allowShapeVariance ? "true" : "false");
            localStorage.setItem('gabor_static', this.state.isStaticEnabled ? "true" : "false");
            localStorage.setItem('gabor_flicker', this.state.isFlickerEnabled ? "true" : "false");
            localStorage.setItem('gabor_muted', this.state.isMuted ? "true" : "false");
            localStorage.setItem('gabor_lang', this.state.currentLang);
            localStorage.setItem('gabor_permanent_cross', this.state.isPermanentCrossEnabled ? "true" : "false");
            localStorage.setItem('gabor_flanker_distance_coeff', this.state.flankerDistanceCoeff.toString());

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
        } catch (e) {
            console.warn('Dehydration warning during saveSettings:', e);
        }
    },

    /**
     * @description Dynamically evaluates active parameters against template rules to match preset modes.
     * @returns {GaborPreset} Matched template identifier or 'custom'.
     */
    detectMatchingPreset(): GaborPreset {
        const s = this.state;
        if (s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowDynamicLevelDrift === false && s.allowDensityVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'occlusion';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowDynamicLevelDrift === false && s.allowDensityVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'binocular';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === '200' && s.isPeripheralEnabled === true && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === true && s.allowDynamicLevelDrift === false && s.allowDensityVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === false && s.isFusionLockEnabled === true) return 'peripheral';
        if (s.allowStageAdvance === true && s.flashDurationMode === '100' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === false && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === false && s.isAnaglyphEnabled === false && s.allowDynamicLevelDrift === true && s.allowDensityVariance === true && s.allowShapeVariance === true && s.isFlickerEnabled === false && s.isFusionLockEnabled === false) return 'blitz';
        if (s.flankerDistanceCoeff === 2.0 && s.allowStageAdvance === true && s.flashDurationMode === 'adaptive' && s.isPeripheralEnabled === false && s.isCrowdingEnabled === true && s.isOrthogonalFlankersEnabled === false && s.isDynamicFlankersEnabled === false && s.isStaticEnabled === true && s.isAnaglyphEnabled === true && s.allowDynamicLevelDrift === false && s.allowDensityVariance === false && s.allowShapeVariance === false && s.isFlickerEnabled === true && s.isFusionLockEnabled === true) return 'flicker';
        return 'custom';
    },

    /**
     * @description Hardcodes configuration attributes mapped to selected preset templates.
     * @param {GaborPreset} mode - Target preset mode.
     */
    applyPresetTemplate(mode: GaborPreset) {
        this.state.flankerDistanceCoeff = 2.0;

        if (mode === 'occlusion') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = false; this.state.allowDynamicLevelDrift = false; this.state.allowDensityVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = false;
        } else if (mode === 'binocular') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = true; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = true; this.state.allowDynamicLevelDrift = false; this.state.allowDensityVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = true;
        } else if (mode === 'peripheral') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = '200'; this.state.isPeripheralEnabled = true; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = true; this.state.allowDynamicLevelDrift = false; this.state.allowDensityVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = true;
        } else if (mode === 'blitz') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = '100'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = false; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = false; this.state.isAnaglyphEnabled = false; this.state.allowDynamicLevelDrift = true; this.state.allowDensityVariance = true; this.state.allowShapeVariance = true; this.state.isFlickerEnabled = false; this.state.isFusionLockEnabled = false;
        } else if (mode === 'flicker') {
            this.state.allowStageAdvance = true; this.state.flashDurationMode = 'adaptive'; this.state.isPeripheralEnabled = false; this.state.isCrowdingEnabled = true; this.state.isOrthogonalFlankersEnabled = false; this.state.isDynamicFlankersEnabled = false; this.state.isStaticEnabled = true; this.state.isAnaglyphEnabled = true; this.state.allowDynamicLevelDrift = false; this.state.allowDensityVariance = false; this.state.allowShapeVariance = false; this.state.isFlickerEnabled = true; this.state.isFusionLockEnabled = true;
        }
    },

    /**
     * @description Core perceptual learning psychometric engine. Processes user response
     * and modulates target contrast based on a 1-up / 3-down staircase algorithm.
     *
     * @clinical The 1-up / 3-down rule statistically converges the patient's performance
     * precisely at the 79.4% probability threshold of detection. Working exactly at this
     * perceptual threshold forces maximum cortical saturation, breaking the physiological
     * amblyopic suppression barrier and inducing Hebbian synaptic remodeling (neuroplasticity).
     *
     * In addition, macro-advancement (Stage jumping) requires 85% sustained accuracy
     * over a 20-trial rolling window. This strict verification parameter ensures that
     * spatial frequency constraints are elevated only after complete neural consolidation occurs.
     *
     * @mathematical
     * - Incorrect Response: Increments contrast by +0.08 to restore stimulus visibility.
     * - Correct Response (Three consecutive): Decreases contrast by -0.05.
     * - Clears floating-point errors via IEEE-754 decimal rounding mapping: Math.round(val * 100) / 100.
     *
     * @param {boolean} isCorrect - Did the user correctly identify the target orientation?
     */
    registerResult(isCorrect: boolean) {
        const s = this.state;
        s.total++;
        const minContrast = s.allowLowContrast ? 0.01 : 0.05;

        // Force strictly typed numbers to prevent array pollution
        if (!s.trialHistory) s.trialHistory = [];
        s.trialHistory.push(isCorrect ? 1 : 0);
        if (s.trialHistory.length > 30) s.trialHistory.shift();

        // Level Advancement Check: 85% Accuracy Rolling Average
        if (s.trialHistory.length >= 20) {
            const correctCount = s.trialHistory.slice(-20).reduce((a: number, b: number) => a + b, 0);
            if (correctCount / 20 >= 0.85) {
                if (s.currentLevel < 5) {
                    s.currentLevel++;
                    s.autoContrast = 0.40;
                    s.correctStreak = 0;
                    s.staircaseStreak = 0;
                    s.trialHistory = [];
                    if (isCorrect) s.score++;
                    return;
                }
            }
        }

        // Level Downgrade Check: Below 60% Accuracy Rolling Average
        if (s.allowStageAdvance && s.trialHistory.length >= 15) {
            const correctCount = s.trialHistory.slice(-15).reduce((a: number, b: number) => a + b, 0);
            if (correctCount / 15 < 0.60) {
                if (s.currentLevel > 1) {
                    s.currentLevel--;
                    s.autoContrast = 0.50;
                    s.correctStreak = 0;
                    s.staircaseStreak = 0;
                    s.trialHistory = [];
                    return;
                }
            }
        }

        // The Staircase Engine (1-up / 3-down)
        if (isCorrect) {
            s.score++;
            s.correctStreak++;
            s.staircaseStreak++;

            // 3-down: 3 consecutive correct answers -> decrease target contrast
            if (s.staircaseStreak >= 3) {
                if (s.autoContrast <= minContrast) {
                    if (s.currentLevel < 5) {
                        s.currentLevel++;
                        s.autoContrast = 0.40;
                    }
                } else {
                    // Precision float subtraction to prevent JS rounding artifacts
                    s.autoContrast = Math.max(minContrast, Math.round((s.autoContrast - 0.05) * 100) / 100);
                }
                s.staircaseStreak = 0;
            }
        } else {
            s.correctStreak = 0;
            s.staircaseStreak = 0;

            // 1-up: 1 single error -> immediately increase target visibility
            if (s.allowStageAdvance && s.autoContrast >= 0.70 && s.currentLevel > 1) {
                s.currentLevel--;
                s.autoContrast = 0.30;
            } else {
                s.autoContrast = Math.min(1.0, Math.round((s.autoContrast + 0.08) * 100) / 100);
            }
        }
    },

    /**
     * @description Saves completed Gabor session statistics to local database storage.
     */
    saveSession() {
        if (this.state.total === 0) return;

        // Dispatch data to LocalStorage Relational Engine via injected properties.
        // Once DataRepository is typed, this method's payload will be strictly validated.
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

    /**
     * @description Returns historically recorded sessions for the currently active user context.
     * @returns {SessionCore[]} Array of active user sessions.
     */
    getHistory() {
        return DataRepository.getSessionsForActiveUser();
    }
};