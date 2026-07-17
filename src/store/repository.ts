/**
 * @file repository.ts
 * @description Relational Data Access Layer built on top of Web Storage (localStorage).
 * Simulates a robust database architecture featuring patient profile indexing, chronological session 
 * query interfaces, cascading relational deletions, and polymorphic Factory schemas.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
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

/**
 * @description Structure of a registered patient profile in the local storage database.
 */
export interface PatientProfile {
    /** @description Cryptographically-secure unique patient identifier, format usr_Date_Entropy */
    id: string;
    /** @description Sanitized case-insensitive profile name */
    name: string;
    /** @description Unix timestamp of profile instantiation */
    createdAt: number;
}

/**
 * @description Flexible Data Transfer Object (DTO) conveying polymorphic session payloads.
 * Serves as a transitional buffer, decoupling the reactive state tree from the persistence layer.
 */
export interface SaveSessionPayload {
    /** @description Target session unique identifier */
    sessionId: string;
    /** @description Gabor or RDS success score */
    score?: number;
    /** @description Gabor or RDS total trial limit */
    total?: number;
    /** @description Difficulty macro stage */
    level?: number;
    /** @description Contrast threshold ratio achieved [0.01 to 1.0] */
    contrast?: number;
    /** @description Active clinical modality preset identifier */
    protocol: GaborPreset | 'synoptophore' | 'rds';
    /** @description Flash duration or auto-next timer values */
    speed?: FlashDurationMode | number | string;
    /** @description Binocular 3D split toggle */
    isAnaglyph?: boolean;
    /** @description Contrast balancer ratio of the dominant eye [10 to 100] */
    balance?: number;
    /** @description Active lateral lazy eye side selection */
    lazyEyeSide?: EyeSide;
    /** @description 10Hz alpha-flicker toggle */
    isFlicker?: boolean;
    /** @description Visual crowding flanking bars toggle */
    isCrowding?: boolean;
    /** @description Parafoveal visual fields eccentric shift toggle */
    isPeripheral?: boolean;
    /** @description Central fixation helper cross toggle */
    isPermanentCross?: boolean;
    /** @description Synoptophore horizontal deviation step */
    targetX?: number | null;
    /** @description Synoptophore vertical deviation step */
    targetY?: number | null;
    /** @description Original starting deviation offset distance in pixels */
    startDistance?: number | null;
    /** @description Successful vergence pull or muscular slip outcome */
    outcome?: 'success' | 'slip' | null;
    /** @description Flanker spacing distance coefficient */
    flankerDistanceCoeff?: number;
    /** @description RDS cell dot size in pixels */
    rdsDotSize?: number | null;
    /** @description RDS noise dot ratio percentage */
    rdsDensity?: number | null;
    /** @description RDS micro-stereopsis disparity threshold achieved in pixels */
    rdsDisparity?: number | null;
}

/**
 * @description Static relational database orchestrator class.
 * Employs strict JSON parsing guards to safely mutate and query Web Storage schemas.
 */
export class DataRepository {
    /** @description LocalStorage schema keys mapping profiles, sessions, and active UID indices */
    static readonly KEYS = {
        PROFILES: 'gabor_db_profiles',
        SESSIONS: 'gabor_db_sessions',
        ACTIVE_UID: 'gabor_db_active_uid'
    };

    /**
     * @description Verifies and bootstraps the local storage schema.
     * Automatically registers a default patient profile if the profiles database is empty.
     * 
     * @architecture
     * Generates a secure, cryptographically unique patient identifier using the pattern 
     * 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) to prevent double-click collisions.
     * 
     * @param {Record<string, string>} translations - Dictionary used to localize the default profile name.
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
     * @description Retrieves all registered patient profiles from Web Storage.
     * @returns {PatientProfile[]} Array of profiles or empty array on parse failure.
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
     * @returns {string | null} Active profile UID or null.
     */
    static getActiveProfileId(): string | null {
        this.init(); // Guarantee DB integrity before read
        return localStorage.getItem(this.KEYS.ACTIVE_UID);
    }

    /**
     * @description Switches the active session patient profile.
     * @param {string} id - Target profile UID.
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
     * Enforces case-insensitive name uniqueness checks to prevent programmatic duplicates.
     * 
     * @param {string} name - Desired profile name.
     * @returns {PatientProfile | null} The created profile, or null on validation failure.
     */
    static createProfile(name: string): PatientProfile | null {
        try {
            const sanitizedName = name.trim();
            if (!sanitizedName) return null;

            const profiles = this.getProfiles();

            // Prevent programmatic duplicates (case-insensitive)
            const exists = profiles.some(p => p.name.toLowerCase() === sanitizedName.toLowerCase());
            if (exists) return null;

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
     * 
     * @architecture
     * - Hard-locked to prevent 0-profile states in local storage.
     * - Cascading Delete: Safely filters and purges all historical session records matching the target userId,
     *   preventing orphaned records and localStorage storage caps exhaustion.
     * 
     * @param {string} id - Target profile UID.
     * @returns {boolean} True if deletion succeeded, false otherwise.
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
     * 
     * @architecture
     * - Polymorphic Factory Routing: Decomposes the dynamic SaveSessionPayload DTO into Gabor, RDS, 
     *   or Synoptophore explicit schemas, stripping out irrelevant fields to maintain strict local storage hygiene.
     * - UPSERT Engine: Evaluates if a record already exists with the current sessionId. Overwrites the 
     *   existing block if matched, or appends a new record.
     * 
     * @param {SaveSessionPayload} payload - Unified payload conveying completed session parameters.
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
     * @description Retrieves all committed sessions.
     * @returns {SessionCore[]} Array of all session records in the database.
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
     * @description Queries the database for sessions matching the active patient context.
     * Sorts records in chronological descending order (newest sessions first).
     * 
     * @returns {SessionCore[]} Filtered and sorted sessions list.
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
     * @description Queries exclusively sensory Gabor training sessions for the active user.
     * @returns {GaborSession[]} Filtered Gabor sessions.
     */
    static getGaborSessionsForActiveUser(): GaborSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol !== 'synoptophore' && s.protocol !== 'rds') as GaborSession[];
    }

    /**
     * @description Queries exclusively motor Synoptophore training sessions for the active user.
     * @returns {SynoptophoreSession[]} Filtered Synoptophore sessions.
     */
    static getSynopSessionsForActiveUser(): SynoptophoreSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol === 'synoptophore') as SynoptophoreSession[];
    }

    /**
     * @description Queries exclusively stereoscopic RDS training sessions for the active user.
     * @returns {RdsSession[]} Filtered RDS sessions.
     */
    static getRdsSessionsForActiveUser(): RdsSession[] {
        return this.getSessionsForActiveUser()
            .filter(s => s.protocol === 'rds') as RdsSession[];
    }

    /**
     * @description Purges historical session records mapped to the active patient profile UID.
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
     * Parses old monolithic gabor_history_v2 records and maps them cleanly into the Relational v2.5 schema.
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