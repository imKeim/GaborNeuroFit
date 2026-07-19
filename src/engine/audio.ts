/**
 * @file audio.ts
 * @description Procedural audio synthesis engine built on Web Audio API.
 * Generates organic acoustic stimuli and cross-modal reinforcement signals 
 * with zero latency, entirely bypassing external asset loading.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

/** @description Private Web Audio context holder */
let audioCtx: AudioContext | null = null;

/**
 * @description Securely instantiates or resumes the browser AudioContext.
 * 
 * @architecture
 * - Autoplay Compliance: Context is resumed/created only upon physical user interaction.
 * - Hardware Warm-up: Renders a silent 15ms buffer to unlock DAC hardware channels on restricted mobile browsers.
 */
export function initAudio(): void {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (audioCtx && audioCtx.destination) {
            // Render a silent dummy waveform to unlock the audio hardware channel on iOS Safari and Chrome
            const dummyOsc = audioCtx.createOscillator();
            const dummyGain = audioCtx.createGain();
            dummyGain.gain.setValueAtTime(0, audioCtx.currentTime);
            dummyOsc.connect(dummyGain);
            dummyGain.connect(audioCtx.destination);
            dummyOsc.start(0);
            dummyOsc.stop(audioCtx.currentTime + 0.015);
        }
    } catch (e) {
        console.warn("AudioContext bootstrap bypassed by browser policies:", e);
    }
}

/**
 * @description Plays organic pre-cue "Bamboo Click" stimulus.
 *
 * @clinical
 * - Cross-modal Sensory Priming: Triggered exactly 180ms before the visual stimulus. 
 * - Neural Prep: Auditory networks reach the cortex faster than visual ones, priming V1 attention fields, 
 *   optimizing neuronal receptivity, and reducing accommodative fluctuations in the ciliary muscle.
 * 
 * @mathematical
 * Synthesizes organic hollow wood resonance by combining a 950 Hz triangle wave (body) 
 * with a sharp 1600 Hz sine wave click (impact).
 * 
 * @param {boolean} isMuted - Global sound suppression flag.
 */
export function playCue(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        if (!audioCtx) return;

        // Introduce a tiny 15ms buffer lookahead to prevent crackle artifacts in hardware DACs
        const now = audioCtx.currentTime + 0.015;

        // Synthesize organic hollow wood resonance (950 Hz triangle wave)
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950, now);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.18, now + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        // Synthesize sharp metallic impact edge (1600 Hz sine wave)
        const clickOsc = audioCtx.createOscillator();
        const clickGain = audioCtx.createGain();
        clickOsc.type = 'sine';
        clickOsc.frequency.setValueAtTime(1600, now);

        clickGain.gain.setValueAtTime(0.08, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.006);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        clickOsc.connect(clickGain);
        clickGain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.05);
        clickOsc.start(now);
        clickOsc.stop(now + 0.006);
    } catch (e) {
        console.warn("Acoustic cue generation bypassed:", e);
    }
}

/**
 * @description Plays negative reinforcement descending sweep tone.
 *
 * @clinical 
 * - Corrective Feedback: Alerts attention networks to recalibrate spatial orientation 
 *   judgment without triggering an acute anxiety response.
 * 
 * @param {boolean} isMuted - Global sound suppression flag.
 */
export function playError(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime + 0.015;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.20);

        // Apply smooth decay envelope to prevent popping sounds
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.38, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.20);
    } catch (e) {
        console.warn("Acoustic error feedback generation bypassed:", e);
    }
}

/**
 * @description Plays smooth descending sweep for vergence slip/reset biofeedback.
 *
 * @clinical 
 * - Muscular Proprioception: Provides biofeedback indicating extraocular muscular slip. 
 * - Natural Mapping: The descending exponential frequency maps intuitively to the 
 *   physical sensation of losing binocular target lock.
 * 
 * @param {boolean} isMuted - Global sound suppression flag.
 */
export function playSlip(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime + 0.015;
        const duration = 0.48;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(360, now);
        // Exponential ramp provides a natural acoustic sliding feel
        osc.frequency.exponentialRampToValueAtTime(110, now + duration);

        // Volume envelope with quick attack and smooth decay
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.24, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + duration);
    } catch (e) {
        console.warn("Acoustic slip feedback generation bypassed:", e);
    }
}

