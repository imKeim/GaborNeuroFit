import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from './store.js';

describe('GaborNeuroFit - Adaptive Staircase Math', () => {
    // Reset the global state to baseline before executing each test scenario
    beforeEach(() => {
        Store.state.score = 0;
        Store.state.total = 0;
        Store.state.autoContrast = 0.50;
        Store.state.correctStreak = 0;
        Store.state.staircaseStreak = 0;
        Store.state.currentLevel = 1;
        Store.state.trialHistory = [];
    });

    it('should initialize with correct default optometric values', () => {
        expect(Store.state.autoContrast).toBe(0.50);
        expect(Store.state.currentLevel).toBe(1);
    });

    it('should increase contrast on incorrect user answer (1-up rule)', () => {
        Store.registerResult(false);
        // Contrast should go from 0.50 to 0.58 (+0.08) and reset streak
        expect(Store.state.autoContrast).toBe(0.58);
        expect(Store.state.correctStreak).toBe(0);
    });

    it('should decrease contrast after 3 correct answers in a row (3-down rule)', () => {
        Store.registerResult(true); // 1st success, contrast remains 0.50
        Store.registerResult(true); // 2nd success, contrast remains 0.50
        Store.registerResult(true); // 3rd success -> triggers contrast drop!
        
        // Contrast should drop from 0.50 to 0.45 (-0.05) and reset staircase streak
        expect(Store.state.autoContrast).toBe(0.45);
        expect(Store.state.staircaseStreak).toBe(0);
    });

    it('should advance difficulty stage if block accuracy >= 85% over 20 trials', () => {
        // Simulate 20 correct answers in a row
        for (let i = 0; i < 20; i++) {
            Store.registerResult(true);
        }
        
        // Stage difficulty should automatically advance from 1 to 2
        expect(Store.state.currentLevel).toBe(2);
        expect(Store.state.autoContrast).toBe(0.40); // Resets contrast to default baseline
    });
});