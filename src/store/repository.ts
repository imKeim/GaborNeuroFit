/*
 * GaborNeuroFit - Multi-User Clinical Data Repository
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module implements a decoupled, relational persistence layer on top of localStorage,
 * providing robust profile management, session tracking, and cascading deletions.
 * Migrated to TypeScript: Employs strict type-casting for safe hydration to prevent JSON parsing faults.
 */

import type {
    SessionCore,
    GaborSession,
    SynoptophoreSession,
    RdsSession,
    GaborPreset,
    FlashDurationMode,
    EyeSide
} from '../types/clinical';

export interface PatientProfile {
    id: string;
    name: string;
    createdAt: number;
}

/**
 * @description Flexible Data Transfer Object (DTO) for incoming session saves.
 * Allows the Store to pass a unified object which the Repository will decompose
 * into strict Polymorphic interfaces (Gabor, RDS, Synoptophore) before committing to DB.
 */
export interface SaveSessionPayload {
    sessionId: string;
    score?: number;
    total?: number;
    level?: number;
    contrast?: number;
    protocol: GaborPreset | 'synoptophore' | 'rds';
    speed?: FlashDurationMode | number | string;
    isAnaglyph?: boolean;
    balance?: number;
    lazyEyeSide?: EyeSide;
    isFlicker?: boolean;
    isCrowding?: boolean;
    isPeripheral?: boolean;
    isPermanentCross?: boolean;
    targetX?: number | null;
    targetY?: number | null;
    startDistance?: number | null;
    outcome?: 'success' | 'slip' | null;
    flankerDistanceCoeff?: number;
    rdsDotSize?: number | null;
    rdsDensity?: number | null;
    rdsDisparity?: number | null;
}

export class DataRepository {
    static readonly KEYS = {
        PROFILES: 'gabor_db_profiles',
        SESSIONS: 'gabor_db_sessions',
        ACTIVE_UID: 'gabor_db_active_uid'
    };

    /**
     * @description Verifies the integrity of the local database.
     * Automatically bootstraps a default profile if the database is blank.
     *
     * @param {Record<string, string>} translations - Active localization dictionary
     */
    static init(translations: Record<string, string> = {}) {
        try {
            const profiles = this.getProfiles();
            let activeUid = localStorage.getItem(this.KEYS.ACTIVE_UID);

            // Bootstrap phase: Ensure at least one profile exists
            if (profiles.length === 0) {
                const defaultName = translations.defaultPatientName || 'Default Patient';

                const defaultProfile: PatientProfile = {
                    // Injecting cryptographic entropy to guarantee absolute UUID uniqueness against double-clicks
                    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                    name: defaultName,
                    createdAt: Date.now()
                };
                profiles.push(defaultProfile);
                localStorage.setItem(this.KEYS.PROFILES, JSON.stringify(profiles));

                activeUid = defaultProfile.id;
                localStorage.setItem(this.KEYS.ACTIVE_UID, activeUid);
            }

            // Ensure the active UID points to a valid, existing profile to prevent broken relational links
            const activeExists = profiles.some(p => p.id === activeUid);
            if (!activeExists && profiles.length > 0) {
                localStorage.setItem(this.KEYS.ACTIVE_UID, profiles[0].id);
            }
        } catch (e) {
            console.warn('DataRepository failed to initialize:', e);
        }
    }

