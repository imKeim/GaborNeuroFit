/*
 * GaborNeuroFit - Clinical Mathematics & Boundaries Assurance
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This test suite strictly verifies the physical boundaries of physiological
 * calculations: psychometric staircases, toriodal arrays, and geometric vectors.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../store';

describe('GaborNeuroFit Core Mathematics', () => {

    // ============================================================================
    // 1. GABOR SENSORY STAIRCASE BOUNDARIES
    // ============================================================================
    describe('Adaptive Psychometric Staircase (1-up / 3-down)', () => {
        beforeEach(() => {
            Store.state.score = 0;
            Store.state.total = 0;
            Store.state.autoContrast = 0.50;
            Store.state.correctStreak = 0;
            Store.state.staircaseStreak = 0;
            Store.state.currentLevel = 1;
            Store.state.trialHistory = [];
        });

        it('Should NEVER drop below standard absolute threshold (0.05) by default', () => {
            Store.updateState('allowLowContrast', false);
            Store.updateState('autoContrast', 0.06);
            Store.updateState('staircaseStreak', 2);

            Store.registerResult(true); // 3rd success drops contrast by 0.05

            // 0.06 - 0.05 = 0.01, BUT clamp should force it back to 0.05
            expect(Store.state.autoContrast).toBe(0.05);
        });

        it('Should NEVER drop below extreme clinical threshold (0.01) in Low Contrast mode', () => {
            Store.updateState('allowLowContrast', true);
            Store.updateState('autoContrast', 0.03);
            Store.updateState('staircaseStreak', 2);

            Store.registerResult(true);

            // 0.03 - 0.05 = -0.02, BUT clamp guarantees 0.01 (preventing total invisibility/NaN shaders)
            expect(Store.state.autoContrast).toBe(0.01);
        });

        it('Should NEVER exceed ceiling threshold (1.00) on consecutive failures', () => {
            Store.updateState('autoContrast', 0.98);

            Store.registerResult(false); // Failure adds +0.08

            // 0.98 + 0.08 = 1.06, BUT clamp enforces 1.00 max physical contrast
            expect(Store.state.autoContrast).toBe(1.00);
        });

        it('Should resolve IEEE 754 floating point arithmetic safely', () => {
            Store.updateState('autoContrast', 0.15);
            Store.registerResult(false); // +0.08

            // JS normally renders 0.15 + 0.08 as 0.22999999999999998
            // The clinically safe rounding mechanism should yield exactly 0.23
            expect(Store.state.autoContrast).toBe(0.23);
        });

        it('Should decrease contrast ONLY after 3 consecutive correct answers (3-down rule)', () => {
            Store.updateState('autoContrast', 0.50);

            Store.registerResult(true); // 1st success, contrast remains 0.50
            expect(Store.state.autoContrast).toBe(0.50);

            Store.registerResult(true); // 2nd success, contrast remains 0.50
            expect(Store.state.autoContrast).toBe(0.50);

            Store.registerResult(true); // 3rd success -> triggers contrast drop (-0.05)
            expect(Store.state.autoContrast).toBe(0.45);
            expect(Store.state.staircaseStreak).toBe(0); // Streak resets after execution
        });

        it('Should advance macro difficulty stage if rolling accuracy is >= 85% over 20 trials', () => {
            Store.updateState('currentLevel', 1);
            Store.updateState('autoContrast', 0.50);

            // Simulate 20 consecutive correct answers
            for (let i = 0; i < 20; i++) {
                Store.registerResult(true);
            }

            // Stage difficulty should automatically advance from 1 to 2
            expect(Store.state.currentLevel).toBe(2);
            // Contrast resets to tighter baseline for the new harder stage
            expect(Store.state.autoContrast).toBe(0.40);
        });
    });

    // ============================================================================
    // 2. RDS TOROIDAL SHIFT ALGEBRA (No-Ghosting Mechanism)
    // ============================================================================
    describe('Stereoscopic Matrix Toroidal Shifting', () => {
        // Pure function matching the formula used in engine/rds-render.ts
        const calculateRdsIndex = (gx: number, disparity: number, cols: number) => {
            return (gx - disparity + cols) % cols;
        };

        it('Should reliably shift pixels perfectly right-to-left within bounds', () => {
            const cols = 64;
            let gx = 32;
            let disparity = 4;
            expect(calculateRdsIndex(gx, disparity, cols)).toBe(28);
        });

        it('Should correctly wrap negative spatial arrays around the toroidal geometry (Prevent Array Underflow)', () => {
            const cols = 64; // Grid size
            const disparity = 8; // Deep stereopsis
            const gx = 2; // Close to left edge

            // 2 - 8 = -6. Without (+ cols), JS modulo yields -6.
            // With clinical toroidal wrapping: (-6 + 64) % 64 = 58 (Wrapped gracefully to right edge)
            expect(calculateRdsIndex(gx, disparity, cols)).toBe(58);
        });
    });

    // ============================================================================
    // 3. SYNOPTOPHORE MOTOR KINEMATICS
    // ============================================================================
    describe('Vergence Vector Normalization', () => {
        // Pure function representing the engine's percent evaluation
        const calcMuscleContractionProgress = (currentDist: number, startDist: number) => {
            if (startDist <= 0) return 0;
            return Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));
        };

        it('Should accurately evaluate Euclidean distance into normalized Prism Diopter percentage', () => {
            const startDist = 30; // 30px lateral strabismic deviation
            const currentDist = 15; // Pulled exactly halfway to neutral
            expect(calcMuscleContractionProgress(currentDist, startDist)).toBe(50); // 50% physical recovery
        });

        it('Should clamp muscle progress to 100% and avoid overflow upon reaching zero', () => {
            const startDist = 20;
            const currentDist = 0; // Absolute optical center
            expect(calcMuscleContractionProgress(currentDist, startDist)).toBe(100);
        });

        it('Should clamp backward slipping vectors to 0% and NEVER return negative progress', () => {
            const startDist = 20;
            const currentDist = 25; // Eye slipped further OUTWARD than the initial calibration

            // Unclamped this would be -25%, which breaks database charts. Clamp enforces 0%.
            expect(calcMuscleContractionProgress(currentDist, startDist)).toBe(0);
        });

        it('Should defensively block division by zero (Infinity exceptions) when distances collapse', () => {
            const startDist = 0; // Edge case: User clicked "LOCK" without shifting target
            const currentDist = 0;
            expect(calcMuscleContractionProgress(currentDist, startDist)).toBe(0);
        });
    });
});