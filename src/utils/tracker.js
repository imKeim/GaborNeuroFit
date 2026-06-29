/*
 * GaborNeuroFit - Asynchronous Resource Tracker Utility
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This utility class tracks and garbage-collects active JavaScript timers,
 * intervals, and requestAnimationFrame requests to prevent asynchronous leaks.
 */

export class AsyncResourceTracker {
    constructor() {
        this.timeouts = new Set();
        this.intervals = new Set();
        this.animationFrames = new Set();
    }

    // Safe wrapper for setTimeout
    setTimeout(callback, delay) {
        const id = setTimeout(() => {
            this.timeouts.delete(id);
            callback();
        }, delay);
        this.timeouts.add(id);
        return id;
    }

    // Safe wrapper for setInterval
    setInterval(callback, delay) {
        const id = setInterval(callback, delay);
        this.intervals.add(id);
        return id;
    }

    // Safe wrapper for requestAnimationFrame
    requestAnimationFrame(callback) {
        const id = requestAnimationFrame((timestamp) => {
            this.animationFrames.delete(id);
            callback(timestamp);
        });
        this.animationFrames.add(id);
        return id;
    }

    // Instantly purge all active registered asynchronous timers and frame loops
    clearAll() {
        this.timeouts.forEach((id) => clearTimeout(id));
        this.timeouts.clear();

        this.intervals.forEach((id) => clearInterval(id));
        this.intervals.clear();

        this.animationFrames.forEach((id) => cancelAnimationFrame(id));
        this.animationFrames.clear();
    }
}