/**
 * @file clinical.ts
 * @description Single Source of Truth (SSoT) for GaborNeuroFit compile-time static type definitions.
 * Establishes strict data schemas and constraints mapped between rendering engines,
 * global state machines (FSM), and relational local databases.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

// ============================================================================
// 1. DOMAIN PRIMITIVES (Strict Type Literals)
// ============================================================================

/**
 * @description Active visual training mode representing distinct ophthalmic methodologies.
 * 
 * @clinical
 * - 'gabor': Active contrast threshold learning targeting simple cells of V1 visual cortex.
 * - 'synoptophore': Orthoptic vergence loop training targeting extraocular rectus muscles.
 * - 'rds': Random Dot Stereogram depth decoding targeting binocular disparity simple cells of V2.
 */
export type AppMode = 'gabor' | 'synoptophore' | 'rds';

/**
 * @description Lateral anatomical eye selection.
 * Used to determine left-right color channel routing and target allocation.
 */
export type EyeSide = 'left' | 'right';

/**
 * @description Presets for Gabor patch stimulation.
 * 
 * @clinical
 * - 'occlusion': Classic monocular patching of the dominant eye.
 * - 'binocular': Dichoptic contrast balancing with active binocular integration.
 * - 'flicker': Counter-phase 10Hz alpha stroboscopic pulsing to bypass interocular suppression.
 * - 'peripheral': Parafoveal visual fields eccentric stimulation.
 * - 'blitz': High-speed 100ms processing to stimulate rapid visual feedforward pathways.
 * - 'custom': Manual parameter control.
 */
export type GaborPreset = 'occlusion' | 'blitz' | 'binocular' | 'flicker' | 'peripheral' | 'custom';

/**
 * @description Visual stimulus exposure speed in milliseconds.
 * 
 * @clinical Saccadic eye movements take ~200ms to plan and execute. Flashes
 * faster than 200ms physically prevent the patient from shifting their gaze,
 * forcing orientation resolution strictly using foveal visual attention.
 */
export type FlashDurationMode = 'adaptive' | '100' | '180' | '200' | '350';

/**
 * @description Spatial configuration of lateral flanking bars surrounding the Gabor target.
 * 
 * @clinical Simulates and trains spatial crowding resolution under active
 * lateral inhibition noise, addressing the foveal crowding phenomenon in amblyopia.
 */
export type CrowdingMode = 'vertical' | 'horizontal' | 'all';

/**
 * @description States representing active motor vergence steps inside the digital Synoptophore.
 * 
 * @clinical
 * - 'idle': Inactive/curtain phase, allowing muscular relaxation.
 * - 'align': Sensory fusion phase where the patient aligns targets to their subjective squint angle.
 * - 'pulling': Motor vergence phase where targets are slowly pulled to true geometric center (0,0).
 */
export type SynopState = 'idle' | 'align' | 'pulling';

/**
 * @description Geometry of the central visual anchors used for sensory fusion.
 */
export type SynopTargetType = 'ring-dot' | 'cross-square';

/**
 * @description Speed profiles of the smooth drifting pursuit motion in RDS.
 */
export type RdsFloatSpeed = 'slow' | 'medium' | 'fast';

/**
 * @description Localized language code.
 */
export type Language = 'en' | 'ru';

// ============================================================================
// 2. APPLICATION GLOBAL STATE (Store)
// ============================================================================

/**
 * @description Global state interface containing all persistent and runtime parameters.
 * Serves as the Single Source of Truth for reactive visual, auditive, and mathematical outputs.
 */
export interface AppState {

    // --- System & Meta ---
    /** @description Unique session identifier, regenerated dynamically on critical configuration resets */
    sessionId: string;
    /** @description Active localization language code */
    currentLang: Language;
    /** @description Active therapeutic visual modality targeting distinct cortical or extraocular pathways */
    appMode: AppMode;
    /** @description Global pause lock preventing visual rendering and active timers */
    isPaused: boolean;
    /** @description Sound effects mute toggle */
    isMuted: boolean;
    /** @description Toggle for the protective foveal curtain to block light adaptation during rest */
    isCurtainActive: boolean;
    /** @description Toggle for the dichoptic alignment calibration test pattern (L/R test) */
    isAnaglyphTestActive: boolean;
    /** @description Toggle representing session finalization (via milestone or timer) to enforce a rest break before manual reset */
    isSessionCompleted: boolean;

    // --- Global Hardware & Dichoptic Calibration ---

