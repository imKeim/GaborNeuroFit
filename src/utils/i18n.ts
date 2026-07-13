/*
 * GaborNeuroFit - Declarative i18n Engine
 * Copyright (C) 2026 Pavel Korotkov
 *
 * Migrated to TypeScript: Extensively utilizes DOM Type Guards to strictly assign
 * textual properties (like placeholders) exclusively to valid input nodes without violations.
 */

import { Store } from '../store.js';
import type { Language } from '../types/clinical';

export let activeTranslations: Record<string, string> = {};

/**
 * @description Asynchronously loads localized JSON dictionaries from the static assets
 * and declaratively maps translation keys to data-i18n elements across the DOM tree.
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

    // Declaratively resolve input placeholders strictly guarding input node types
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el: Element) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && t[key] !== undefined) {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.placeholder = t[key];
            }
        }
    });

    // Symmetrically handle procedural stage selector options
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('opt-stage-' + i) as HTMLOptionElement | null;
        if (el) {
            el.textContent = i === 5 ? t.optStage5 : (lang === 'ru' ? `Этап ${i}` : `Stage ${i}`);
        }
    }

    // Synchronize the language selection dropdown value
    const selectLang = document.getElementById('select-lang') as HTMLSelectElement | null;
    if (selectLang) selectLang.value = lang;

    return activeTranslations;
}
