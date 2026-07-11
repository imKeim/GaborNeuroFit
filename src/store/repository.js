/*
 * GaborNeuroFit - Multi-User Clinical Data Repository
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This module implements a decoupled, relational persistence layer on top of localStorage,
 * providing robust profile management, session tracking, and cascading deletions.
 */

export class DataRepository {
    static KEYS = {
        PROFILES: 'gabor_db_profiles',
        SESSIONS: 'gabor_db_sessions',
        ACTIVE_UID: 'gabor_db_active_uid'
    };

    /**
     * Verifies the integrity of the local database.
     * Automatically bootstraps a default profile if the database is blank.
     */
    static init() {
        try {
            let profiles = this.getProfiles();
            let activeUid = localStorage.getItem(this.KEYS.ACTIVE_UID);

            // Bootstrap phase: Ensure at least one profile exists
            if (profiles.length === 0) {
                const isRu = (localStorage.getItem('gabor_lang') === 'ru') || 
                             (navigator.language && navigator.language.startsWith('ru'));
                const defaultName = isRu ? 'Пациент по умолчанию' : 'Default Patient';

                const defaultProfile = {
                    id: 'usr_' + Date.now(),
                    name: defaultName,
                    createdAt: Date.now()
                };
                profiles.push(defaultProfile);
                localStorage.setItem(this.KEYS.PROFILES, JSON.stringify(profiles));
                activeUid = defaultProfile.id;
                localStorage.setItem(this.KEYS.ACTIVE_UID, activeUid);
            }

            // Ensure the active UID points to a valid, existing profile
            const activeExists = profiles.some(p => p.id === activeUid);
            if (!activeExists && profiles.length > 0) {
                localStorage.setItem(this.KEYS.ACTIVE_UID, profiles[0].id);
            }
        } catch (e) {
            console.warn('DataRepository failed to initialize:', e);
        }
    }

    /**
     * Retrieves all registered patient profiles.
     * @returns {Array} List of patient profiles
     */
    static getProfiles() {
        try {
            const raw = localStorage.getItem(this.KEYS.PROFILES);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('Failed to parse patient profiles:', e);
            return [];
        }
    }

    /**
     * Retrieves the currently active profile ID.
     * @returns {string} The active patient UUID
     */
    static getActiveProfileId() {
        this.init(); // Guarantee DB integrity before read
        return localStorage.getItem(this.KEYS.ACTIVE_UID);
    }

