/*
 * GaborNeuroFit - High-Performance Dichoptic & Perceptual Learning Vision Therapy Suite
 * Copyright (C) 2026 Pavel Korotkov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details: <https://www.gnu.org/licenses/>
 */

document.addEventListener('touchstart', function (event) {
    if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
}, false);

const canvas = document.getElementById('gaborCanvas');
const ctx = canvas.getContext('2d');
const cross = document.getElementById('cross');

const btnStart = document.getElementById('btn-start');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

const contrastEl = document.getElementById('current-contrast');
const levelEl = document.getElementById('current-level');
const streakEl = document.getElementById('current-streak');
const leaderboardList = document.getElementById('leaderboard-list');

// Configuration panel DOM elements
const selectPresetMode = document.getElementById('select-preset-mode');
const selectStartLevel = document.getElementById('select-start-level');
const selectAutonext = document.getElementById('select-autonext');
const selectSessionLimit = document.getElementById('select-session-limit');

// Granular training controls
const selectFlashDuration = document.getElementById('select-flash-duration');
const chkStageAdvance = document.getElementById('chk-stage-advance');
const chkPeripheral = document.getElementById('chk-peripheral');
const chkCrowding = document.getElementById('chk-crowding');
const chkLowContrast = document.getElementById('chk-low-contrast');
const chkWideVariance = document.getElementById('chk-wide-variance');
const chkStatic = document.getElementById('chk-static');
const chkAnaglyph = document.getElementById('chk-anaglyph');
const chkFlicker = document.getElementById('chk-flicker');

// Anaglyph dichoptics controls
const selectRedSide = document.getElementById('select-red-side');
const selectLazySide = document.getElementById('select-lazy-side');
const rangeStrongAttenuation = document.getElementById('range-strong-attenuation');
const valStrongAttenuation = document.getElementById('val-strong-attenuation');
const btnFusionTest = document.getElementById('btn-fusion-test');
const anaglyphSettingsPanel = document.getElementById('anaglyph-settings-panel');

const infoModal = document.getElementById('info-modal');
const btnInfo = document.getElementById('btn-info');
const btnCloseModal = document.getElementById('btn-close-modal');

const settingsModal = document.getElementById('settings-modal');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

let audioCtx = null; // Web Audio API context
let isMuted = false; // Local silent run mode

// Activate audio context on the first user interaction (browser security requirement)
function initAudioOnFirstGesture() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx) {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const dummyOsc = audioCtx.createOscillator();
            const dummyGain = audioCtx.createGain();
            dummyGain.gain.setValueAtTime(0, audioCtx.currentTime);
            dummyOsc.connect(dummyGain);
            dummyGain.connect(audioCtx.destination);
            dummyOsc.start(0);
            dummyOsc.stop(audioCtx.currentTime + 0.01);
        }
    } catch (e) {
        console.warn("Audio Context init bypass:", e);
    }
    window.removeEventListener('click', initAudioOnFirstGesture);
    window.removeEventListener('touchstart', initAudioOnFirstGesture);
    window.removeEventListener('keydown', initAudioOnFirstGesture);
}
window.addEventListener('click', initAudioOnFirstGesture);
window.addEventListener('touchstart', initAudioOnFirstGesture, { passive: true });
window.addEventListener('keydown', initAudioOnFirstGesture);

// Core state variables
const sessionId = 'session_' + Date.now(); // Unique session ID for local leaderboard tracking
let currentAngleDeg = 0; 
let isWaitingForAnswer = false;
let score = 0;
let total = 0;

let autoContrast = 0.5; 
let correctStreak = 0; // Displayed accuracy streak
let staircaseStreak = 0; // Internal difficulty counter (resets every 3 correct answers)
let currentLevel = 1;
let currentLang = 'en';

// Granular training state (default values)
let presetMode = 'occlusion'; // Classic monocular patching as the default entry point
let sessionLimit = 0;

let allowStageAdvance = true; // Auto-advance/downgrade level based on accuracy
let flashDurationMode = 'adaptive'; // Options: adaptive, 100, 180, 200, 350
let isPeripheralEnabled = false; // Target peripheral eccentric shift
let isCrowdingEnabled = true; // Visual crowding distractors (flankers)
let allowLowContrast = false; // Permit contrast degradation down to 1%
let allowWideVariance = false; // Randomize line density and blur values
let isStaticEnabled = false; // Static mode (disable automatic stimulus hiding)
let isFlickerEnabled = false; // 10 Hz flicker stimulation
let isFusionLockEnabled = true; // High-performance zero-disparity frame stabilization

// Anaglyph dichoptics settings
let isAnaglyphEnabled = true;
let redEyeSide = 'left';
let lazyEyeSide = 'left';
let strongEyeContrastFactor = 0.3;
let isAnaglyphTestActive = false;

// Temporal sync variables
let nextFlashTimeoutId = null;
let flickerIntervalId = null; // Internal flicker interval handler
let lastRandomFreq = 0.08;
let lastRandomSigma = 40;
let lastOffsetX = 0;
let lastOffsetY = 0;