    /**
     * @description Is 3D color-channel splitting enabled (Red/Cyan calibration).
     *
     * @clinical Transitioning from patching (occlusion) to dichoptic viewing. The
     * visual cortex (V1/V2) receives independent signals simultaneously natively simulating
     * binocular integration, bypassing physical eye covers to break interocular suppression.
     */
    isAnaglyphEnabled: boolean;
    /** @description Determines which physical eye is covered by the red filter lens */
    redEyeSide: EyeSide;
    /** @description Determines the weaker, amblyopic eye under active perceptual training */
    lazyEyeSide: EyeSide;

    /**
     * @description Contrast attenuation multiplexer for the dominant eye [0.1 to 1.0].
     *
     * @clinical Contrast Balancer. The dominant eye naturally suppresses the lazy eye.
     * By programmatically reducing the dominant eye's contrast mapping (e.g. down to 20%),
     * we artificially equalize signal strength in the cortex, forcing the brain to unblock
     * the weak eye's neural pathway to integrate the combined image.
     */
    strongEyeContrastFactor: number;
    /** @description Red channel subpixel offset for the left lens color calibration [0 to 255] */
    calibratorLeftR: number;
    /** @description Green channel subpixel offset for the right lens color calibration [0 to 255] */
    calibratorRightG: number;
    /** @description Blue channel subpixel offset for the right lens color calibration [0 to 255] */
    calibratorRightB: number;

    // --- Gabor Perceptual Learning Modality ---

    /** @description Active training preset template */
    presetMode: GaborPreset;
    /** @description Remembers the last customized preset configuration state */
    lastGaborPreset: GaborPreset;

    /**
     * @description Active difficulty stage (1 to 5).
     *
     * @clinical Represents spatial frequency (cycles per degree). Higher levels encode
     * denser, thinner Gabor lines correlating to higher visual acuity demands.
     * This pushes V1 neural networks to map smaller receptive visual fields.
     */
    currentLevel: number;

    /**
     * @description Adaptive contrast threshold generated by the staircase algorithm.
     *
     * @clinical Driving neuroplasticity requires testing visually at the absolute threshold
     * of detection. Rendering targets slightly below comfortable perceptibility triggers
     * Hebbian synaptic remodeling to boost cortical sensitivity across the weak optic nerve.
     */
    autoContrast: number;

    /** @description Number of correct responses in the active session block */
    score: number;
    /** @description Total number of stimulus presentations in the active session block */
    total: number;
    /** @description Current consecutive correct answer streak for micro-progressions */
    correctStreak: number;
    /** @description Staircase streak tracking the 3-down success requirement */
    staircaseStreak: number;

    /**
     * @description Limits visual stimulus exposure duration.
     *
     * @clinical Saccadic eye movements require ~200ms to plan and execute. Flashes
     * faster than 200ms physically prevent the patient from darting their eye to 'cheat'
     * by looking at the target with a non-suppressed peripheral retinal point.
     */
    flashDurationMode: FlashDurationMode;
    /** @description Toggles automatic progression to the next flash after a correct answer */
    autoAdvance: boolean;
    /** @description Permits the algorithm to dynamically scale levels up or down based on rolling accuracy */
    allowStageAdvance: boolean;

    /**
     * @description Toggles orthogonal lines surrounding the main foveal target.
     *
     * @clinical Lateral Visual Crowding. Amblyopic eyes suffer from severe spatial
     * crowding where adjacent details blur together. Flankers push lateral inhibition
     * networks to filter visual noise and lock onto central features.
     */
    isCrowdingEnabled: boolean;
    /** @description Direction of flanking distractors relative to the foveal target */
    crowdingMode: CrowdingMode;
    /** @description Spacing coefficient between flankers and foveal target */
    flankerDistanceCoeff: number;

    /** @description Rotates flanking bars perpendicularly to the foveal target */
    isOrthogonalFlankersEnabled: boolean;
    /** @description Runs a continuous phase wave inside the flanking bars to saturate dominant eye motion channels */
    isDynamicFlankersEnabled: boolean;

    /**
     * @description Moves the Gabor patch randomly away from the center cross.
     *
     * @clinical Re-establishes parafoveal awareness and spatial localization tracking
     * that degrades during prolonged central fixation exercises.
     */
    isPeripheralEnabled: boolean;
    /** @description Permits Gabor contrast to drop below standard 5% thresholds down to 1% */
    allowLowContrast: boolean;
    /** @description Randomizes Gabor size and density with each flash to prevent visual cortex adaptation */
    allowWideVariance: boolean;
    /** @description Squashes Gabor circular envelope to train elliptical astigmatic configurations */
    allowShapeVariance: boolean;
    /** @description Keeps the Gabor stimulus on screen permanently until an answer is submitted */
    isStaticEnabled: boolean;