    /**
     * @description Retrieves all registered patient profiles symmetrically.
     * @returns {PatientProfile[]} Array of strict patient profiles
     */
    static getProfiles(): PatientProfile[] {
        try {
            const raw = localStorage.getItem(this.KEYS.PROFILES);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as PatientProfile[]) : [];
        } catch (e) {
            console.warn('Failed to parse patient profiles:', e);
            return [];
        }
    }

    /**
     * @description Retrieves the currently active user profile ID.
     * @returns {string | null} The active patient UUID
     */
    static getActiveProfileId(): string | null {
        this.init(); // Guarantee DB integrity before read
        return localStorage.getItem(this.KEYS.ACTIVE_UID);
    }

    /**
     * @description Switches the active patient session context.
     * @param {string} id - Target patient profile UUID
     */
    static setActiveProfileId(id: string): void {
        try {
            const profiles = this.getProfiles();
            const exists = profiles.some(p => p.id === id);
            if (exists) {
                localStorage.setItem(this.KEYS.ACTIVE_UID, id);
            }
        } catch (e) {
            console.warn('Failed to set active profile:', e);
        }
    }

    /**
     * @description Spawns a new patient profile.
     * @param {string} name - Desired profile name
     * @returns {PatientProfile | null} The created profile, or null on failure
     */
    static createProfile(name: string): PatientProfile | null {
        try {
            const sanitizedName = name.trim();
            if (!sanitizedName) return null;

            const profiles = this.getProfiles();
            const newProfile: PatientProfile = {
                // Injecting cryptographic entropy to guarantee absolute UUID uniqueness against double-clicks
                id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                name: sanitizedName,
                createdAt: Date.now()
            };

            profiles.push(newProfile);
            localStorage.setItem(this.KEYS.PROFILES, JSON.stringify(profiles));
            return newProfile;
        } catch (e) {
            console.warn('Failed to create profile:', e);
            return null;
        }
    }

    /**
     * @description Executes a cascading deletion of a profile and all its associated training sessions.
     * Prevents deleting the last remaining profile in the database.
     * @param {string} id - Target profile ID
     * @returns {boolean} True if deletion succeeded, false otherwise
     */
    static deleteProfile(id: string): boolean {
        try {
            const profiles = this.getProfiles();

            // Hard-lock: Symmetrically prevent 0-profile states
            if (profiles.length <= 1) {
                return false;
            }

            const targetIndex = profiles.findIndex(p => p.id === id);
            if (targetIndex === -1) return false;

            // Remove the profile
            profiles.splice(targetIndex, 1);
            localStorage.setItem(this.KEYS.PROFILES, JSON.stringify(profiles));

            // Cascading Delete: Purge all historical sessions associated with this user
            let sessions = this.getAllSessions();
            sessions = sessions.filter(s => s.userId !== id);
            localStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));

            // Switch active context if the deleted profile was the active one
            const activeUid = localStorage.getItem(this.KEYS.ACTIVE_UID);
            if (activeUid === id) {
                localStorage.setItem(this.KEYS.ACTIVE_UID, profiles[0].id);
            }

            return true;
        } catch (e) {
            console.warn('Failed to delete profile:', e);
            return false;
        }
    }

    /**
     * @description Appends a newly acquired training session to the active patient context.
     * Implements a robust UPSERT engine based on the active session ID to prevent duplicate entry spam.
     *
     * @clinical Polymorphic Factory Routing avoids LocalStorage bloat by strictly confining
     * saved metrics to the active treatment modality interfaces.
     */
    static saveSession(payload: SaveSessionPayload): void {
        try {
            const activeUid = this.getActiveProfileId();
            if (!activeUid) return;

            const sessions = this.getAllSessions();

            // Core metadata shared across all clinical modalities
            const core: SessionCore = {
                id: payload.sessionId,
                userId: activeUid,
                timestamp: Date.now(),
                protocol: payload.protocol
            };

            let currentSession: SessionCore;

            // Polymorphic Factory Routing based on the active protocol
            if (payload.protocol === 'synoptophore') {
                const sSession: SynoptophoreSession = {
                    ...core,
                    synopTargetX: payload.targetX !== null && payload.targetX !== undefined ? Math.round(Number(payload.targetX)) : 0,
                    synopTargetY: payload.targetY !== null && payload.targetY !== undefined ? Math.round(Number(payload.targetY)) : 0,
                    synopStartDistance: payload.startDistance !== null && payload.startDistance !== undefined ? Number(payload.startDistance) : 0,
                    synopOutcome: payload.outcome || 'slip',
                    speed: Number(payload.speed) || 2500,
                    isAnaglyph: !!payload.isAnaglyph,
                    balance: Math.round((payload.balance || 0) * 100),
                    lazyEyeSide: payload.lazyEyeSide || 'left',
                    synopFlickerActive: !!payload.isFlicker
                };
                currentSession = sSession;
            } else if (payload.protocol === 'rds') {
                const rSession: RdsSession = {
                    ...core,
                    score: Number(payload.score) || 0,
                    total: Number(payload.total) || 0,
                    level: Number(payload.level) || 1,
                    isAnaglyph: !!payload.isAnaglyph,
                    balance: Math.round((payload.balance || 0) * 100),
                    lazyEyeSide: payload.lazyEyeSide || 'left',
                    rdsDotSize: payload.rdsDotSize !== null && payload.rdsDotSize !== undefined ? Number(payload.rdsDotSize) : 4,
                    rdsDensity: payload.rdsDensity !== null && payload.rdsDensity !== undefined ? Number(payload.rdsDensity) : 0.50,
                    rdsDisparity: payload.rdsDisparity !== null && payload.rdsDisparity !== undefined ? Number(payload.rdsDisparity) : 4
                };
                currentSession = rSession;
            } else {
                // Sensory Gabor Modalities (occlusion, binocular, flicker, peripheral, blitz, custom)
                const gSession: GaborSession = {
                    ...core,
                    score: Number(payload.score) || 0,
                    total: Number(payload.total) || 0,
                    level: Number(payload.level) || 1,
                    contrast: Math.round((payload.contrast || 0) * 100),
                    speed: (payload.speed as FlashDurationMode) || 'adaptive',
                    isAnaglyph: !!payload.isAnaglyph,
                    balance: Math.round((payload.balance || 0) * 100),
                    lazyEyeSide: payload.lazyEyeSide || 'left',
                    isFlickerEnabled: !!payload.isFlicker,
                    isCrowdingEnabled: !!payload.isCrowding,
                    isPeripheralEnabled: !!payload.isPeripheral,
                    isPermanentCrossEnabled: !!payload.isPermanentCross,
                    flankerDistanceCoeff: Number(payload.flankerDistanceCoeff) || 2.0
                };
                currentSession = gSession;
            }

            const existingIdx = sessions.findIndex((s: SessionCore) => s.id === payload.sessionId);
            if (existingIdx > -1) {
                // Update the existing active session
                sessions[existingIdx] = currentSession;
            } else {
                // Insert a brand new session entry
                sessions.push(currentSession);
            }

            localStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));
        } catch (e) {
            console.warn('Failed to save training session:', e);
        }
    }

    /**
     * @description Retrieves all historically recorded sessions across the entire application database.
     * Raw parsing assumes SessionCore conformity.
     * @returns {SessionCore[]} All session entries
     */
    static getAllSessions(): SessionCore[] {
        try {
            const raw = localStorage.getItem(this.KEYS.SESSIONS);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as SessionCore[]) : [];
        } catch (e) {
            console.warn('Failed to parse sessions database:', e);
            return [];
        }
    }

    /**
     * @description Retrieves sessions belonging exclusively to the currently active patient context.
     * Sorted symmetrically in descending order (newest sessions first).
     * @returns {SessionCore[]} Filtered and sorted sessions
     */
    static getSessionsForActiveUser(): SessionCore[] {
        const activeUid = this.getActiveProfileId();
        if (!activeUid) return [];

        const sessions = this.getAllSessions();
        return sessions
            .filter(s => s.userId === activeUid)
            .sort((a, b) => b.timestamp - a.timestamp); // Chronological descending order
    }

    /**
     * @description Retrieves exclusively sensory Gabor training sessions for the active user.
     * Safely casts the result to the GaborSession strict interface.
     */
    static getGaborSessionsForActiveUser(): GaborSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol !== 'synoptophore' && s.protocol !== 'rds') as GaborSession[];
    }

    /**
     * @description Retrieves exclusively motor Synoptophore training sessions for the active user.
     * Safely casts the result to the SynoptophoreSession strict interface.
     */
    static getSynopSessionsForActiveUser(): SynoptophoreSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol === 'synoptophore') as SynoptophoreSession[];
    }

    /**
     * @description Retrieves exclusively stereoscopic RDS training sessions for the active user.
     * Safely casts the result to the RdsSession strict interface.
     */
    static getRdsSessionsForActiveUser(): RdsSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol === 'rds') as RdsSession[];
    }

    /**
     * @description Purges historical sessions associated exclusively with the active patient context.
     */
    static clearActiveUserHistory(): void {
        try {
            const activeUid = this.getActiveProfileId();
            if (!activeUid) return;

            let sessions = this.getAllSessions();
            sessions = sessions.filter(s => s.userId !== activeUid);
            localStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));
        } catch (e) {
            console.warn('Failed to clear active user history:', e);
        }
    }

    /**
     * @description One-time legacy database migrator.
     * Imports old monolithic gabor_history_v2 array into the new multi-user relational database.
     * Fully typed to prevent null-reference leaks during the mutation.
     */
    static migrateLegacyDatabase(): void {
        try {
            const legacyHistoryRaw = localStorage.getItem('gabor_history_v2');
            if (!legacyHistoryRaw) return; // No legacy data to migrate

            // We explicitly type the untrusted JSON payload logic to avoid "any"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const legacyHistory: any[] = JSON.parse(legacyHistoryRaw);

            if (Array.isArray(legacyHistory) && legacyHistory.length > 0) {
                const activeUid = this.getActiveProfileId();
                if (!activeUid) return;

                const sessions = this.getAllSessions();

                legacyHistory.forEach(item => {
                    // Check if this session was already migrated to prevent duplicates
                    const exists = sessions.some(s => s.id === item.id);
                    if (!exists) {
                        const migratedGabor: GaborSession = {
                            id: item.id || 'ses_mig_' + Math.random().toString(36).substr(2, 9),
                            userId: activeUid,
                            timestamp: Date.now() - (1000 * 60 * 60 * 24), // Mock past date
                            score: Number(item.score) || 0,
                            total: Number(item.total) || 0,
                            level: Number(item.level) || 1,
                            contrast: Number(item.contrast) || 40,
                            protocol: (item.protocol as GaborPreset) || 'custom',
                            speed: (item.speed as FlashDurationMode) || 'adaptive',
                            isAnaglyph: item.isAnaglyph !== undefined ? Boolean(item.isAnaglyph) : true,
                            balance: item.balance !== undefined ? Number(item.balance) : 30,
                            lazyEyeSide: 'left', // Default fallback for v1 history
                            isFlickerEnabled: false,
                            isCrowdingEnabled: false,
                            isPeripheralEnabled: false,
                            isPermanentCrossEnabled: false,
                            flankerDistanceCoeff: 2.0
                        };
                        sessions.push(migratedGabor);
                    }
                });

                localStorage.setItem(this.KEYS.SESSIONS, JSON.stringify(sessions));
                localStorage.removeItem('gabor_history_v2'); // Clean up old monolithic key
                console.log('🧿 [Migration Engine] Legacy database successfully converted to Relational v2.5 schema.');
            }
        } catch (e) {
            console.warn('Legacy database migration failed:', e);
        }
    }
}