const translations = {
    en: {
        stage: "Stage",
        contrast: "Contrast",
        streak: "Streak",
        leaderboardTitle: "Local Leaderboard",
        noHistory: "No history available yet",
        startBtn: "START FLASH",
        nextBtn: "NEXT FLASH",
        reflashBtn: "RE-FLASH",
        leftBtn: "Left",
        rightBtn: "Right",
        correctLabel: "Correct",
        totalLabel: "Total",
        sessionCompleted: "Session complete! You completed {limit} attempts. Take a short break to rest your eyes.",
        modalTitle: "GaborNeuroFit Manual",
        secAboutTitle: "🧠 The Science: Training the Brain",
        secAboutText: "Amblyopia (lazy eye) is not an optical defect of the eye itself—it is a **neurological condition** of the visual cortex. Over time, the brain's primary visual area (V1) learns to actively suppress (ignore) the signals from the weaker eye. Gabor patches act as the 'letters' of the visual cortex. By forcing your weaker eye to resolve their tilt on the absolute edge of visibility, you trigger neural plasticity, rebuilding and sharpening degraded synaptic connections.",
        secInstructionsTitle: "🩹 Setup I: Monocular Occlusion (Patching)",
        secInstructionsText: "<li><strong>Application:</strong> Use this for 🩹 <strong>Classic Occlusion</strong> and ⚡ <strong>Cortical Speed Blitz</strong> protocols.</li><li><strong>Occlusion:</strong> Patch your healthy (strong) eye completely. Only train the amblyopic eye.</li><li><strong>Distance:</strong> Keep your device at arm's length (50–70 cm).</li><li><strong>Fixation:</strong> Fix your gaze strictly on the central cross (+). Press START and determine the Gabor patch tilt.</li>",
        secLevelsTitle: "🕶️ Setup II: Dichoptic 3D Protocols (Glasses)",
        secLevelsList: "<li>Use this setup for 🕶️ <strong>Binocular Balance</strong>, 🎯 <strong>Parafoveal Capture</strong>, or 🌀 <strong>Flicker Resonance</strong> protocols.</li><li><strong>Instructions:</strong> Do NOT patch your eye! Wear Red-Cyan 3D glasses (both eyes open).</li><li><strong>Calibration:</strong> Open the Settings and click 'Toggle Fusion Alignment Test' to calibrate. Closing your right eye should reveal only 'L' (Red), closing your left should reveal only 'R' (Cyan).</li><li><strong>Contrast Balancer:</strong> If your strong eye suppresses the lazy eye, lower the 'Strong Eye Contrast Balancer' slider in Settings until the central Gabor patch is clearly visible.</li>",
        secAmblyopiaTitle: "🔊 Acoustic Priming: Sound as a Neural Catalyst",
        secAmblyopiaText: "<li>🎋 <strong>Bamboo Click</strong> (Pre-cueing): Plays 180 ms before the flash, alerting the brain's temporal attention networks to prepare V1 neurons.</li><li>🔮 <strong>Crystal Chime</strong> (Success): A pleasant 3-note major chord (La-Do#-Mi) triggers a micro-release of dopamine, serving as a 'write-enable' signal to lock in successful synaptic weights.</li><li>🎵 <strong>Sliding Low Tone</strong> (Error): A gentle downward pitch provides non-intrusive error feedback to help the brain re-calibrate its thresholds.</li>",
        secRecommendationsTitle: "⚠️ Essential Safety & Training Rules",
        secRecommendationsText: "<li><strong>1. Focus ONLY on the central cross (+):</strong> Never chase the Gabor patch with your gaze. Resolving the tilt using your parafoveal vision trains receptive fields and corrects ocular misalignment.</li><li><strong>2. The 15-Minute Rule:</strong> Train daily for 100–150 attempts (approx. 15 minutes). Rest is critical for consolidating visual memory; overtraining only causes muscle fatigue.</li><li><strong>3. Listen to Your Body:</strong> Stop immediately if your eyes water or feel painful. Always prioritize comfort.</li>",
        
        // Settings UI Translations
        settingsTitle: "Configuration Panel",
        lblSettingPreset: "Training Protocol:",
        lblSettingStartLevel: "Starting Stage:",
        lblSettingAutonext: "Auto-Next Flash:",
        lblSettingLimit: "Session Limit:",
        
        optPresetOcclusion: "🩹 Classic Occlusion (Patching)",
        optPresetBinocular: "🕶️ Binocular Balance (3D)",
        optPresetPeripheral: "🎯 Parafoveal Capture (3D)",
        optPresetBlitz: "⚡ Cortical Speed Blitz",
        optPresetFlicker: "🌀 Flicker Resonance (3D)",
        optPresetCustom: "⚙️ Custom Configuration",
        
        lblSettingFlash: "Flash Exposure Speed:",
        optFlashAdaptive: "Adaptive (Fast)",
        optFlash100: "Extreme (100 ms)",
        optFlash180: "Fixed (180 ms)",
        optFlash200: "Standard (200 ms)",
        optFlash350: "Comfort / Zen (350 ms)",
        
        lblSettingStageAdvance: "Auto Stage Progression:",
        lblSettingPeripheral: "Peripheral Eccentricity:",
        lblSettingCrowding: "Visual Crowding (Flankers):",
        lblSettingLowContrast: "Ultra-Low Contrast (to 1%):",
        lblSettingWideVariance: "Vary Line Density (2-15 lines):",
        lblSettingStatic: "Static Stimulus (No Hide):",
        lblSettingAnaglyph: "3D Anaglyph Mode (Red-Cyan):",
        lblSettingRedSide: "Red Filter Lens Position:",
        lblSettingLazySide: "Lazy (Amblyopic) Eye:",
        lblSettingStrongAttenuation: "Strong Eye Contrast Balancer:",
        lblSettingFlicker: "Flicker Stimulation (10 Hz):",
        lblSettingFusionLock: "Binocular Fusion Lock:",
        btnFusionTestLabel: "Toggle Fusion Alignment Test",
        optSideLeft: "Left Eye",
        optSideRight: "Right Eye",
        
        optLimitOff: "No Limit",
        optAutonextOn: "Enabled",
        optAutonextOff: "Disabled",
        lblActiveMode: "Mode",
        lblActiveSpeed: "Speed",
        descModeExplanation: "Preset guidelines: Select an active protocol as a starting template. Modify any checkbox below to seamlessly transition into 'Custom' configuration mode.",
        optStage5: "Stage 5 (Extreme)",
        
        // Settings Tooltips (EN)
        helpPresetMode: "Clinical pre-sets (active macros) designed for binocular, peripheral, or rapid temporal stimulation.",
        helpStartLevel: "Initial spatial frequency. Higher stages have ultra-fine lines requiring greater visual acuity.",
        helpFlashDuration: "Exposure duration. Short flashes prevent compensatory eye movements (saccades) and force instant processing.",
        helpStageAdvance: "Allows the program to automatically advance or downgrade stages based on your accuracy streak.",
        helpPeripheral: "Randomly shifts the target to train parafoveal spatial localization and peripheral attentional fields.",
        helpCrowding: "Surrounds the target Gabor with side distractors to challenge lateral suppression and the crowding effect.",
        helpLowContrast: "Allows the adaptive contrast staircase to descend down to the extreme 1% threshold instead of 5%.",
        helpWideVariance: "Randomizes the line density and blur of the Gabor patch with every flash to prevent neural adaptation.",
        helpStatic: "The Gabor patch stays visible indefinitely until you choose an answer (no auto-hiding).",
        helpFlicker: "Pulsates the target at 10 Hz (Alpha-resonance) to bypass chronic cortical suppression of the weak eye.",
        helpAnaglyph: "Splits red/cyan color channels for dichoptic training. Requires Red-Cyan 3D glasses.",
        helpFusionLock: "Renders a zero-disparity frame and corner brackets to stabilize eye alignment and prevent dominant-eye suppression."
    },
    ru: {
        stage: "Этап",
        contrast: "Контраст",
        streak: "Серия",
        leaderboardTitle: "Таблица рекордов",
        noHistory: "История пуста",
        startBtn: "Старт",
        nextBtn: "Далее",
        reflashBtn: "Повторить вспышку",
        leftBtn: "Влево",
        rightBtn: "Вправо",
        correctLabel: "Верно",
        totalLabel: "Всего",
        sessionCompleted: "Сессия завершена! Вы выполнили {limit} попыток. Рекомендуется дать глазам отдохнуть.",
        modalTitle: "Справка GaborNeuroFit",
        secAboutTitle: "🧠 Суть метода: тренировка мозга, а не глаз",
        secAboutText: "Амблиопия («ленивый глаз») — это не оптический дефект, а **неврологическое нарушение**. Со временем зрительная кора вашего мозга (затылочная доля, зона V1) учится активно подавлять (игнорировать) сигналы от слабого глаза. Полосы Габора — это «алфавит» нашей зрительной коры. Пытаясь распознать их наклон на грани видимости, вы запускаете механизмы нейропластичности, принудительно восстанавливая и укрепляя угасшие синаптические связи.",
        secInstructionsTitle: "🩹 Сценарий I. С повязкой (окклюзия)",
        secInstructionsText: "<li><strong>Применение:</strong> используйте для протоколов 🩹 <strong>Классическая окклюзия</strong> и ⚡ <strong>Корковый блиц-детектор</strong>.</li><li><strong>Окклюзия:</strong> закройте здоровый (сильный) глаз плотной повязкой. Тренируется только ленивый глаз.</li><li><strong>Дистанция:</strong> держите устройство на расстоянии вытянутой руки (50–70 см).</li><li><strong>Фиксация:</strong> смотрите строго на центральный крест (+). Нажмите Старт и угадывайте наклон ленивым глазом.</li>",
        secLevelsTitle: "🕶️ Сценарий II. В 3D-очках (дихоптика)",
        secLevelsList: "<li>Используйте этот метод для протоколов 🕶️ <strong>Бинокулярный баланс</strong>, 🎯 <strong>Парафовеальный захват</strong> и 🌀 <strong>Фликкер-резонанс</strong>.</li><li><strong>Инструкция:</strong> надевать повязку НЕЛЬЗЯ. Наденьте красно-синие (Red-Cyan) 3D-очки (оба глаза должны быть открыты!).</li><li><strong>Калибровка:</strong> откройте настройки и запустите 'Тест слияния'. Закрыв правый глаз, вы должны видеть только букву 'L' (красную), закрыв левый — только букву 'R' (синюю).</li><li><strong>Баланс контраста:</strong> если здоровый глаз полностью глушит ленивый, плавно снижайте слайдер 'Контраст здорового глаза' в настройках до тех пор, пока картинка не соединится.</li>",
        secAmblyopiaTitle: "🔊 Акустический прайминг: звук как нейростимулятор",
        secAmblyopiaText: "<li>🎋 <strong>Бамбуковый клик</strong> (прайминг): звучит за 180 мс до вспышки, мгновенно мобилизуя внимание и подготавливая нейроны к приему изображения.</li><li>🔮 <strong>Хрустальный аккорд</strong> (успех): приятный 3-нотный мажорный перелив (La-Do#-Mi) вызывает микро-выброс дофамина, давая мозгу команду закрепить успешную комбинацию связей.</li><li>🎵 <strong>Глухой слайд</strong> (ошибка): низкий спадающий тон деликатно сообщает об ошибке, помогая мозгу перенастроить порог детекции.</li>",
        secRecommendationsTitle: "⚠️ Золотые правила безопасности",
        secRecommendationsText: "<li><strong>1. Фиксация:</strong> смотрите строго на центральный крест (+). Ни в коем случае не бегайте глазами за паттерном. Считывание наклона боковым зрением тренирует рецептивные поля нейронов и исправляет косоглазие.</li><li><strong>2. Регулярность:</strong> занимайтесь ежедневно по 100–150 попыток (около 15 минут). Мозгу нужен отдых для консолидации памяти, избыток тренировок приведет лишь к мышечной усталости.</li><li><strong>3. Предел боли:</strong> если глаза начали слезиться или болеть — сразу прекратите сессию. Всегда приоритезируйте комфорт.</li>",
        
        // Settings UI Translations (RU Sentence Case)
        settingsTitle: "Панель настроек",
        lblSettingPreset: "Протокол тренировки:",
        lblSettingStartLevel: "Начальный этап:",
        lblSettingAutonext: "Автоматический переход:",
        lblSettingLimit: "Лимит сессии:",
        
        optPresetOcclusion: "🩹 Классическая окклюзия (повязка)",
        optPresetBinocular: "🕶️ Бинокулярный баланс (3D)",
        optPresetPeripheral: "🎯 Парафовеальный захват (3D)",
        optPresetBlitz: "⚡ Корковый блиц-детектор",
        optPresetFlicker: "🌀 Фликкер-резонанс (3D)",
        optPresetCustom: "⚙️ Ручной режим",
        
        lblSettingFlash: "Скорость вспышки:",
        optFlashAdaptive: "Адаптивная (быстро)",
        optFlash100: "Экстремальная (100 мс)",
        optFlash180: "Фиксированная (180 мс)",
        optFlash200: "Стандартная (200 мс)",
        optFlash350: "Комфортная (350 мс)",
        
        lblSettingStageAdvance: "Движение по этапам:",
        lblSettingPeripheral: "Периферийный сдвиг:",
        lblSettingCrowding: "Дистракторы (краудинг):",
        lblSettingLowContrast: "Сверхнизкий контраст (до 1%):",
        lblSettingWideVariance: "Вариативность полос (2–15 линий):",
        lblSettingStatic: "Статичный стимул (без скрытия):",
        lblSettingAnaglyph: "3D-анаглифный режим (Red-Cyan):",
        lblSettingRedSide: "Красный светофильтр на глазу:",
        lblSettingLazySide: "Ленивый (слабый) глаз:",
        lblSettingStrongAttenuation: "Контраст здорового глаза:",
        lblSettingFlicker: "Фликкер-стимуляция (10 Гц):",
        lblSettingFusionLock: "Бинокулярная рамка-замок:",
        btnFusionTestLabel: "Запустить тест слияния",
        optSideLeft: "Левый глаз",
        optSideRight: "Правый глаз",
        
        optLimitOff: "Выкл",
        optAutonextOn: "Вкл (рекомендуется)",
        optAutonextOff: "Выкл (вручную)",
        lblActiveMode: "Режим",
        lblActiveSpeed: "Скорость",
        descModeExplanation: "Пояснение: выберите нужный лечебный шаблон. Изменение любой галочки ниже автоматически переведет вас в ручной режим настройки.",
        optStage5: "Этап 5 (экстремальный)",

        // Settings Tooltips (RU Sentence Case)
        helpPresetMode: "Готовые клинические макросы, оптимизированные под бинокулярную, периферийную, скоростную или фликкер-терапию.",
        helpStartLevel: "Начальная частота полос. Чем выше этап, тем тоньше полосы и выше нагрузка на зрительную кору.",
        helpFlashDuration: "Время показа паттерна. Короткая вспышка заставляет мозг обрабатывать сигнал рефлекторно.",
        helpStageAdvance: "Разрешает автоматический переход на следующий уровень при стабильно верных ответах.",
        helpPeripheral: "Случайно смещает паттерн на периферию для тренировки координации и бокового зрения.",
        helpCrowding: "Окружает центральную цель полосами-помехами для преодоления бинокулярного подавления и скученности.",
        helpLowContrast: "Позволяет контрасту опускаться вплоть до рекордных 1% для тренировки максимальной чувствительности.",
        helpWideVariance: "Случайно меняет толщину и плотность полос при каждой вспышке, чтобы мозг не привыкал к одной частоте.",
        helpStatic: "Паттерн не исчезает с экрана сам, а висит до тех пор, пока вы не выберете ответ.",
        helpFlicker: "Заставляет паттерн мигать с частотой 10 Гц, резонансно взламывая глубокое подавление ленивого глаза.",
        helpAnaglyph: "Разделяет цветовые каналы для тренировки в красно-синих 3D-очках.",
        helpFusionLock: "Отрисовывает рамку и уголки с нулевым сдвигом для стабилизации соосности глаз и предотвращения подавления."
    }
};

