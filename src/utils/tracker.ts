/**
 * @file tracker.ts
 * @description Asynchronous Resource Tracker and Garbage Collection utility.
 * Manages the lifecycle of JavaScript timers, intervals, and requestAnimationFrame requests.
 * Acts as a safety fuse to prevent memory leaks and "zombie" callbacks during clinical mode switching.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

/**
 * @description Utility class for tracking and batch-clearing asynchronous resources.
 */
export class AsyncResourceTracker {
    private timeouts: Set<number>;
    private intervals: Set<number>;
    private animationFrames: Set<number>;

    constructor() {
        this.timeouts = new Set<number>();
        this.intervals = new Set<number>();
        this.animationFrames = new Set<number>();
    }

    /**
     * @description Safe wrapper for window.setTimeout.
     * 
     * @architecture 
     * Implements a self-cleaning mechanism: the timer ID is automatically purged 
     * from the internal registry once the callback executes, ensuring an accurate 
     * inventory of pending tasks.
     * 
     * @clinical 
     * Essential for managing Gabor flash exposure durations (100-350ms) and feedback 
     * window animations without risking overlapping stimuli.
     * 
     * @param {Function} callback - The function to execute.
     * @param {number} delay - Delay in milliseconds.
     * @returns {number} The generated timeout ID.
     */
    setTimeout(callback: () => void, delay: number): number {
        const id = window.setTimeout(() => {
            this.timeouts.delete(id);
            callback();
        }, delay);
        this.timeouts.add(id);
        return id;
    }

    /**
     * @description Safe wrapper for window.setInterval.
     * 
     * @clinical 
     * Used for long-running vergence pull intervals in Synoptophore mode, 
     * ensuring constant and predictable motor load on extraocular muscles.
     * 
     * @param {Function} callback - The function to execute repeatedly.
     * @param {number} delay - Interval in milliseconds.
     * @returns {number} The generated interval ID.
     */
    setInterval(callback: () => void, delay: number): number {
        const id = window.setInterval(callback, delay);
        this.intervals.add(id);
        return id;
    }

    /**
     * @description Safe wrapper for window.requestAnimationFrame.
     * 
     * @architecture 
     * Synchronizes high-frequency rendering with the display refresh rate (VSync), 
     * preventing screen tearing and ensuring thermal efficiency.
     * 
     * @clinical 
     * Critical for maintaining stable 10Hz Alpha-resonance flicker loops and 
     * 18Hz dynamic RDS noise boiling without frame drops.
     * 
     * @param {FrameRequestCallback} callback - The render function.
     * @returns {number} The generated frame request ID.
     */
    requestAnimationFrame(callback: (timestamp: number) => void): number {
        const id = window.requestAnimationFrame((timestamp: number) => {
            this.animationFrames.delete(id);
            callback(timestamp);
        });
        this.animationFrames.add(id);
        return id;
    }

    /**
     * @description Forcefully purges all active registered asynchronous timers and frame loops.
     * 
     * @architecture 
     * Performs an atomic teardown of the asynchronous context. This prevents "delayed visual 
     * ghosts" (callbacks from a previous training session) from firing once a new 
     * modality has been initialized on the same canvas.
     */
    clearAll(): void {
        this.timeouts.forEach((id) => window.clearTimeout(id));
        this.timeouts.clear();

        this.intervals.forEach((id) => window.clearInterval(id));
        this.intervals.clear();

        this.animationFrames.forEach((id) => window.cancelAnimationFrame(id));
        this.animationFrames.clear();
    }
}