/**
 * @description Plays positive dopamine-releasing "Crystal Chime" major chord.
 *
 * @clinical
 * - Dopaminergic Reinforcement: Resolved major chord (A-C#-E) securely anchors correct 
 *   synaptic patterns established during the visual orientation task.
 * - Spatial Localization: Utilizes StereoPannerNode to reinforce the specific retinal 
 *   meridian where the target was resolved.
 * 
 * @mathematical
 * Arpeggiated A-major triad frequencies: Root A (880 Hz), Major Third C# (1100 Hz), Perfect Fifth E (1320 Hz).
 * 
 * @param {boolean} isMuted - Global sound suppression flag.
 * @param {number} panValue - Spatial audio pan setting [-1.0 to 1.0].
 */
export function playSuccess(isMuted: boolean, panValue: number = 0.0, isMono: boolean = false): void {
    if (isMuted) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime + 0.015;

        const actualPan = isMono ? 0.0 : panValue;

        // Create StereoPannerNode if supported by browser to enable spatial sound rewards
        let destination: AudioNode = audioCtx.destination;
        if (audioCtx.createStereoPanner && actualPan !== 0.0) {
            const panner = audioCtx.createStereoPanner();
            panner.pan.setValueAtTime(actualPan, now);
            panner.connect(audioCtx.destination);
            destination = panner;
        }

        // Pitch 1: Root Note A (880 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.005);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        // Pitch 2: Major Third C# (1100 Hz, delayed by 30ms to create arpeggio effect)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, now + 0.03);
        gain2.gain.setValueAtTime(0, now + 0.03);
        gain2.gain.linearRampToValueAtTime(0.10, now + 0.035);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        // Pitch 3: Perfect Fifth E (1320 Hz, delayed by 60ms to complete the chime)
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1320, now + 0.06);
        gain3.gain.setValueAtTime(0, now + 0.06);
        gain3.gain.linearRampToValueAtTime(0.08, now + 0.065);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain1);
        gain1.connect(destination);

        osc2.connect(gain2);
        gain2.connect(destination);

        osc3.connect(gain3);
        gain3.connect(destination);

        osc1.start(now);
        osc1.stop(now + 0.18);

        osc2.start(now + 0.03);
        osc2.stop(now + 0.28);

        osc3.start(now + 0.06);
        osc3.stop(now + 0.45);
    } catch (e) {
        console.warn("Acoustic success feedback generation bypassed:", e);
    }
}

/**
 * @description Synthesizes a bright, rapid, ascending major arpeggio to celebrate stage promotion.
 */
export function playLevelUp(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        const ctx = audioCtx;
        if (!ctx) return;
        const now = ctx.currentTime + 0.015;

        // Ascending crystal arpeggio: A4 (440Hz) -> C#5 (554.37Hz) -> E5 (659.25Hz) -> A5 (880Hz)
        const notes = [440.00, 554.37, 659.25, 880.00];
        let delay = 0;

        notes.forEach(freq => {
            const noteTime = now + delay;
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteTime);

            noteGain.gain.setValueAtTime(0, noteTime);
            noteGain.gain.linearRampToValueAtTime(0.15, noteTime + 0.005);
            noteGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.28);

            osc.connect(noteGain);
            noteGain.connect(ctx.destination);

            osc.start(noteTime);
            osc.stop(noteTime + 0.28);

            delay += 0.04;
        });
    } catch (e) {
        console.warn("Acoustic level up synthesis bypassed:", e);
    }
}

export function playLevelDown(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        const ctx = audioCtx;
        if (!ctx) return;
        const now = ctx.currentTime + 0.015;

        // Soft non-punitive sigh: 280Hz -> 180Hz
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.35);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.22, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    } catch (e) {
        console.warn("Acoustic level down synthesis bypassed:", e);
    }
}

/**
 * @description Synthesizes a fast, bright, ascending dual-tone major sweep to signal activation and reset.
 */
export function playReset(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        if (!audioCtx) return;
        const now = audioCtx.currentTime + 0.015;

        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);

        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.15, now + 0.01);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.04);
        osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.19);

        gain2.gain.setValueAtTime(0, now + 0.04);
        gain2.gain.linearRampToValueAtTime(0.10, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.29);

        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);

        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);

        osc1.start(now);
        osc1.stop(now + 0.25);

        osc2.start(now + 0.04);
        osc2.stop(now + 0.29);
    } catch (e) {
        console.warn("Acoustic reset feedback generation bypassed:", e);
    }
}

/**
 * @description Synthesizes an elegant cascading silver chime (G-Major 7th arpeggio).
 * @param {boolean} isMuted - Global sound suppression flag.
 */