const levelFreqRanges = {
    1: { min: 0.04, max: 0.06 },
    2: { min: 0.07, max: 0.09 },
    3: { min: 0.10, max: 0.12 },
    4: { min: 0.13, max: 0.16 },
    5: { min: 0.17, max: 0.22 }
};

const levelSigmaRanges = {
    1: { min: 46, max: 54 },
    2: { min: 38, max: 45 },
    3: { min: 30, max: 37 },
    4: { min: 22, max: 28 },
    5: { min: 16, max: 21 }
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('gabor_lang', lang);
    
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`lang-${lang}`).classList.add('active');

    const t = translations[currentLang] || translations['en'];
    if (document.getElementById('lbl-stage')) document.getElementById('lbl-stage').innerText = t.stage;
    if (document.getElementById('lbl-contrast')) document.getElementById('lbl-contrast').innerText = t.contrast;
    if (document.getElementById('lbl-streak')) document.getElementById('lbl-streak').innerText = t.streak;
    if (document.getElementById('lbl-leaderboard-title')) document.getElementById('lbl-leaderboard-title').innerText = t.leaderboardTitle;
    
    if (!isWaitingForAnswer) {
        btnStart.innerText = (total > 0 && !autoAdvance) ? t.nextBtn : t.startBtn;
    } else {
        btnStart.innerText = t.reflashBtn;
    }
    
    if (document.getElementById('lbl-btn-left')) document.getElementById('lbl-btn-left').innerText = t.leftBtn;
    if (document.getElementById('lbl-btn-right')) document.getElementById('lbl-btn-right').innerText = t.rightBtn;

    // Handbook modal
    if (document.getElementById('modal-title')) document.getElementById('modal-title').innerText = t.modalTitle;
    if (document.getElementById('sec-about-title')) document.getElementById('sec-about-title').innerText = t.secAboutTitle;
    if (document.getElementById('sec-about-text')) document.getElementById('sec-about-text').innerHTML = t.secAboutText;
    
    if (document.getElementById('sec-instructions-title')) document.getElementById('sec-instructions-title').innerText = t.secInstructionsTitle;
    if (document.getElementById('sec-instructions-list')) document.getElementById('sec-instructions-list').innerHTML = t.secInstructionsText;
    
    if (document.getElementById('sec-levels-title')) document.getElementById('sec-levels-title').innerText = t.secLevelsTitle;
    if (document.getElementById('sec-levels-list')) document.getElementById('sec-levels-list').innerHTML = t.secLevelsList;
    
    if (document.getElementById('sec-amblyopia-title')) document.getElementById('sec-amblyopia-title').innerText = t.secAmblyopiaTitle;
    if (document.getElementById('sec-amblyopia-list')) document.getElementById('sec-amblyopia-list').innerHTML = t.secAmblyopiaText;
    
    if (document.getElementById('sec-recommendations-title')) document.getElementById('sec-recommendations-title').innerText = t.secRecommendationsTitle;
    if (document.getElementById('sec-recommendations-list')) document.getElementById('sec-recommendations-list').innerHTML = t.secRecommendationsText;

    // Settings modal
    if (document.getElementById('settings-title')) document.getElementById('settings-title').innerText = t.settingsTitle;
    if (document.getElementById('lbl-setting-mode')) document.getElementById('lbl-setting-mode').innerText = t.lblSettingPreset;
    if (document.getElementById('lbl-setting-start-level')) document.getElementById('lbl-setting-start-level').innerText = t.lblSettingStartLevel;
    if (document.getElementById('lbl-setting-autonext')) document.getElementById('lbl-setting-autonext').innerText = t.lblSettingAutonext;
    if (document.getElementById('lbl-setting-limit')) document.getElementById('lbl-setting-limit').innerText = t.lblSettingLimit;
    
    // Localize stages
    for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('opt-stage-' + i);
        if (el) {
            if (i === 5) {
                el.innerText = t.optStage5;
            } else {
                el.innerText = currentLang === 'ru' ? `Этап ${i}` : `Stage ${i}`;
            }
        }
    }
    
    // Bind tooltips
    const helpSpans = [
        'help-preset-mode', 'help-start-level', 'help-flash-duration',
        'help-stage-advance', 'help-peripheral', 'help-crowding',
        'help-low-contrast', 'help-wide-variance', 'help-static',
        'help-flicker', 'help-anaglyph', 'help-fusion-lock'
    ];
    const helpKeys = [
        'helpPresetMode', 'helpStartLevel', 'helpFlashDuration',
        'helpStageAdvance', 'helpPeripheral', 'helpCrowding',
        'helpLowContrast', 'helpWideVariance', 'helpStatic',
        'helpFlicker', 'helpAnaglyph', 'helpFusionLock'
    ];
    for (let i = 0; i < helpSpans.length; i++) {
        const el = document.getElementById(helpSpans[i]);
        if (el) el.innerText = t[helpKeys[i]];
    }
    
    // Map settings names
    if (document.getElementById('opt-preset-occlusion')) document.getElementById('opt-preset-occlusion').innerText = t.optPresetOcclusion;
    if (document.getElementById('opt-preset-binocular')) document.getElementById('opt-preset-binocular').innerText = t.optPresetBinocular;
    if (document.getElementById('opt-preset-peripheral')) document.getElementById('opt-preset-peripheral').innerText = t.optPresetPeripheral;
    if (document.getElementById('opt-preset-blitz')) document.getElementById('opt-preset-blitz').innerText = t.optPresetBlitz;
    if (document.getElementById('opt-preset-flicker')) document.getElementById('opt-preset-flicker').innerText = t.optPresetFlicker;
    if (document.getElementById('opt-preset-custom')) document.getElementById('opt-preset-custom').innerText = t.optPresetCustom;
    
    if (document.getElementById('lbl-setting-flash')) document.getElementById('lbl-setting-flash').innerText = t.lblSettingFlash;
    if (document.getElementById('opt-flash-adaptive')) document.getElementById('opt-flash-adaptive').innerText = t.optFlashAdaptive;
    if (document.getElementById('opt-flash-100')) document.getElementById('opt-flash-100').innerText = t.optFlash100;
    if (document.getElementById('opt-flash-180')) document.getElementById('opt-flash-180').innerText = t.optFlash180;
    if (document.getElementById('opt-flash-200')) document.getElementById('opt-flash-200').innerText = t.optFlash200;
    if (document.getElementById('opt-flash-350')) document.getElementById('opt-flash-350').innerText = t.optFlash350;
    
    if (document.getElementById('lbl-setting-stage-advance')) document.getElementById('lbl-setting-stage-advance').innerText = t.lblSettingStageAdvance;
    if (document.getElementById('lbl-setting-peripheral')) document.getElementById('lbl-setting-peripheral').innerText = t.lblSettingPeripheral;
    if (document.getElementById('lbl-setting-crowding')) document.getElementById('lbl-setting-crowding').innerText = t.lblSettingCrowding;
    if (document.getElementById('lbl-setting-low-contrast')) document.getElementById('lbl-setting-low-contrast').innerText = t.lblSettingLowContrast;
    if (document.getElementById('lbl-setting-wide-variance')) document.getElementById('lbl-setting-wide-variance').innerText = t.lblSettingWideVariance;
    if (document.getElementById('lbl-setting-static')) document.getElementById('lbl-setting-static').innerText = t.lblSettingStatic;
    if (document.getElementById('lbl-setting-anaglyph')) document.getElementById('lbl-setting-anaglyph').innerText = t.lblSettingAnaglyph;
    if (document.getElementById('lbl-setting-red-side')) document.getElementById('lbl-setting-red-side').innerText = t.lblSettingRedSide;
    if (document.getElementById('lbl-setting-lazy-side')) document.getElementById('lbl-setting-lazy-side').innerText = t.lblSettingLazySide;
    if (document.getElementById('lbl-setting-strong-attenuation')) document.getElementById('lbl-setting-strong-attenuation').innerText = t.lblSettingStrongAttenuation;
    if (document.getElementById('lbl-setting-flicker')) document.getElementById('lbl-setting-flicker').innerText = t.lblSettingFlicker;
    if (document.getElementById('lbl-setting-fusion-lock')) document.getElementById('lbl-setting-fusion-lock').innerText = t.lblSettingFusionLock;
    if (document.getElementById('btn-fusion-test')) document.getElementById('btn-fusion-test').innerText = t.btnFusionTestLabel;

    // Selector options
    const optRedLeft = document.getElementById('opt-red-left');
    const optRedRight = document.getElementById('opt-red-right');
    const optLazyLeft = document.getElementById('opt-lazy-left');
    const optLazyRight = document.getElementById('opt-lazy-right');
    if (optRedLeft) optRedLeft.innerText = t.optSideLeft;
    if (optRedRight) optRedRight.innerText = t.optSideRight;
    if (optLazyLeft) optLazyLeft.innerText = t.optSideLeft;
    if (optLazyRight) optLazyRight.innerText = t.optSideRight;

    if (document.getElementById('opt-limit-off')) document.getElementById('opt-limit-off').innerText = t.optLimitOff;
    if (document.getElementById('opt-autonext-on')) document.getElementById('opt-autonext-on').innerText = t.optAutonextOn;
    if (document.getElementById('opt-autonext-off')) document.getElementById('opt-autonext-off').innerText = t.optAutonextOff;
    if (document.getElementById('desc-mode-explanation')) document.getElementById('desc-mode-explanation').innerText = t.descModeExplanation;

    if (document.getElementById('lbl-active-mode')) document.getElementById('lbl-active-mode').innerText = t.lblActiveMode;
    if (document.getElementById('lbl-active-speed')) document.getElementById('lbl-active-speed').innerText = t.lblActiveSpeed;

    updateScoreBoardText();
    updateLeaderboardDisplay();
    updateStatusBarDisplay();
    
    // Parse vector emojis
    if (window.twemoji) twemoji.parse(document.body);
}

