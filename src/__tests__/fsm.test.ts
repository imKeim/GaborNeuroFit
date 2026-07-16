/*
 * GaborNeuroFit - Finite State Machine (FSM) Security Assurance
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This test suite strictly verifies the chronological safety of therapeutic
 * event loops, protecting the patient data from asynchronous race conditions,
 * rapid input spam, and temporal sequence violations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GaborController } from '../controller/gabor';
import { Store } from '../store';

// Mock Web Audio and WebGL dependencies to prevent Node.js hardware pipeline crashes
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

// Isolate the FSM logic from physical DOM UI rendering faults
vi.mock('../ui/screen', () => ({
    updateScoreboard: vi.fn(),
    updateStatusBar: vi.fn(),
    drawIdleState: vi.fn()
}));

describe('GaborNeuroFit State Machine Fortification', () => {
    let ctrl: GaborController;

    // Mock DOM elements required for Controller instantiation
    const mockCanvas = document.createElement('canvas');
    const mockOverlayCanvas = document.createElement('canvas');
    const mockOverlayCtx = mockOverlayCanvas.getContext('2d') as CanvasRenderingContext2D;
    const mockCross = document.createElement('div');
    const mockContainer = document.createElement('div');
    const mockFlashOverlay = document.createElement('div');
    const mockBtnStart = document.createElement('button');

    beforeEach(() => {
        // Reset absolute clinical baseline before every test
        Store.state.score = 0;
        Store.state.total = 0;
        Store.state.isWaitingForAnswer = false;

        // Initialize a fresh controller
        ctrl = new GaborController(
            mockCanvas,
            mockOverlayCanvas,
            mockOverlayCtx,
            mockCross,
            mockContainer,
            mockFlashOverlay,
            mockBtnStart,
            () => ({}), // Fake translation getter
            vi.fn(), // Fake modal popup
            vi.fn() // Fake syncCross callback
        );

        // Take control of the system clock to instantly bypass therapeutic delays
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        ctrl.abort(); // Ensure trackers are purged
    });

    // ============================================================================
    // 1. ILLEGAL TRANSITIONS PROTECTION
    // ============================================================================
    it('Should rigidly reject illegal topological jumps (e.g. IDLE directly to FEEDBACK)', () => {
        expect(ctrl.currentState).toBe('IDLE');

        // Attempt an illegal operation
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

    // ============================================================================
    // 2. INPUT DEBOUNCE (Spam Armor)
    // ============================================================================
    it('Should armor the psychometric staircase against user input spam (Button Mashing)', () => {
        // Mock a legally initiated answer phase
        ctrl.currentState = 'AWAITING_INPUT';

        // Simulate a frustrated patient rapid-firing the confirmation button 5 times locally
        for (let i = 0; i < 5; i++) {
            ctrl.submitAnswer('left');
        }

        // The first call mutates the state to FEEDBACK.
        // The remaining 4 calls MUST hit the internal return guard.
        // As a result, the global total should mathematically only increment exactly once.
        expect(Store.state.total).toBe(1);
        expect(ctrl.currentState).toBe('FEEDBACK');
    });

    it('Should ignore inputs entirely if the stimulus has not flashed yet (PRE_CUE phase)', () => {
        ctrl.currentState = 'PRE_CUE';
        ctrl.submitAnswer('right');

        // Input should not register. Trial total remains untouched.
        expect(Store.state.total).toBe(0);
        expect(ctrl.currentState).toBe('PRE_CUE'); // State remains in pre-cue
    });

    // ============================================================================
    // 3. SECURE GARBAGE COLLECTION (Memory Leaks)
    // ============================================================================
    it('Should completely strip all pending asynchronous callbacks upon clinical abort', () => {
        // Trigger a trial which schedules the 180ms audio-to-visual pre-cue delay
        ctrl.triggerTrial();

        // We ensure a timeout is queued in our custom wrapper
        expect(ctrl.currentState).toBe('PRE_CUE');

        // The user suddenly clicks the "Settings" menu button
        ctrl.abort();

        // The state must instantly yield to IDLE
        expect(ctrl.currentState).toBe('IDLE');

        // Advance time by 200ms. If the timer WAS NOT cleared, it would try to fire
        // _runRenderCycle and mutate the state to STIMULUS_ACTIVE.
        vi.advanceTimersByTime(200);

        // State must defensively REMAIN IDLE because the timeout was safely deleted
        expect(ctrl.currentState).toBe('IDLE');
    });
});