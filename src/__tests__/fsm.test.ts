/**
 * @file fsm.test.ts
 * @description Finite State Machine (FSM) security and synchronization assurance.
 * Strictly verifies the chronological integrity of therapeutic event loops, 
 * protecting patient data from asynchronous race conditions and input noise.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GaborController } from '../controller/gabor';
import { Store } from '../store';

// Logic: Mocking hardware dependencies to prevent Node.js environment crashes
vi.mock('./engine/audio', () => ({
    playCue: vi.fn(),
    playSuccess: vi.fn(),
    playError: vi.fn(),
    playSlip: vi.fn()
}));

vi.mock('../engine/gabor-render', () => ({
    renderGabor: vi.fn(),
    drawFusionLockFrame: vi.fn()
}));

vi.mock('../ui/screen', () => ({
    updateScoreboard: vi.fn(),
    updateStatusBar: vi.fn(),
    drawIdleState: vi.fn()
}));

describe('GaborNeuroFit State Machine Fortification', () => {
    let ctrl: GaborController;

    // Logic: Mocking DOM requirements for headless controller execution
    const mockCanvas = document.createElement('canvas');
    const mockOverlayCanvas = document.createElement('canvas');
    const mockOverlayCtx = mockOverlayCanvas.getContext('2d') as CanvasRenderingContext2D;
    const mockContainer = document.createElement('div');
    const mockFlashOverlay = document.createElement('div');
    const mockBtnStart = document.createElement('button');

    beforeEach(() => {
        // Step: Reset absolute clinical baseline
        Store.state.score = 0;
        Store.state.total = 0;
        Store.state.isWaitingForAnswer = false;

        ctrl = new GaborController(
            mockCanvas,
            mockOverlayCanvas,
            mockOverlayCtx,
            mockContainer,
            mockFlashOverlay,
            mockBtnStart,
            () => ({}),
            vi.fn(),
            vi.fn()
        );

        // Logic: Employing fake timers to bypass therapeutic delays during validation
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        ctrl.abort(); 
    });

    /* Context: Topological integrity and transition guards */

    it('Should rigidly reject illegal topological jumps (e.g. IDLE directly to FEEDBACK)', () => {
        expect(ctrl.currentState).toBe('IDLE');
        const result = ctrl.transitionTo('FEEDBACK');

        // FSM must block the action and preserve the safe state
        expect(result).toBe(false);
        expect(ctrl.currentState).toBe('IDLE');
    });

    it('Should allow legal clinical sequences (IDLE -> PRE_CUE -> STIMULUS_ACTIVE)', () => {
        expect(ctrl.transitionTo('PRE_CUE')).toBe(true);
        expect(ctrl.currentState).toBe('PRE_CUE');

        expect(ctrl.transitionTo('STIMULUS_ACTIVE')).toBe(true);
        expect(ctrl.currentState).toBe('STIMULUS_ACTIVE');
    });

    /* Context: Protection against motor impulsivity and input noise */

    it('Should armor the psychometric staircase against user input spam (Button Mashing)', () => {
        ctrl.currentState = 'AWAITING_INPUT';

        // Step: Simulate rapid-fire input noise (5 consecutive clicks)
        for (let i = 0; i < 5; i++) {
            ctrl.submitAnswer('left');
        }

        // Logic: First call mutates state, subsequent 4 must be ignored by FSM guards
        expect(Store.state.total).toBe(1);
        expect(ctrl.currentState).toBe('FEEDBACK');
    });

    it('Should ignore inputs entirely if the stimulus has not flashed yet (PRE_CUE phase)', () => {
        ctrl.currentState = 'PRE_CUE';
        ctrl.submitAnswer('right');

        // Clinical: Input should not register before sensory stimulus exposure
        expect(Store.state.total).toBe(0);
        expect(ctrl.currentState).toBe('PRE_CUE');
    });

    /* Context: Asynchronous resource hygiene and leak prevention */

    it('Should completely strip all pending asynchronous callbacks upon clinical abort', () => {
        // Step: Initiate trial and queue the 180ms audio-to-visual delay
        ctrl.triggerTrial();
        expect(ctrl.currentState).toBe('PRE_CUE');

        // Step: Trigger emergency component teardown
        ctrl.abort();
        expect(ctrl.currentState).toBe('IDLE');

        // Logic: Advance time beyond the original timeout. No state mutation should occur.
        vi.advanceTimersByTime(200);

        expect(ctrl.currentState).toBe('IDLE');
    });
});