// Check configuration patterns to identify matched clinical protocols (macros)
function detectMatchingPreset() {
    if (
        allowStageAdvance === true &&
        flashDurationMode === 'adaptive' &&
        isPeripheralEnabled === false &&
        isCrowdingEnabled === false &&
        isStaticEnabled === false &&
        isAnaglyphEnabled === false &&
        allowWideVariance === false &&
        isFlickerEnabled === false &&
        isFusionLockEnabled === false
    ) return 'occlusion';

    if (
        allowStageAdvance === true &&
        flashDurationMode === 'adaptive' &&
        isPeripheralEnabled === false &&
        isCrowdingEnabled === true &&
        isStaticEnabled === false &&
        isAnaglyphEnabled === true &&
        allowWideVariance === false &&
        isFlickerEnabled === false &&
        isFusionLockEnabled === true
    ) return 'binocular';

    if (
        allowStageAdvance === true &&
        flashDurationMode === '180' &&
        isPeripheralEnabled === true &&
        isCrowdingEnabled === false &&
        isStaticEnabled === false &&
        isAnaglyphEnabled === true &&
        allowWideVariance === false &&
        isFlickerEnabled === false &&
        isFusionLockEnabled === true
    ) return 'peripheral';

    if (
        allowStageAdvance === true &&
        flashDurationMode === '100' &&
        isPeripheralEnabled === false &&
        isCrowdingEnabled === false &&
        isStaticEnabled === false &&
        isAnaglyphEnabled === false &&
        allowWideVariance === true &&
        isFlickerEnabled === false &&
        isFusionLockEnabled === false
    ) return 'blitz';

    if (
        allowStageAdvance === true &&
        flashDurationMode === 'adaptive' &&
        isPeripheralEnabled === false &&
        isCrowdingEnabled === true &&
        isStaticEnabled === true &&
        isAnaglyphEnabled === true &&
        allowWideVariance === false &&
        isFlickerEnabled === true &&
        isFusionLockEnabled === true
    ) return 'flicker';

    return 'custom';
}

// Apply visual templates for preset modes (retains hardware calibration states)
function applyPresetTemplate(mode) {
    presetMode = mode;
    if (mode === 'occlusion') {
        allowStageAdvance = true;
        flashDurationMode = 'adaptive';
        isPeripheralEnabled = false;
        isCrowdingEnabled = false;
        isStaticEnabled = false;
        isAnaglyphEnabled = false;
        allowWideVariance = false;
        isFlickerEnabled = false;
        isFusionLockEnabled = false;
    } else if (mode === 'binocular') {
        allowStageAdvance = true;
        flashDurationMode = 'adaptive';
        isPeripheralEnabled = false;
        isCrowdingEnabled = true;
        isStaticEnabled = false;
        isAnaglyphEnabled = true;
        allowWideVariance = false;
        isFlickerEnabled = false;
        isFusionLockEnabled = true;
    } else if (mode === 'peripheral') {
        allowStageAdvance = true;
        flashDurationMode = '180';
        isPeripheralEnabled = true;
        isCrowdingEnabled = false;
        isStaticEnabled = false;
        isAnaglyphEnabled = true;
        allowWideVariance = false;
        isFlickerEnabled = false;
        isFusionLockEnabled = true;
    } else if (mode === 'blitz') {
        allowStageAdvance = true;
        flashDurationMode = '100';
        isPeripheralEnabled = false;
        isCrowdingEnabled = false;
        isStaticEnabled = false;
        isAnaglyphEnabled = false;
        allowWideVariance = true;
        isFlickerEnabled = false;
        isFusionLockEnabled = false;
    } else if (mode === 'flicker') {
        allowStageAdvance = true;
        flashDurationMode = 'adaptive';
        isPeripheralEnabled = false;
        isCrowdingEnabled = true;
        isStaticEnabled = true;
        isAnaglyphEnabled = true;
        allowWideVariance = false;
        isFlickerEnabled = true;
        isFusionLockEnabled = true;
    }
    
    // Sync checkbox controls
    if (chkStageAdvance) chkStageAdvance.checked = allowStageAdvance;
    if (selectFlashDuration) selectFlashDuration.value = flashDurationMode;
    if (chkPeripheral) chkPeripheral.checked = isPeripheralEnabled;
    if (chkCrowding) chkCrowding.checked = isCrowdingEnabled;
    if (chkStatic) chkStatic.checked = isStaticEnabled;
    if (chkAnaglyph) chkAnaglyph.checked = isAnaglyphEnabled;
    if (chkWideVariance) chkWideVariance.checked = allowWideVariance;
    if (chkFlicker) chkFlicker.checked = isFlickerEnabled;
    if (chkFusionLock) chkFusionLock.checked = isFusionLockEnabled;

    if (anaglyphSettingsPanel) {
        anaglyphSettingsPanel.style.display = isAnaglyphEnabled ? 'block' : 'none';
    }

    updateStatusBarDisplay();
}