    /**
     * Switches the active patient session context.
     * @param {string} id - Target patient profile ID
     */
    static setActiveProfileId(id) {
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
     * Switches/Spawns a new patient profile.
     * @param {string} name - Desired profile name
     * @returns {Object|null} The created profile, or null on failure
     */
    static createProfile(name) {
        try {
            const sanitizedName = name.trim();
            if (!sanitizedName) return null;

            const profiles = this.getProfiles();
            const newProfile = {
                id: 'usr_' + Date.now(),
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
     * Executes a cascading deletion of a profile and all its associated training sessions.
     * Prevents deleting the last remaining profile in the database.
     * @param {string} id - Target profile ID
     * @returns {boolean} True if deletion succeeded, false otherwise
     */
    static deleteProfile(id) {
        try {
            let profiles = this.getProfiles();
            
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
     * Appends a newly acquired training session to the active patient context.
     * Implements a robust UPSERT engine based on the active session ID to prevent duplicate entry spam.
     */
    static saveSession(sessionId, score, total, level, contrast, protocol, speed, isAnaglyph, balance, lazyEyeSide = 'left', isFlicker = false, isCrowding = false, isPeripheral = false, isPermanentCross = false, targetX = null, targetY = null, startDistance = null, outcome = null, flankerDistanceCoeff = 2.0) {
        try {
            const activeUid = this.getActiveProfileId();
            if (!activeUid) return;

            const sessions = this.getAllSessions();
            const currentSession = {
                id: sessionId,
                userId: activeUid,
                timestamp: Date.now(),
                score: parseInt(score) || 0,
                total: parseInt(total) || 0,
                level: parseInt(level) || 1,
                contrast: Math.round(contrast * 100),
                protocol: protocol,
                speed: speed,
                isAnaglyph: !!isAnaglyph,
                balance: Math.round(balance * 100),
                
                // Added Sensory Laterality & Active Clinical Stimulation Flags
                lazyEyeSide: lazyEyeSide,
                isFlickerEnabled: !!isFlicker,
                isCrowdingEnabled: !!isCrowding,
                isPeripheralEnabled: !!isPeripheral,
                isPermanentCrossEnabled: !!isPermanentCross,
                flankerDistanceCoeff: parseFloat(flankerDistanceCoeff) || 2.0,
                
                // Polymorphic Synoptophore Kinematics (strictly nullified for Gabor sensory sessions)
                synopTargetX: targetX !== null ? parseInt(targetX) : null,
                synopTargetY: targetY !== null ? parseInt(targetY) : null,
                synopStartDistance: startDistance !== null ? parseFloat(startDistance) : null,
                synopOutcome: outcome || null
            };

            const existingIdx = sessions.findIndex(s => s.id === sessionId);
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
     * Retrieves all historically recorded sessions across the entire application database.
     * @returns {Array} All session entries
     */
    static getAllSessions() {
        try {
            const raw = localStorage.getItem(this.KEYS.SESSIONS);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('Failed to parse sessions database:', e);
            return [];
        }
    }

    /**
     * Retrieves sessions belonging exclusively to the currently active patient context.
     * Sorted symmetrically in descending order (newest sessions first).
     * @returns {Array} Filtered and sorted sessions
     */
    static getSessionsForActiveUser() {
        const activeUid = this.getActiveProfileId();
        if (!activeUid) return [];

        const sessions = this.getAllSessions();
        return sessions
            .filter(s => s.userId === activeUid)
            .sort((a, b) => b.timestamp - a.timestamp); // Chronological descending order
    }

    /**
     * Retrieves exclusively sensory Gabor training sessions for the active user (SSoT compliant)
     */
    static getGaborSessionsForActiveUser() {
        return this.getSessionsForActiveUser().filter(s => s.protocol !== 'synoptophore');
    }

    /**
     * Retrieves exclusively motor Synoptophore training sessions for the active user (SSoT compliant)
     */
    static getSynopSessionsForActiveUser() {
        return this.getSessionsForActiveUser().filter(s => s.protocol === 'synoptophore');
    }

    /**
     * Purges historical sessions associated exclusively with the active patient context.
     */
    static clearActiveUserHistory() {
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
     * One-time legacy database migrator.
     * Imports old monolithic gabor_history_v2 array into the new multi-user relational database.
     */
    static migrateLegacyDatabase() {
        try {
            const legacyHistoryRaw = localStorage.getItem('gabor_history_v2');
            if (!legacyHistoryRaw) return; // No legacy data to migrate

            const legacyHistory = JSON.parse(legacyHistoryRaw);
            if (Array.isArray(legacyHistory) && legacyHistory.length > 0) {
                const activeUid = this.getActiveProfileId();
                if (!activeUid) return;

                const sessions = this.getAllSessions();
                
                legacyHistory.forEach(item => {
                    // Check if this session was already migrated to prevent duplicates
                    const exists = sessions.some(s => s.id === item.id);
                    if (!exists) {
                        sessions.push({
                            id: item.id || 'ses_mig_' + Math.random().toString(36).substr(2, 9),
                            userId: activeUid,
                            timestamp: Date.now() - (1000 * 60 * 60 * 24), // Mock past date
                            score: item.score || 0,
                            total: item.total || 0,
                            level: item.level || 1,
                            contrast: item.contrast || 40,
                            protocol: item.protocol || 'custom',
                            speed: item.speed || 'adaptive',
                            isAnaglyph: item.isAnaglyph !== undefined ? item.isAnaglyph : true,
                            balance: item.balance !== undefined ? item.balance : 30
                        });
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