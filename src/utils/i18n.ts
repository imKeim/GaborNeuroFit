/**
 * @file i18n.ts
 * @description Declarative internationalization (i18n) engine.
 * Implements a data-driven DOM injection pattern using data-i18n attributes. 
 * Decouples translation dictionaries from application logic and ensures 
 * secure, localized text rendering.
 *
 * @copyright (C) 2026 Pavel Korotkov
 * @license GNU GPL v3
 */

import { Store } from '../store.js';
import type { Language } from '../types/clinical';

/** @description Global translation buffer used to cache active localized strings. */
export let activeTranslations: Record<string, string> = {};

/**
 * @description Asynchronously loads localized JSON dictionaries and hydrates the DOM.
 * 
 * @architecture
 * - Cascading Fallbacks: If the requested locale fails to load, the engine 
 *   automatically attempts to fetch the English (en.json) dictionary to maintain UI stability.
 * - SSoT Synchronization: Commits the new language selection to the global Store 
 *   and persists it to localStorage for state recovery.
 * 
 * @security
 * - XSS Prevention: Utilizes .textContent for standard nodes to ensure 
 *   dictionary strings are treated as literal data, not executable markup.
 * - Isolated Markup: Restricts .innerHTML injection strictly to elements 
 *   marked with [data-i18n-html].
 * 
 * @param {Language} lang - The target language code to load.
 * @returns {Promise<Record<string, string>>} The loaded translation dictionary.
 */
export async function loadLanguage(lang: Language): Promise<Record<string, string>> {
    try {
        const response = await fetch(`./i18n/${lang}.json`);
        activeTranslations = await response.json();
    } catch (e) {
        console.warn("Failed to load translation bundle, falling back to English:", e);
        try {
            const fallbackResponse = await fetch(`./i18n/en.json`);
            activeTranslations = await fallbackResponse.json();
        } catch (fallbackError) {
            console.error("Critical: Failed to load fallback English translation bundle:", fallbackError);
        }
    }

    Store.state.currentLang = lang;
    Store.saveSettings();

    // Dynamically update HTML lang attribute to let mobile screen readers (TalkBack/VoiceOver) switch speech engines instantly
    document.documentElement.lang = lang;

    const t = activeTranslations;

    // Declaratively resolve all plain text localization nodes safely via textContent
    document.querySelectorAll('[data-i18n]').forEach((el: Element) => {
        const key = el.getAttribute('data-i18n');
        if (key && t[key] !== undefined) {
            el.textContent = t[key];
        }
    });

    // Resolve elements containing rich formatting markup safely via innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach((el: Element) => {
        const key = el.getAttribute('data-i18n-html');
        if (key && t[key] !== undefined) {
            el.innerHTML = t[key];
        }
    });

    // Declaratively resolve input placeholders using strict DOM Type Guards
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el: Element) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && t[key] !== undefined) {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.placeholder = t[key];
            }
        }
    });

    return activeTranslations;
}