// Read parameters from custom UI forms
function syncStateFromUI() {
    if (chkStageAdvance) allowStageAdvance = chkStageAdvance.checked;
    if (selectFlashDuration) flashDurationMode = selectFlashDuration.value;
    if (chkPeripheral) isPeripheralEnabled = chkPeripheral.checked;
    if (chkCrowding) isCrowdingEnabled = chkCrowding.checked;
    if (chkLowContrast) allowLowContrast = chkLowContrast.checked;
    if (chkWideVariance) allowWideVariance = chkWideVariance.checked;
    if (chkStatic) isStaticEnabled = chkStatic.checked;
    if (chkAnaglyph) isAnaglyphEnabled = chkAnaglyph.checked;
    if (chkFlicker) isFlickerEnabled = chkFlicker.checked;
    if (chkFusionLock) isFusionLockEnabled = chkFusionLock.checked;

    // Direct hardware parameters (not bound by preset transitions)
    if (selectRedSide) redEyeSide = selectRedSide.value;
    if (selectLazySide) lazyEyeSide = selectLazySide.value;
    if (rangeStrongAttenuation) strongEyeContrastFactor = parseFloat(rangeStrongAttenuation.value) / 100;
    if (selectStartLevel) currentLevel = parseInt(selectStartLevel.value);
    if (selectAutonext) autoAdvance = (selectAutonext.value === "true");
    if (selectSessionLimit) sessionLimit = parseInt(selectSessionLimit.value);

    // Auto-evaluate preset transitions
    presetMode = detectMatchingPreset();
    if (selectPresetMode) selectPresetMode.value = presetMode;

    if (anaglyphSettingsPanel) {
        anaglyphSettingsPanel.style.display = isAnaglyphEnabled ? 'block' : 'none';
    }

    updateStatusBarDisplay();
}

function updatePresetUI() {
    // Keep configuration controls unlocked and completely accessible
    if (selectStartLevel) selectStartLevel.disabled = false;
    if (selectAutonext) selectAutonext.disabled = false;
    if (selectSessionLimit) selectSessionLimit.disabled = false;
    if (selectRedSide) selectRedSide.disabled = false;
    if (selectLazySide) selectLazySide.disabled = false;
    if (rangeStrongAttenuation) rangeStrongAttenuation.disabled = false;
    if (btnFusionTest) btnFusionTest.disabled = false;

    if (selectFlashDuration) selectFlashDuration.disabled = false;
    if (chkStageAdvance) chkStageAdvance.disabled = false;
    if (chkPeripheral) chkPeripheral.disabled = false;
    if (chkCrowding) chkCrowding.disabled = false;
    if (chkLowContrast) chkLowContrast.disabled = false;
    if (chkWideVariance) chkWideVariance.disabled = false;
    if (chkStatic) chkStatic.disabled = false;
    if (chkAnaglyph) chkAnaglyph.disabled = false;
    if (chkFlicker) chkFlicker.disabled = false;
    if (chkFusionLock) chkFusionLock.disabled = false;

    if (presetMode !== 'custom') {
        applyPresetTemplate(presetMode);
    }

    if (anaglyphSettingsPanel) {
        anaglyphSettingsPanel.style.display = isAnaglyphEnabled ? 'block' : 'none';
    }
}

function updateStatusBarDisplay() {
    const t = translations[currentLang] || translations['en'];
    let modeStr = t.optPresetOcclusion;
    let speedStr = "Adaptive";

    if (presetMode === 'occlusion') {
        modeStr = t.optPresetOcclusion;
    } else if (presetMode === 'binocular') {
        modeStr = t.optPresetBinocular;
    } else if (presetMode === 'peripheral') {
        modeStr = t.optPresetPeripheral;
    } else if (presetMode === 'blitz') {
        modeStr = t.optPresetBlitz;
    } else if (presetMode === 'flicker') {
        modeStr = t.optPresetFlicker;
    } else if (presetMode === 'custom') {
        modeStr = t.optPresetCustom;
    }

    if (flashDurationMode === '100') {
        speedStr = "100 ms";
    } else if (flashDurationMode === '180') {
        speedStr = "180 ms";
    } else if (flashDurationMode === '200') {
        speedStr = "200 ms";
    } else if (flashDurationMode === '350') {
        speedStr = "350 ms";
    } else {
        if (currentLevel === 1) speedStr = "220 ms";
        else if (currentLevel === 2) speedStr = "200 ms";
        else if (currentLevel === 3) speedStr = "180 ms";
        else if (currentLevel === 4) speedStr = "150 ms";
        else if (currentLevel === 5) speedStr = "120 ms";
    }

    const valActiveMode = document.getElementById('val-active-mode');
    const valActiveSpeed = document.getElementById('val-active-speed');
    if (valActiveMode) valActiveMode.innerText = modeStr;
    if (valActiveSpeed) valActiveSpeed.innerText = speedStr;
}

// High-performance hardware-accelerated drawing helper for zero-disparity fusions locks
function drawFusionLockFrame(targetCtx) {
    // Render zero-disparity frame using a neutral dark slate color to prevent chromatopica distortion
    targetCtx.strokeStyle = '#2d3548';
    targetCtx.lineWidth = 2;
    
    // Continuous outer peripheral frame
    targetCtx.beginPath();
    targetCtx.rect(8, 8, 240, 240);
    targetCtx.stroke();
    
    // Four corner L-brackets providing high spatial frequency alignment cues
    targetCtx.lineWidth = 1.5;
    
    // Top-left bracket
    targetCtx.beginPath();
    targetCtx.moveTo(28, 14);
    targetCtx.lineTo(14, 14);
    targetCtx.lineTo(14, 28);
    targetCtx.stroke();
    
    // Top-right bracket
    targetCtx.beginPath();
    targetCtx.moveTo(228, 14);
    targetCtx.lineTo(242, 14);
    targetCtx.lineTo(242, 28);
    targetCtx.stroke();
    
    // Bottom-left bracket
    targetCtx.beginPath();
    targetCtx.moveTo(14, 228);
    targetCtx.lineTo(14, 242);
    targetCtx.lineTo(28, 242);
    targetCtx.stroke();
    
    // Bottom-right bracket
    targetCtx.beginPath();
    targetCtx.moveTo(242, 228);
    targetCtx.lineTo(242, 242);
    targetCtx.lineTo(228, 242);
    targetCtx.stroke();
}

function drawGabor(angleDeg, contrast, freq, sigma, offsetX = 0, offsetY = 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;

    const isCrowding = isCrowdingEnabled;
    const distAngleRad = 0; 
    const flankerOffset = sigma * 2.0; 

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - (cx + offsetX);
            const dy = y - (cy + offsetY);

            // Modulate central Gabor target (specifically presented to amblyopic eye)
            const x_theta = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
            const y_theta = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
            const gaussian = Math.exp(-(x_theta * x_theta + y_theta * y_theta) / (2 * sigma * sigma));
            const cosine = Math.cos(2 * Math.PI * x_theta * freq);
            
            // Soft fading of canvas borders
            const distFromCanvasCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            let fade = 1.0;
            if (distFromCanvasCenter > 85) {
                const t = Math.min(1.0, (distFromCanvasCenter - 85) / (128 - 85));
                fade = 0.5 + 0.5 * Math.cos(Math.PI * t);
            }
            if (distFromCanvasCenter >= 128) {
                fade = 0.0;
            }

            let centralGaborValue = gaussian * cosine * fade;

            // Modulate crowding distractors (presented to dominant eye)
            let flankerGaborValue = 0;
            if (isCrowding) {
                const dy1 = y - (cy - flankerOffset);
                const x_t1 = dx * Math.cos(distAngleRad) + dy1 * Math.sin(distAngleRad);
                const y_t1 = -dx * Math.sin(distAngleRad) + dy1 * Math.cos(distAngleRad);
                const g1 = Math.exp(-(x_t1 * x_t1 + y_t1 * y_t1) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t1 * freq);

                const dy2 = y - (cy + flankerOffset);
                const x_t2 = dx * Math.cos(distAngleRad) + dy2 * Math.sin(distAngleRad);
                const y_t2 = -dx * Math.sin(distAngleRad) + dy2 * Math.cos(distAngleRad);
                const g2 = Math.exp(-(x_t2 * x_t2 + y_t2 * y_t2) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * x_t2 * freq);

                flankerGaborValue = (g1 + g2) * 0.55 * fade;
            }

            let R = 127;
            let G = 127;
            let B = 127;

            if (isAnaglyphEnabled) {
                // Apply specific ocular balance coefficients
                const lazyContrast = contrast;
                const strongContrast = contrast * strongEyeContrastFactor;
                
                // Red glass position mapping
                const isLazyEyeRed = (lazyEyeSide === redEyeSide);
                
                let lazyVal = centralGaborValue * 127 * lazyContrast;
                let strongVal = flankerGaborValue * 127 * strongContrast;

                if (isLazyEyeRed) {
                    R = 127 + lazyVal; 
                    G = 127 + strongVal; 
                    B = 127 + strongVal;
                } else {
                    R = 127 + strongVal; 
                    G = 127 + lazyVal; 
                    B = 127 + lazyVal;
                }
            } else {
                // Classic monocular greyscale mode
                let totalGaborValue = centralGaborValue + flankerGaborValue;
                let intensity = 127 + totalGaborValue * 127 * contrast;
                R = G = B = intensity;
            }

            R = Math.max(0, Math.min(255, R)); 
            G = Math.max(0, Math.min(255, G)); 
            B = Math.max(0, Math.min(255, B)); 
            
            const idx = (y * width + x) * 4;
            data[idx] = R;     
            data[idx + 1] = G; 
            data[idx + 2] = B; 
            data[idx + 3] = 255;       
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Apply zero-disparity foveal-perfusion locks post Gabor generation
    if (isFusionLockEnabled) {
        drawFusionLockFrame(ctx);
    }
}

