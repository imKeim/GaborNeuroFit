/*
 * GaborNeuroFit - Asynchronous Resource Tracker Utility
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This utility class tracks and garbage-collects active JavaScript timers,
 * intervals, and requestAnimationFrame requests to prevent memory/GPU leaks.
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
     * @description Safe wrapper for setTimeout. Auto-deletes itself from tracker upon execution.
     */
    setTimeout(callback: () => void, delay: number): number {
        // Enforce browser-side setTimeout return type as number via window context
        const id = window.setTimeout(() => {
            this.timeouts.delete(id);
            callback();
        }, delay);
        this.timeouts.add(id);
        return id;
    }

    /**
     * @description Safe wrapper for setInterval
     */
    setInterval(callback: () => void, delay: number): number {
        const id = window.setInterval(callback, delay);
        this.intervals.add(id);
        return id;
    }

    /**
     * @description Safe wrapper for requestAnimationFrame
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
     * @description Instantly purge all active registered asynchronous timers and frame loops.
     * Prevents delayed visual callbacks from interfering with newly initialized clinical modalities.
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
