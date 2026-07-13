/*
 * GaborNeuroFit - Persistence Layer & Relational DB Assurance
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This test suite verifies the integrity of the DataRepository, guaranteeing that
 * patient profiles, clinical history chunks, and polymorphic session objects are
 * flawlessly serialized/deserialized without data loss or foreign key collisions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataRepository } from '../store/repository';
import type { GaborPreset } from '../types/clinical';

// Provide a mock LocalStorage architecture for the Node.js test runner
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        })
    };
})();

describe('DataRepository Integrity Operations', () => {
    beforeEach(() => {
        // Intercept global browser LocalStorage calls and route to our RAM Mock
        vi.stubGlobal('localStorage', localStorageMock);
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // ============================================================================
    // 1. PROFILE BOOTSTRAPPING & REFERENTIAL INTEGRITY
    // ============================================================================
    it('Should bootstrap a default profile gracefully if completely empty', () => {
        DataRepository.init({ defaultPatientName: 'Root Patient' });

        const profiles = DataRepository.getProfiles();
        expect(profiles.length).toBe(1);
        expect(profiles[0].name).toBe('Root Patient');

        const activeUid = DataRepository.getActiveProfileId();
        expect(activeUid).toBe(profiles[0].id);
    });

    it('Should perform destructive Cascading Deletes cleanly avoiding DB leaks', () => {
        // 1. Manually shape database state
        DataRepository.init();
        const p1 = DataRepository.getProfiles()[0];
        const p2 = DataRepository.createProfile('Secondary Patient');

        expect(p2).not.toBeNull();
        if (!p2) return;

        // 2. Inject sessions strictly mapped to specific profile UUIDs
        DataRepository.setActiveProfileId(p1.id);
        DataRepository.saveSession({ sessionId: 'session_A', protocol: 'occlusion' });

        DataRepository.setActiveProfileId(p2.id);
        DataRepository.saveSession({ sessionId: 'session_B', protocol: 'occlusion' });
        DataRepository.saveSession({ sessionId: 'session_C', protocol: 'occlusion' });

        // Total DB should contain 3 sessions
        expect(DataRepository.getAllSessions().length).toBe(3);

        // 3. Initiate relational cascade elimination
        const deleteSuccess = DataRepository.deleteProfile(p2.id);
        expect(deleteSuccess).toBe(true);

        const remainingProfiles = DataRepository.getProfiles();
        expect(remainingProfiles.length).toBe(1);
        expect(remainingProfiles[0].id).toBe(p1.id);

        // 4. Verify absolute session integrity: p2's sessions must vanish, p1's must survive
        const remainingSessions = DataRepository.getAllSessions();
        expect(remainingSessions.length).toBe(1);
        expect(remainingSessions[0].id).toBe('session_A');
    });

    it('Should refuse to delete the very last profile to prevent empty DB crashes', () => {
        DataRepository.init();
        const p1 = DataRepository.getProfiles()[0];

        const deleteSuccess = DataRepository.deleteProfile(p1.id);

        expect(deleteSuccess).toBe(false); // Operation blocked
        expect(DataRepository.getProfiles().length).toBe(1); // Profile remains
    });

    // ============================================================================
    // 2. POLYMORPHIC FACTORY INJECTION
    // ============================================================================
    it('Should strictly isolate Polymorphic fields during payload serialization (No bleed-over)', () => {
        DataRepository.init();

        // Push a Synoptophore payload
        DataRepository.saveSession({
            sessionId: 'synop_123',
            protocol: 'synoptophore',
            targetX: -15,
            targetY: 0,
            outcome: 'success',
            // Inject malicious payload attributes that shouldn't belong here
            contrast: 0.99,
            rdsDensity: 0.75
        });

        const activeSessions = DataRepository.getAllSessions();
        expect(activeSessions.length).toBe(1);

        const savedItem = activeSessions[0] as any; // Cast as ANY to test exact object keys

        // Assert Synoptophore fields exist
        expect(savedItem.synopTargetX).toBe(-15);
        expect(savedItem.synopOutcome).toBe('success');

        // Assert bleeding fields WERE STRIPPED BY THE FACTORY!
        // This is crucial to prevent localStorage bloat.
        expect(savedItem.contrast).toBeUndefined();
        expect(savedItem.rdsDensity).toBeUndefined();
    });

    // ============================================================================
    // 3. UPSERT MECHANICS (Duplicates Protection)
    // ============================================================================
    it('Should cleanly UPSERT existing sessions preventing chronological duplicates', () => {
        DataRepository.init();

        const sharedId = 'duplicate_session_x';

        // Write #1
        DataRepository.saveSession({
            sessionId: sharedId,
            protocol: 'occlusion',
            score: 10
        });

        // Write #2 (Using same ID but different score)
        DataRepository.saveSession({
            sessionId: sharedId,
            protocol: 'occlusion',
            score: 55
        });

        const activeSessions = DataRepository.getAllSessions();

        // Ensures array length is 1, not 2.
        expect(activeSessions.length).toBe(1);

        // Ensures the final value OVERWROTE the old one logic.
        expect((activeSessions[0] as any).score).toBe(55);
    });
});