// Generate diagnostic calibration card
function drawFusionTestPattern() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set base neutral background
    ctx.fillStyle = '#7f7f7f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Draw monocular calibration markers
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(15, 15, 20, 20);
    ctx.fillRect(canvas.width - 35, 15, 20, 20);
    ctx.fillRect(15, canvas.height - 35, 20, 20);
    ctx.fillRect(canvas.width - 35, canvas.height - 35, 20, 20);
    
    ctx.font = 'bold 42px Overpass';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Isolation of Left (Red) target
    ctx.fillStyle = 'rgb(255, 127, 127)'; 
    ctx.fillText('L', cx - 55, cy);
    
    // Isolation of Right (Cyan) target
    ctx.fillStyle = 'rgb(127, 255, 255)'; 
    ctx.fillText('R', cx + 55, cy);

    // Keep fusion locks visual during test pattern to verify baseline alignment
    if (isFusionLockEnabled) {
        drawFusionLockFrame(ctx);
    }
}

// Play organic audio pre-cue click
function playCueTone() {
    if (isMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        // Use a tiny 15ms buffer lookahead to prevent glitch sounds
        const now = audioCtx.currentTime + 0.015;
        
        // Bamboo hit tone (950 Hz)
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950, now);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.18, now + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        // Metal edge hit component (1600 Hz)
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
        console.warn("AudioContext cue bypass:", e);
    }
}

// Play negative-feedback downward sweep tone (220 Hz to 140 Hz)
function playErrorTone() {
    if (isMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime + 0.015;
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.20); 
        
        // Psychoacoustic compensation
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.38, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(now);
        osc.stop(now + 0.20);
    } catch (e) {
        console.warn("AudioContext error bypass:", e);
    }
}

// Play crystal chime major chord (La-Do#-Mi)
function playSuccessTone() {
    if (isMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime + 0.015;
        
        // La root note (880 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.005);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        // Do# third note (1100 Hz, delayed)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, now + 0.03);
        gain2.gain.setValueAtTime(0, now + 0.03);
        gain2.gain.linearRampToValueAtTime(0.10, now + 0.035);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        
        // Mi perfect fifth note (1320 Hz, delayed)
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1320, now + 0.060);
        gain3.gain.setValueAtTime(0, now + 0.060);
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
        
        osc2.start(now + 0.030);
        osc2.stop(now + 0.28);
        
        osc3.start(now + 0.060);
        osc3.stop(now + 0.45);
    } catch (e) {
        console.warn("AudioContext success bypass:", e);
    }
}

function reFlashCurrentGabor() {
    const t = translations[currentLang] || translations['en'];
    btnStart.innerText = "...";

    drawGabor(currentAngleDeg, autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY);

    let flashDuration = 200;
    if (flashDurationMode === '100') {
        flashDuration = 100;
    } else if (flashDurationMode === '180') {
        flashDuration = 180;
    } else if (flashDurationMode === '200') {
        flashDuration = 200;
    } else if (flashDurationMode === '350') {
        flashDuration = 350;
    } else {
        if (currentLevel === 1) flashDuration = 220;
        else if (currentLevel === 2) flashDuration = 200;
        else if (currentLevel === 3) flashDuration = 180;
        else if (currentLevel === 4) flashDuration = 150;
        else if (currentLevel === 5) flashDuration = 120;
    }

    cross.style.display = 'none';
    canvas.style.display = 'block';

    if (!isStaticEnabled) {
        setTimeout(() => {
            canvas.style.display = 'none';
            cross.style.display = 'block';
            btnStart.innerText = t.reflashBtn;
        }, flashDuration);
    } else {
        if (isFlickerEnabled) {
            let flickerState = true;
            if (flickerIntervalId) clearInterval(flickerIntervalId);
            flickerIntervalId = setInterval(() => {
                flickerState = !flickerState;
                canvas.style.display = flickerState ? 'block' : 'none';
            }, 50); 
        }
        btnStart.innerText = t.reflashBtn;
    }
}

function runFlash() {
    if (isWaitingForAnswer) {
        playCueTone();
        setTimeout(reFlashCurrentGabor, 180);
        return;
    }

    if (nextFlashTimeoutId) {
        clearTimeout(nextFlashTimeoutId);
        nextFlashTimeoutId = null;
    }
    
    btnStart.innerText = "...";
    playCueTone();
    setTimeout(executeGaborFlash, 180);
}

function executeGaborFlash() {
    const t = translations[currentLang] || translations['en'];

    do {
        currentAngleDeg = Math.floor(Math.random() * 160) - 80;
    } while (Math.abs(currentAngleDeg) < 15);
    
    contrastEl.innerText = Math.round(autoContrast * 100);
    levelEl.innerText = currentLevel;
    streakEl.innerText = correctStreak;
    
    let crossSize = 36;
    if (currentLevel === 1) crossSize = 36;
    else if (currentLevel === 2) crossSize = 28;
    else if (currentLevel === 3) crossSize = 22;
    else if (currentLevel === 4) crossSize = 16;
    else if (currentLevel === 5) crossSize = 12;
    cross.style.fontSize = crossSize + 'px';
    
    const freqRange = levelFreqRanges[currentLevel] || levelFreqRanges[1];
    lastRandomFreq = Math.random() * (freqRange.max - freqRange.min) + freqRange.min;
    
    const sigmaRange = levelSigmaRanges[currentLevel] || levelSigmaRanges[1];
    lastRandomSigma = Math.random() * (sigmaRange.max - sigmaRange.min) + sigmaRange.min;

    if (allowWideVariance) {
        const randType = Math.random();
        if (randType < 0.35) {
            lastRandomFreq = Math.random() * (0.04 - 0.03) + 0.03;
            lastRandomSigma = Math.random() * (45 - 35) + 35;
        } else if (randType < 0.50) {
            lastRandomFreq = Math.random() * (0.16 - 0.12) + 0.12;
            lastRandomSigma = Math.random() * (40 - 32) + 32;
        }
    }

    // Spatial summation contrast-to-size coupling
    const summationThreshold = 0.12;
    if (autoContrast < summationThreshold) {
        const summationMultiplier = 1.0 + (summationThreshold - autoContrast) * 3.0;
        lastRandomSigma = lastRandomSigma * summationMultiplier;
    }
    
    lastOffsetX = 0;
    lastOffsetY = 0;
    if (isPeripheralEnabled) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = 55; 
        lastOffsetX = Math.cos(angle) * distance;
        lastOffsetY = Math.sin(angle) * distance;
    }

    drawGabor(currentAngleDeg, autoContrast, lastRandomFreq, lastRandomSigma, lastOffsetX, lastOffsetY);
    
    let flashDuration = 200;
    if (flashDurationMode === '100') {
        flashDuration = 100;
    } else if (flashDurationMode === '180') {
        flashDuration = 180;
    } else if (flashDurationMode === '200') {
        flashDuration = 200;
    } else if (flashDurationMode === '350') {
        flashDuration = 350;
    } else {
        if (currentLevel === 1) flashDuration = 220;
        else if (currentLevel === 2) flashDuration = 200;
        else if (currentLevel === 3) flashDuration = 180;
        else if (currentLevel === 4) flashDuration = 150;
        else if (currentLevel === 5) flashDuration = 120;
    }

    updateStatusBarDisplay();
    
    cross.style.display = 'none';
    canvas.style.display = 'block';
    isWaitingForAnswer = true;

    if (!isStaticEnabled) {
        setTimeout(() => {
            canvas.style.display = 'none';
            cross.style.display = 'block';
            btnStart.innerText = t.reflashBtn;
        }, flashDuration);
    } else {
        if (isFlickerEnabled) {
            let flickerState = true;
            if (flickerIntervalId) clearInterval(flickerIntervalId);
            flickerIntervalId = setInterval(() => {
                flickerState = !flickerState;
                canvas.style.display = flickerState ? 'block' : 'none';
            }, 50); 
        }
        btnStart.innerText = t.reflashBtn;
    }
}

function triggerMilestoneFlash(callback) {
    let count = 0;
    const interval = setInterval(() => {
        document.body.style.backgroundColor = count % 2 === 0 ? "#244263" : "#7f7f7f";
        count++;
        if (count >= 6) {
            clearInterval(interval);
            document.body.style.backgroundColor = "#7f7f7f";
            if (callback) callback();
        }
    }, 120);
}