    /**
     * @description Toggles 10 Hz Alpha-Resonance stroboscopic pulsing of the stimulus.
     *
     * @clinical Generates Steady-State Visually Evoked Potentials (SSVEP). 10Hz resonance
     * forcibly bypasses cortical top-down inhibition and completely eliminates Troxler's fading
     * adaptation across low-contrast stimuli.
     */
    isFlickerEnabled: boolean;
    /** @description Visual stabilization frame overlays for dichoptic alignment */
    isFusionLockEnabled: boolean;
    /** @description Retains a faded central cross during Gabor exposure to assist fixation */
    isPermanentCrossEnabled: boolean;

    // --- Synoptophore (Vergence/Strabismus) Modality ---

    /** @description Current stage of synoptophore training */
    synopState: SynopState;

    /**
     * @description Current horizontal target offset from geometric center.
     *
     * @clinical Tracks the current horizontal strabismic deviation angle
     * (esotropia / exotropia). Mathematically correlates to Prism Diopters (Δ)
     * measuring the physical extent of extraocular muscle misalignment.
     */
    synopTargetX: number;
    /** @description Current vertical target offset from geometric center (hypertropia/hypotropia) */
    synopTargetY: number;
    /** @description Saved baseline Euclidean deviation distance of the active alignment */
    synopStartDistance: number;

    /**
     * @description The interval (ms) representing the smooth motor pulling rate.
     *
     * @clinical Dictates motor vergence strain intensity. Pulling targets too fast
     * breaks ocular sensor-fusion locks. Optimal slower speeds progressively encourage
     * the extraocular muscles to adapt and maintain optical structural binocularity.
     */
    synopPullSpeed: number;
    /** @description Visual shape of the orthoptics targets */
    synopTargetType: SynopTargetType;
    /** @description Dashed coordinates guidelines for the weaker eye */
    synopShowLazyGrid: boolean;
    /** @description Dashed coordinates guidelines for the stronger eye */
    synopShowStrongGrid: boolean;
    /** @description Target scale in pixels (macular vs Paramacular vs foveal) */
    synopTargetSize: number;
    /** @description Number of successful 100% vergence pulls achieved in the session */
    synopScore: number;
    /** @description Stroboscopic alpha-resonance 10Hz pulsing on the lazy eye target */
    synopFlickerActive: boolean;
    /** @description Locks vertical movement to zero, isolating horizontal training */
    synopLockVertical: boolean;
    /** @description Locks horizontal movement to zero, isolating vertical training */
    synopLockHorizontal: boolean;
    /** @description Contrast balancer factor specific to Synoptophore mode */
    synopStrongEyeContrastFactor: number;
    /** @description Left lens color calibration factor specific to Synoptophore mode */
    synopCalibratorLeftR: number;
    /** @description Right lens green calibration factor specific to Synoptophore mode */
    synopCalibratorRightG: number;
    /** @description Right lens blue calibration factor specific to Synoptophore mode */
    synopCalibratorRightB: number;

    // --- Random Dot Stereogram (RDS) Modality ---

    /** @description Active stereopsis difficulty stage (1 to 5) */
    rdsLevel: number;

    /**
     * @description Visual size of a single noise generator cell in pixels.
     *
     * @clinical Smaller dots (2px) yield a denser stereoscopic correlation matrix.
     * Reducing macro-contrast facilitates substantially cleaner 3D binocular disparity
     * computation in V2 visual layers without introducing ghosting elements.
     */
    rdsDotSize: number;
    /** @description Ratio of filled noise dots on the screen (standard: 50%) */
    rdsDensity: number;
    /** @description Configured starting pixel displacement for the session */
    rdsStartDisparity: number;

