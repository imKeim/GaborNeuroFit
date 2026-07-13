/*
 * GaborNeuroFit - Declarative i18n Engine
 * Copyright (C) 2026 Pavel Korotkov
 */

import { Store } from '../store.js';

export let activeTranslations = {};

/**
 * Asynchronously loads localized JSON dictionaries from the static assets
 * and declaratively maps translation keys to data-i18n elements.
 */
export async function loadLanguage(lang) {
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
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) {
            el.textContent = t[key];
        }
    });

    // Resolve elements containing rich formatting markup safely via innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (t[key] !== undefined) {
            el.innerHTML = t[key];
        }
    });

    // Declaratively resolve input placeholders safely
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key] !== undefined) {
            el.placeholder = t[key];
        }
    });

    // Symmetrically handle procedural stage selector options
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('opt-stage-' + i);
        if (el) {
            el.textContent = i === 5 ? t.optStage5 : (lang === 'ru' ? `Этап ${i}` : `Stage ${i}`);
        }
    }

    // Synchronize the language selection dropdown value
    const selectLang = document.getElementById('select-lang');
    if (selectLang) selectLang.value = lang;
    
    return activeTranslations;
}