/**
 * @file repository.test.ts
 * @description Persistence Layer and Relational Database Integrity suite.
 * Guarantees that patient profiles and polymorphic session data are 
 * serialized without data loss or foreign key collisions.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataRepository } from '../store/repository';

// Logic: Providing a memory-based LocalStorage mock for the Node.js runner
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
        // Step: Intercept global storage calls and route to RAM mock
        vi.stubGlobal('localStorage', localStorageMock);
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /* Context: Database hydration and referential integrity */

    it('Should bootstrap a default profile gracefully if completely empty', () => {
        DataRepository.init({ defaultPatientName: 'Root Patient' });

        const profiles = DataRepository.getProfiles();
        expect(profiles.length).toBe(1);
        expect(profiles[0].name).toBe('Root Patient');

        const activeUid = DataRepository.getActiveProfileId();
        expect(activeUid).toBe(profiles[0].id);
    });

    /** @architecture Validates cascading purge protocol */
    it('Should perform destructive Cascading Deletes cleanly avoiding DB leaks', () => {
        DataRepository.init();
        const p1 = DataRepository.getProfiles()[0];
        const p2 = DataRepository.createProfile('Secondary Patient');

        expect(p2).not.toBeNull();
        if (!p2) return;

        // Step: Injecting sessions strictly mapped to specific profile UUIDs
        DataRepository.setActiveProfileId(p1.id);
        DataRepository.saveSession({ sessionId: 'session_A', protocol: 'occlusion' });

        DataRepository.setActiveProfileId(p2.id);
        DataRepository.saveSession({ sessionId: 'session_B', protocol: 'occlusion' });
        DataRepository.saveSession({ sessionId: 'session_C', protocol: 'occlusion' });

        expect(DataRepository.getAllSessions().length).toBe(3);

        // Step: Initiate relational cascade elimination
        DataRepository.deleteProfile(p2.id);

        // Clinical: p2's history must vanish, while p1's record must survive
        const remainingSessions = DataRepository.getAllSessions();
        expect(remainingSessions.length).toBe(1);
        expect(remainingSessions[0].id).toBe('session_A');
    });

    it('Should refuse to delete the very last profile to prevent empty DB crashes', () => {
        DataRepository.init();
        const p1 = DataRepository.getProfiles()[0];
        const deleteSuccess = DataRepository.deleteProfile(p1.id);

        expect(deleteSuccess).toBe(false); 
        expect(DataRepository.getProfiles().length).toBe(1); 
    });

    /* Context: Modality-specific payload serialization */

    /** @architecture Verifies polymorphic factory stripping logic */
    it('Should strictly isolate Polymorphic fields during payload serialization', () => {
        DataRepository.init();

        // Step: Pushing a Synoptophore payload with Gabor-specific pollution
        DataRepository.saveSession({
            sessionId: 'synop_123',
            protocol: 'synoptophore',
            targetX: -15,
            targetY: 0,
            outcome: 'success',
            contrast: 0.99, // Polluting field
            rdsDensity: 0.75 // Polluting field
        });

        const savedItem = DataRepository.getAllSessions()[0] as any;

        // Logic: Assert that irrelevant fields were stripped by the factory
        expect(savedItem.synopTargetX).toBe(-15);
        expect(savedItem.contrast).toBeUndefined();
        expect(savedItem.rdsDensity).toBeUndefined();
    });

    /* Context: Deterministic data deduplication (UPSERT) */

    it('Should cleanly UPSERT existing sessions preventing chronological duplicates', () => {
        DataRepository.init();
        const sharedId = 'duplicate_session_x';

        // Step: Writing record and then overwriting with modified data
        DataRepository.saveSession({ sessionId: sharedId, protocol: 'occlusion', score: 10 });
        DataRepository.saveSession({ sessionId: sharedId, protocol: 'occlusion', score: 55 });

        const activeSessions = DataRepository.getAllSessions();

        // Logic: Array length must remain 1, preventing historical bloat
        expect(activeSessions.length).toBe(1);
        expect((activeSessions[0] as any).score).toBe(55);
    });
});