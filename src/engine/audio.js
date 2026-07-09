/*
 * GaborNeuroFit - Procedural Audio Synthesis Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module leverages the Web Audio API to procedurally synthesize non-intrusive,
 * psychoacoustically optimized acoustic cues for attention pre-cueing and error/success reinforcement.
 */

// Private Web Audio context holder
let audioCtx = null;

// Securely instantiate or resume the browser AudioContext on the first physical user interaction
export function initAudio() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        // Render a silent dummy waveform to unlock the audio channel on iOS Safari and Chrome
        const dummyOsc = audioCtx.createOscillator();
        const dummyGain = audioCtx.createGain();
        dummyGain.gain.setValueAtTime(0, audioCtx.currentTime);
        dummyOsc.connect(dummyGain);
        dummyGain.connect(audioCtx.destination);
        dummyOsc.start(0);
        dummyOsc.stop(audioCtx.currentTime + 0.015);
    } catch (e) {
        console.warn("AudioContext bootstrap bypassed by browser policies:", e);
    }
}

// Play organic pre-cue Bamboo Click (sound triggers exactly 180ms before visual stimulus flash)
export function playCue(isMuted) {
    if (isMuted) return;
    try {
        initAudio(); // Ensure context is running
        
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

// Play negative reinforcement low sweep tone (220 Hz slide to 140 Hz)
export function playError(isMuted) {
    if (isMuted) return;
    try {
        initAudio();
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

// Play smooth descending sweep for vergence slip/reset (360 Hz exponentially sliding to 110 Hz)
export function playSlip(isMuted) {
    if (isMuted) return;
    try {
        initAudio();
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

// Play positive dopamine-releasing Crystal Chime major chord (La-Do#-Mi / A-C#-E)
export function playSuccess(isMuted) {
    if (isMuted) return;
    try {
        initAudio();
        const now = audioCtx.currentTime + 0.015;
        
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
        gain1.connect(audioCtx.destination);
        
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        
        osc3.connect(gain3);
        gain3.connect(audioCtx.destination);
        
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