function checkAnswer(userChoice) {
    if (!isWaitingForAnswer) return;
    isWaitingForAnswer = false; 
    
    if (flickerIntervalId) {
        clearInterval(flickerIntervalId);
        flickerIntervalId = null;
    }
    canvas.style.display = 'none';
    cross.style.display = 'block';

    if (nextFlashTimeoutId) {
        clearTimeout(nextFlashTimeoutId);
        nextFlashTimeoutId = null;
    }

    const correctAnswer = currentAngleDeg < 0 ? 'left' : 'right';
    total++;
    
    const minContrast = allowLowContrast ? 0.01 : 0.05;

    if (userChoice === correctAnswer) {
        score++;
        correctStreak++;
        staircaseStreak++;
        playSuccessTone(); 
        document.body.style.backgroundColor = "#244263"; 
        
        if (staircaseStreak >= 3) {
            if (autoContrast <= minContrast) {
                if (currentLevel < 5) {
                    currentLevel++;
                    autoContrast = 0.40;
                }
            } else {
                autoContrast = Math.max(minContrast, autoContrast - 0.05);
            }
            staircaseStreak = 0;
        }
    } else {
        correctStreak = 0;
        staircaseStreak = 0;
        playErrorTone(); 
        document.body.style.backgroundColor = "#4d2424"; 
        if (allowStageAdvance && autoContrast >= 0.70 && currentLevel > 1) {
            currentLevel--;
            autoContrast = 0.30;
        } else {
            autoContrast = Math.min(1.0, autoContrast + 0.08);
        }
    }

    setTimeout(() => { document.body.style.backgroundColor = "#7f7f7f"; }, 150);
    
    updateScoreBoardText();
    streakEl.innerText = correctStreak;
    
    try {
        saveSession();
        updateLeaderboardDisplay();
    } catch (e) {
        console.warn("Storage write bypassed:", e);
    }

    if (sessionLimit > 0 && total >= sessionLimit) {
        setTimeout(() => {
            triggerMilestoneFlash(() => {
                const t = translations[currentLang] || translations['en'];
                alert(t.sessionCompleted.replace("{limit}", sessionLimit));
            });
        }, 400);
        return;
    }
    
    const t = translations[currentLang] || translations['en'];

    if (autoAdvance) {
        btnStart.innerText = "...";
        nextFlashTimeoutId = setTimeout(runFlash, 900);
    } else {
        btnStart.innerText = t.nextBtn;
    }
}

function saveSession() {
    if (total === 0) return;
    const history = JSON.parse(localStorage.getItem('gabor_history_v2') || '[]');
    const currentSession = {
        id: sessionId, 
        score: score,
        total: total,
        level: currentLevel,
        contrast: Math.round(autoContrast * 100),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    const existingIdx = history.findIndex(h => h.id === sessionId);
    if (existingIdx > -1) {
        history[existingIdx] = currentSession;
    } else {
        history.push(currentSession);
    }
    
    history.sort((a, b) => b.score - a.score);
    localStorage.setItem('gabor_history_v2', JSON.stringify(history.slice(0, 5)));
}

function updateLeaderboardDisplay() {
    const history = JSON.parse(localStorage.getItem('gabor_history_v2') || '[]');
    const t = translations[currentLang] || translations['en'];
    
    if (history.length === 0) {
        leaderboardList.innerHTML = `<li class="leaderboard-item" style="justify-content: center; color: #cbd5e1;">${t.noHistory}</li>`;
        return;
    }
    
    const topSessions = history.slice(0, 5);
    leaderboardList.innerHTML = topSessions.map((item, idx) => {
        const resultsText = currentLang === 'ru' 
            ? `Очки: <strong>${item.score}/${item.total}</strong> | Этап: ${item.level} | Контр: ${item.contrast}%`
            : `Score: <strong>${item.score}/${item.total}</strong> | Lvl: ${item.level} | Cont: ${item.contrast}%`;
        
        return `
            <li class="leaderboard-item">
                <span>#${idx + 1} (${item.time || '00:00'})</span>
                <span>${resultsText}</span>
            </li>
        `;
    }).join('');
}

function updateScoreBoardText() {
    const t = translations[currentLang] || translations['en'];
    const scoreBoardTextEl = document.getElementById('score-text');
    if (scoreBoardTextEl) {
        scoreBoardTextEl.innerHTML = `${t.correctLabel}: <strong>${score}</strong> / ${t.totalLabel}: <strong>${total}</strong>`;
    }
}

function loadSettings() {
    try {
        presetMode = localStorage.getItem('gabor_preset_mode') || 'occlusion'; 
        currentLevel = parseInt(localStorage.getItem('gabor_start_level') || '1');
        
        const savedAuto = localStorage.getItem('gabor_autonext');
        autoAdvance = (savedAuto !== 'false'); 
        
        sessionLimit = parseInt(localStorage.getItem('gabor_limit') || '0');
        
        allowStageAdvance = localStorage.getItem('gabor_stage_advance') !== 'false';
        flashDurationMode = localStorage.getItem('gabor_flash_mode') || 'adaptive';
        isPeripheralEnabled = localStorage.getItem('gabor_peripheral') === 'true';
        isCrowdingEnabled = localStorage.getItem('gabor_crowding') === 'true';
        allowLowContrast = localStorage.getItem('gabor_low_contrast') === 'true';
        allowWideVariance = localStorage.getItem('gabor_wide_variance') === 'true';
        isStaticEnabled = localStorage.getItem('gabor_static') === 'true';
        isAnaglyphEnabled = localStorage.getItem('gabor_anaglyph') === 'true';
        redEyeSide = localStorage.getItem('gabor_red_side') || 'left';
        lazyEyeSide = localStorage.getItem('gabor_lazy_side') || 'left';
        strongEyeContrastFactor = parseFloat(localStorage.getItem('gabor_strong_factor') || '0.3');
        isFlickerEnabled = localStorage.getItem('gabor_flicker') === 'true';
        isFusionLockEnabled = localStorage.getItem('gabor_fusion_lock') !== 'false';
        isMuted = localStorage.getItem('gabor_muted') === 'true';
    } catch (e) {
        presetMode = 'occlusion';
        currentLevel = 1;
        autoAdvance = true;
        sessionLimit = 0;
        allowStageAdvance = true;
        flashDurationMode = 'adaptive';
        isPeripheralEnabled = false;
        isCrowdingEnabled = false;
        allowLowContrast = false;
        allowWideVariance = false;
        isStaticEnabled = false;
        isAnaglyphEnabled = false;
        redEyeSide = 'left';
        lazyEyeSide = 'left';
        strongEyeContrastFactor = 0.3;
        isFlickerEnabled = false;
        isFusionLockEnabled = true;
    }
    
    if (selectPresetMode) selectPresetMode.value = presetMode;
    if (selectStartLevel) selectStartLevel.value = currentLevel;
    if (selectAutonext) selectAutonext.value = autoAdvance ? "true" : "false";
    if (selectSessionLimit) selectSessionLimit.value = sessionLimit;
    
    if (selectFlashDuration) selectFlashDuration.value = flashDurationMode;
    if (chkStageAdvance) chkStageAdvance.checked = allowStageAdvance;
    if (chkPeripheral) chkPeripheral.checked = isPeripheralEnabled;
    if (chkCrowding) chkCrowding.checked = isCrowdingEnabled;
    if (chkLowContrast) chkLowContrast.checked = allowLowContrast;
    if (chkWideVariance) chkWideVariance.checked = allowWideVariance;
    if (chkStatic) chkStatic.checked = isStaticEnabled;
    if (chkAnaglyph) chkAnaglyph.checked = isAnaglyphEnabled;
    if (chkFlicker) chkFlicker.checked = isFlickerEnabled;
    if (chkFusionLock) chkFusionLock.checked = isFusionLockEnabled;
    
    if (selectRedSide) selectRedSide.value = redEyeSide;
    if (selectLazySide) selectLazySide.value = lazyEyeSide;
    if (rangeStrongAttenuation) {
        rangeStrongAttenuation.value = Math.round(strongEyeContrastFactor * 100);
        if (valStrongAttenuation) valStrongAttenuation.innerText = Math.round(strongEyeContrastFactor * 100) + '%';
    }
    
    updateMuteUI();
    updatePresetUI();
}

function saveSettings() {
    if (selectPresetMode) presetMode = selectPresetMode.value;
    if (selectStartLevel) currentLevel = parseInt(selectStartLevel.value);
    if (selectAutonext) autoAdvance = (selectAutonext.value === "true");
    if (selectSessionLimit) sessionLimit = parseInt(selectSessionLimit.value);
    
    if (presetMode === 'custom') {
        if (chkStageAdvance) allowStageAdvance = chkStageAdvance.checked;
        if (selectFlashDuration) flashDurationMode = selectFlashDuration.value;
        if (chkPeripheral) isPeripheralEnabled = chkPeripheral.checked;
        if (chkCrowding) isCrowdingEnabled = chkCrowding.checked;
        if (chkLowContrast) allowLowContrast = chkLowContrast.checked;
        if (chkWideVariance) allowWideVariance = chkWideVariance.checked;
        if (chkStatic) isStaticEnabled = chkStatic.checked;
        if (chkAnaglyph) isAnaglyphEnabled = chkAnaglyph.checked;
        if (chkFlicker) isFlickerEnabled = chkFlicker.checked;
        if (chkFusionLock) isFusionLockEnabled = chkFusionLock.checked;
        
        if (selectRedSide) redEyeSide = selectRedSide.value;
        if (selectLazySide) lazyEyeSide = selectLazySide.value;
        if (rangeStrongAttenuation) strongEyeContrastFactor = parseFloat(rangeStrongAttenuation.value) / 100;
    } else {
        if (presetMode === 'occlusion') {
            allowStageAdvance = true;
            flashDurationMode = 'adaptive';
            isPeripheralEnabled = false;
            isCrowdingEnabled = false;
            isStaticEnabled = false;
            isAnaglyphEnabled = false;
            allowWideVariance = false;
            isFlickerEnabled = false;
            isFusionLockEnabled = false;
        } else if (presetMode === 'binocular') {
            allowStageAdvance = true;
            flashDurationMode = 'adaptive';
            isPeripheralEnabled = false;
            isCrowdingEnabled = true;
            isStaticEnabled = false;
            isAnaglyphEnabled = true;
            allowWideVariance = false;
            isFlickerEnabled = false;
            isFusionLockEnabled = true;
        } else if (presetMode === 'peripheral') {
            allowStageAdvance = true;
            flashDurationMode = '180';
            isPeripheralEnabled = true;
            isCrowdingEnabled = false;
            isStaticEnabled = false;
            isAnaglyphEnabled = true;
            allowWideVariance = false;
            isFlickerEnabled = false;
            isFusionLockEnabled = true;
        } else if (presetMode === 'blitz') {
            allowStageAdvance = true;
            flashDurationMode = '100';
            isPeripheralEnabled = false;
            isCrowdingEnabled = false;
            isStaticEnabled = false;
            isAnaglyphEnabled = false;
            allowWideVariance = true;
            isFlickerEnabled = false;
            isFusionLockEnabled = false;
        } else if (presetMode === 'flicker') {
            allowStageAdvance = true;
            flashDurationMode = 'adaptive';
            isPeripheralEnabled = false;
            isCrowdingEnabled = true;
            isStaticEnabled = true;
            isAnaglyphEnabled = true;
            allowWideVariance = false;
            isFlickerEnabled = true;
            isFusionLockEnabled = true;
        }
    }
    
    isAnaglyphTestActive = false;
    if (btnFusionTest) {
        btnFusionTest.style.background = '#1a233a';
        btnFusionTest.style.color = '#3b90ff';
    }
    
    autoContrast = 0.40;
    correctStreak = 0;
    staircaseStreak = 0;

    if (nextFlashTimeoutId) {
        clearTimeout(nextFlashTimeoutId);
        nextFlashTimeoutId = null;
    }

    try {
        localStorage.setItem('gabor_preset_mode', presetMode);
        localStorage.setItem('gabor_start_level', currentLevel);
        localStorage.setItem('gabor_autonext', autoAdvance ? "true" : "false");
        localStorage.setItem('gabor_limit', sessionLimit);
        localStorage.setItem('gabor_stage_advance', allowStageAdvance ? "true" : "false");
        localStorage.setItem('gabor_flash_mode', flashDurationMode);
        localStorage.setItem('gabor_peripheral', isPeripheralEnabled ? "true" : "false");
        localStorage.setItem('gabor_crowding', isCrowdingEnabled ? "true" : "false");
        localStorage.setItem('gabor_low_contrast', allowLowContrast ? "true" : "false");
        localStorage.setItem('gabor_wide_variance', allowWideVariance ? "true" : "false");
        localStorage.setItem('gabor_static', isStaticEnabled ? "true" : "false");
        localStorage.setItem('gabor_anaglyph', isAnaglyphEnabled ? "true" : "false");
        localStorage.setItem('gabor_red_side', redEyeSide);
        localStorage.setItem('gabor_lazy_side', lazyEyeSide);
        localStorage.setItem('gabor_strong_factor', strongEyeContrastFactor.toString());
        localStorage.setItem('gabor_flicker', isFlickerEnabled ? "true" : "false");
        localStorage.setItem('gabor_fusion_lock', isFusionLockEnabled ? "true" : "false");
    } catch (e) {
        console.warn("Storage saving bypassed:", e);
    }
    
    const t = translations[currentLang] || translations['en'];
    if (!isWaitingForAnswer) {
        btnStart.innerText = (total > 0 && !autoAdvance) ? t.nextBtn : t.startBtn;
    } else {
        btnStart.innerText = t.reflashBtn;
    }

    updateStatusBarDisplay();
}

if (btnStart) btnStart.addEventListener('click', runFlash);
if (btnLeft) btnLeft.addEventListener('click', () => checkAnswer('left'));
if (btnRight) btnRight.addEventListener('click', () => checkAnswer('right'));

const btnMute = document.getElementById('btn-mute');
if (btnMute) {
    btnMute.addEventListener('click', () => {
        isMuted = !isMuted;
        localStorage.setItem('gabor_muted', isMuted ? "true" : "false");
        updateMuteUI();
    });
}

function updateMuteUI() {
    if (btnMute) {
        btnMute.innerText = isMuted ? '🔇' : '🔊';
        if (window.twemoji) twemoji.parse(btnMute);
    }
}

if (btnInfo) btnInfo.addEventListener('click', () => infoModal.style.display = 'block');
if (btnCloseModal) btnCloseModal.addEventListener('click', () => infoModal.style.display = 'none');

if (btnSettings) {
    btnSettings.addEventListener('click', () => {
        loadSettings();
        settingsModal.style.display = 'block';
    });
}
if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
        saveSettings();
        settingsModal.style.display = 'none';
    });
}

