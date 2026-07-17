/**
 * @file math.test.ts
 * @description Clinical Mathematics and Boundary Assurance suite.
 * Validates the physical constraints of psychometric staircases, 
 * toroidal noise grid algebra, and geometric vergence vectors.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../store';

describe('GaborNeuroFit Core Mathematics', () => {

    /* Context: Psychometric staircase boundary enforcement */

    describe('Adaptive Staircase Algorithm (1-up / 3-down)', () => {
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

            // Logic: 3rd consecutive success triggers contrast reduction
            Store.registerResult(true); 

            // Result (0.01) must be clamped to clinical minimum (0.05)
            expect(Store.state.autoContrast).toBe(0.05);
        });

        it('Should NEVER drop below extreme clinical threshold (0.01) in Low Contrast mode', () => {
            Store.updateState('allowLowContrast', true);
            Store.updateState('autoContrast', 0.03);
            Store.updateState('staircaseStreak', 2);

            Store.registerResult(true);

            // Clinical: Clamp guarantees 0.01 visibility to prevent total signal loss
            expect(Store.state.autoContrast).toBe(0.01);
        });

        it('Should NEVER exceed ceiling threshold (1.00) on consecutive failures', () => {
            Store.updateState('autoContrast', 0.98);
            Store.registerResult(false); 

            // Logic: 0.98 + 0.08 = 1.06, must be clamped to 1.00 physical maximum
            expect(Store.state.autoContrast).toBe(1.00);
        });

        it('Should resolve IEEE 754 floating point arithmetic safely', () => {
            Store.updateState('autoContrast', 0.15);
            Store.registerResult(false); 

            // Logic: 0.15 + 0.08 must yield exactly 0.23, bypassing 0.229999... artifacts
            expect(Store.state.autoContrast).toBe(0.23);
        });

        /** @clinical Validates the 3-down rule of the Wetherill-Levitt staircase */
        it('Should decrease contrast ONLY after 3 consecutive correct answers', () => {
            Store.updateState('autoContrast', 0.50);

            Store.registerResult(true); 
            expect(Store.state.autoContrast).toBe(0.50);

            Store.registerResult(true); 
            expect(Store.state.autoContrast).toBe(0.50);

            Store.registerResult(true); 
            expect(Store.state.autoContrast).toBe(0.45);
        });
    });

    /* Context: Toroidal wrapping algebra (Suppression of monocular cues) */

    describe('Stereoscopic Matrix Toroidal Shifting', () => {
        // Logic: Mirroring the formula used in engine/rds-render.ts
        const calculateRdsIndex = (gx: number, disparity: number, cols: number) => {
            return (gx - disparity + cols) % cols;
        };

        it('Should reliably shift pixels perfectly right-to-left within bounds', () => {
            const cols = 64;
            expect(calculateRdsIndex(32, 4, cols)).toBe(28);
        });

        /** @mathematical Verifies the torus closure to prevent array underflow */
        it('Should wrap negative spatial arrays around the toroidal geometry', () => {
            const cols = 64; 
            const disparity = 8;
            const gx = 2; // (2 - 8 + 64) % 64 = 58
            expect(calculateRdsIndex(gx, disparity, cols)).toBe(58);
        });
    });

    /* Context: Oculomotor vergence vector normalization */

    describe('Vergence Progress Normalization', () => {
        const calcMuscleContractionProgress = (currentDist: number, startDist: number) => {
            if (startDist <= 0) return 0;
            return Math.max(0, Math.min(100, Math.round(100 * (1 - currentDist / startDist))));
        };

        it('Should accurately evaluate Euclidean distance into contraction percentage', () => {
            expect(calcMuscleContractionProgress(15, 30)).toBe(50);
        });

        it('Should clamp muscle progress to 100% and avoid overflow upon center capture', () => {
            expect(calcMuscleContractionProgress(0, 20)).toBe(100);
        });

        /** @clinical Ensures backward slips do not corrupt database charts */
        it('Should clamp backward slipping vectors to 0% progress', () => {
            expect(calcMuscleContractionProgress(25, 20)).toBe(0);
        });

        it('Should defensively block division by zero exceptions', () => {
            expect(calcMuscleContractionProgress(0, 0)).toBe(0);
        });
    });
});