export function playSilverAward(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        const ctx = audioCtx;
        if (!ctx) return;
        const now = ctx.currentTime + 0.015;

        // G-Major 7th chord: G4 (392Hz), B4 (493.88Hz), D5 (587.33Hz), F#5 (739.99Hz)
        const notes = [392.00, 493.88, 587.33, 739.99];
        let currentDelay = 0;

        notes.forEach((freq, idx) => {
            const noteTime = now + currentDelay;
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();

            let destination: AudioNode = ctx.destination;
            if (ctx.createStereoPanner) {
                const panner = ctx.createStereoPanner();
                const pan = idx % 2 === 0 ? -0.45 : 0.45; // alternate left/right pan
                panner.pan.setValueAtTime(pan, noteTime);
                panner.connect(ctx.destination);
                destination = panner;
            }

            osc.type = 'triangle'; // triangle gives a softer, cleaner bell sound
            osc.frequency.setValueAtTime(freq, noteTime);
            osc.detune.setValueAtTime((Math.random() * 8) - 4, noteTime); // subtle organic detuning

            noteGain.gain.setValueAtTime(0, noteTime);
            noteGain.gain.linearRampToValueAtTime(0.12, noteTime + 0.005);
            noteGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

            osc.connect(noteGain);
            noteGain.connect(destination);

            osc.start(noteTime);
            osc.stop(noteTime + 0.45);

            currentDelay += 0.05 + Math.random() * 0.03; // 50ms to 80ms arpeggiator delay
        });
    } catch (e) {
        console.warn("Silver award chime synthesis bypassed:", e);
    }
}

/**
 * @description Synthesizes a majestic, deep PS1-style resonant aura (detuned D-Major 9th chord).
 * @param {boolean} isMuted - Global sound suppression flag.
 */
export function playGoldAward(isMuted: boolean): void {
    if (isMuted) return;
    try {
        initAudio();
        const ctx = audioCtx;
        if (!ctx) return;
        const now = ctx.currentTime + 0.015;

        // Create a Master Biquad Filter to sweep the frequencies (warm aura)
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(150, now);
        filter.frequency.exponentialRampToValueAtTime(1500, now + 1.8);
        filter.Q.setValueAtTime(1.5, now);
        filter.connect(ctx.destination);

        // The Bass Drone (Warm Cello D3 = 146.83 Hz - cozy, safe and rich)
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'triangle'; // triangle wave is soft, flute-like and safe for kids
        bassOsc.frequency.setValueAtTime(146.83, now);

        bassGain.gain.setValueAtTime(0, now);
        bassGain.gain.linearRampToValueAtTime(0.20, now + 0.40);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

        bassOsc.connect(bassGain);
        bassGain.connect(filter);
        bassOsc.start(now);
        bassOsc.stop(now + 2.5);

        // Cascading majestic D-Major 9th chord: F#4, A4, C#5, E5, F#5, A5
        const notes = [370.00, 440.00, 554.37, 659.25, 739.99, 880.00];
        let currentDelay = 0;

        notes.forEach((freq, idx) => {
            const noteTime = now + currentDelay;
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();

            // Symmetrical Stereo Panning: Left-to-right sweep across notes
            let destination: AudioNode = filter;
            if (ctx.createStereoPanner) {
                const panner = ctx.createStereoPanner();
                const pan = -0.75 + (idx / (notes.length - 1)) * 1.5; // Sweep from -0.75 to +0.75
                panner.pan.setValueAtTime(pan, noteTime);
                panner.connect(filter);
                destination = panner;
            }

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteTime);
            osc.detune.setValueAtTime((Math.random() * 12) - 6, noteTime); // dynamic organic detuning

            noteGain.gain.setValueAtTime(0, noteTime);
            noteGain.gain.linearRampToValueAtTime(0.10, noteTime + 0.01);
            noteGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.2);

            osc.connect(noteGain);
            noteGain.connect(destination);

            osc.start(noteTime);
            osc.stop(noteTime + 1.2);

            // Shimmer Hammer Effect (high bell chime)
            const shimmer = ctx.createOscillator();
            const shimmerGain = ctx.createGain();
            shimmer.type = 'sine';
            shimmer.frequency.setValueAtTime(freq * 3, noteTime); // 3rd harmonic
            shimmerGain.gain.setValueAtTime(0.03, noteTime);
            shimmerGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

            shimmer.connect(shimmerGain);
            shimmerGain.connect(destination);
            shimmer.start(noteTime);
            shimmer.stop(noteTime + 0.12);

            // Slightly randomized cascade delay
            currentDelay += 0.06 + Math.random() * 0.04; // 60ms to 100ms arpeggiation delay
        });
    } catch (e) {
        console.warn("Gold award chime synthesis bypassed:", e);
    }
}