    /**
     * @description Subpixel horizontal shift disparity mapped between the two eye channels.
     *
     * @clinical Binocular Disparity shift. Small shifts (1-2px) construct extreme micro-stereopsis.
     * Fusing a 1-pixel shift clinically demonstrates excellent stereoscopic recovery of depth
     * perception up to ~20 arcseconds of stereoscopic resolution.
     */
    rdsDisparity: number;
    /** @description Toggles automatic progression to the next stereogram trial */
    rdsAutoAdvance: boolean;
    /** @description Dynamic target allocation side for RDS task answers */
    rdsTargetSide: EyeSide;
    /** @description Number of correct depth decodings in the active session */
    rdsScore: number;
    /** @description Total number of RDS trials presented in the active session */
    rdsTotal: number;
    /** @description Active consecutive correct answer streak in RDS */
    rdsStreak: number;
    /** @description Staircase streak tracking the 3-down success requirement in RDS */
    rdsStaircaseStreak: number;
    /** @description Shuffles random noise at 18Hz to completely block monocular blinking cues */
    rdsIsDynamic: boolean;
    /** @description Randomizes the vertical offset of the target to expand spatial scanning */
    rdsRandomizeVertical: boolean;
    /** @description Active randomized vertical offset of the hidden target */
    rdsTargetY: number;
    /** @description Adds a slow, smooth pursuit drifting motion to the hidden 3D shape */
    rdsIsFloating: boolean;
    /** @description Drift rate of the floating target */
    rdsFloatSpeed: RdsFloatSpeed;
    /** @description Projects a central zero-disparity cross to assist initial fusion */
    rdsIsPermanentCrossEnabled: boolean;
    /** @description Realtime horizontal offset of the floating target */
    rdsDriftX: number;
    /** @description Realtime vertical offset of the floating target */
    rdsDriftY: number;

    // --- Session Constraints & Timers ---
    /** @description Standard Gabor session trials limit (fatigue protection) */
    sessionLimit: number;
    /** @description Standard RDS session trials limit (fatigue protection) */
    rdsSessionLimit: number;
    /** @description Pomodoro timer duration in minutes */
    timerLimitMinutes: number;
    /** @description Realtime countdown timer remaining seconds */
    timerRemainingSeconds: number;
    /** @description Timer active countdown flag */
    timerIsRunning: boolean;
    /** @description Remembers timer running state during active settings pauses */
    savedTimerRunningState: boolean;

    // --- Non-persistent Runtime Vectors ---
    /** @description True if stimulus is showing and FSM is awaiting left/right input */
    isWaitingForAnswer: boolean;
    /** @description Stores the correct/incorrect results of the last 20 Gabor trials */
    trialHistory: number[];
    /** @description Stores the correct/incorrect results of the last 20 RDS trials */
    rdsHistory: number[];
}

// ============================================================================
// 3. DATABASE REPOSITORY MODELS (Relational Entities)
// ============================================================================

/**
 * @description Core entity schema shared across all persistent local storage session records.
 * Acts as the base structural mapping for relational integrity.
 */
export interface SessionCore {
    /** @description Unique session identifier, format UUID_Date */
    id: string;
    /** @description Foreign key linking to the active patient profile UID */
    userId: string;
    /** @description Unix timestamp recorded at session initiation */
    timestamp: number;
    /** @description The specific clinical protocol algorithm used during the block */
    protocol: GaborPreset | 'synoptophore' | 'rds';
}

/**
 * @description Relational database schema representing a completed Gabor perceptual learning session.
 */
export interface GaborSession extends SessionCore {
    score: number;
    total: number;
    level: number;
    /** @description Final contrast threshold percentage achieved [1 to 100] */
    contrast: number;
    speed: FlashDurationMode;
    isAnaglyph: boolean;
    /** @description Contrast level of the dominant eye [10 to 100] */
    balance: number;
    lazyEyeSide: EyeSide;
    isFlickerEnabled: boolean;
    isCrowdingEnabled: boolean;
    isPeripheralEnabled: boolean;
    isPermanentCrossEnabled: boolean;
    flankerDistanceCoeff: number;
}

/**
 * @description Relational database schema representing a completed Synoptophore vergence training session.
 */
export interface SynoptophoreSession extends SessionCore {
    /** @description Horizontal deviation angle remaining on session termination in pixels */
    synopTargetX: number;
    /** @description Vertical deviation angle remaining on session termination in pixels */
    synopTargetY: number;
    /** @description Original starting deviation offset distance in pixels */
    synopStartDistance: number;
    /** @description Successful vergence pull or muscular slip outcome */
    synopOutcome: 'success' | 'slip';
    speed: number;
    isAnaglyph: boolean;
    balance: number;
    lazyEyeSide: EyeSide;
    synopFlickerActive: boolean;
}

/**
 * @description Relational database schema representing a completed Stereopsis RDS training session.
 */
export interface RdsSession extends SessionCore {
    score: number;
    total: number;
    level: number;
    isAnaglyph: boolean;
    balance: number;
    lazyEyeSide: EyeSide;
    rdsDotSize: number;
    rdsDensity: number;
    /** @description Final disparity threshold achieved on session termination in pixels */
    rdsDisparity: number;
}