if (selectPresetMode) {
    selectPresetMode.addEventListener('change', () => {
        presetMode = selectPresetMode.value;
        updatePresetUI();
    });
}

const chkFusionLock = document.getElementById('chk-fusion-lock');

if (chkPeripheral) {
    chkPeripheral.addEventListener('change', () => {
        if (chkPeripheral.checked) {
            if (chkCrowding) chkCrowding.checked = false;
        }
        syncStateFromUI();
    });
}

if (chkCrowding) {
    chkCrowding.addEventListener('change', () => {
        if (chkCrowding.checked) {
            if (chkPeripheral) chkPeripheral.checked = false;
        }
        syncStateFromUI();
    });
}

if (chkAnaglyph) {
    chkAnaglyph.addEventListener('change', () => {
        isAnaglyphEnabled = chkAnaglyph.checked;
        syncStateFromUI();
    });
}

if (rangeStrongAttenuation) {
    rangeStrongAttenuation.addEventListener('input', () => {
        if (valStrongAttenuation) {
            valStrongAttenuation.innerText = rangeStrongAttenuation.value + '%';
        }
        syncStateFromUI();
    });
}

if (chkStatic) {
    chkStatic.addEventListener('change', () => {
        isStaticEnabled = chkStatic.checked;
        if (!isStaticEnabled) {
            if (chkFlicker) chkFlicker.checked = false;
        }
        syncStateFromUI();
    });
}

if (chkFlicker) {
    chkFlicker.addEventListener('change', () => {
        if (chkFlicker.checked) {
            if (chkStatic) chkStatic.checked = true;
        }
        syncStateFromUI();
    });
}

const inputsToSync = [
    chkStageAdvance, selectFlashDuration, chkLowContrast,
    chkWideVariance, chkAnaglyph, selectRedSide, selectLazySide,
    rangeStrongAttenuation, selectStartLevel, selectAutonext, selectSessionLimit, chkFusionLock
];
inputsToSync.forEach(input => {
    if (input) input.addEventListener('change', syncStateFromUI);
});

if (btnFusionTest) {
    btnFusionTest.addEventListener('click', () => {
        isAnaglyphTestActive = !isAnaglyphTestActive;
        if (isAnaglyphTestActive) {
            btnFusionTest.style.background = '#3b90ff';
            btnFusionTest.style.color = '#131a26';
            
            if (selectRedSide) redEyeSide = selectRedSide.value;
            if (selectLazySide) lazyEyeSide = selectLazySide.value;
            
            drawFusionTestPattern();
            canvas.style.display = 'block';
            cross.style.display = 'block'; 
        } else {
            btnFusionTest.style.background = '#1a233a';
            btnFusionTest.style.color = '#3b90ff';
            canvas.style.display = 'none';
        }
    });
}

window.addEventListener('load', () => {
    const savedLang = localStorage.getItem('gabor_lang') || 'en';
    loadSettings();
    setLanguage(savedLang);
    if (window.twemoji) twemoji.parse(document.body);
});

// Keyboard bindings
window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    
    if (event.key === 'Escape' || event.key === 'Esc') {
        if (settingsModal.style.display === 'block') {
            saveSettings(); 
            settingsModal.style.display = 'none';
        }
        if (infoModal.style.display === 'block') {
            infoModal.style.display = 'none';
        }
        return;
    }
    
    if (settingsModal.style.display === 'block' || infoModal.style.display === 'block') {
        return;
    }

    if (key === 'arrowleft' || key === 'a' || key === 'ф') {
        checkAnswer('left');
    } else if (key === 'arrowright' || key === 'd' || key === 'в') {
        checkAnswer('right');
    } else if (key === ' ' || key === 'enter') {
        event.preventDefault(); 
        runFlash();
    }
});