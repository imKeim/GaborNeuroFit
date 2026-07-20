<script setup lang="ts">
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import type { GaborPreset, FlashDurationMode } from '../types/clinical'

const ui = useUIStore()
const settings = useSettingsStore()

const presets: { mode: GaborPreset; title: string; desc: string }[] = [
  { mode: 'occlusion', title: '🩹 Patching', desc: 'Classic monochrome patching.' },
  { mode: 'binocular', title: '🕶️ 3D Balance', desc: 'Dichoptic noise masking.' },
  { mode: 'flicker', title: '🌀 3D Flicker', desc: 'Alpha-resonance SSVEP.' },
  { mode: 'peripheral', title: '🎯 3D Capture', desc: 'Eccentric field capture.' },
  { mode: 'blitz', title: '⚡ Blitz', desc: 'High-speed 100ms processing.' },
  { mode: 'custom', title: '⚙️ Custom', desc: 'Manual parameter control.' },
]

const sessionLimits = [
  { label: 'Off', value: 0 },
  { label: '40', value: 40 },
  { label: '80', value: 80 },
  { label: '120', value: 120 },
]
const flashDurations: { label: string; value: FlashDurationMode }[] = [
  { label: 'Adapt.', value: 'adaptive' },
  { label: '100ms', value: '100' },
  { label: '200ms', value: '200' },
  { label: '350ms', value: '350' },
]
const timerLimits = [
  { label: 'Off', value: 0 },
  { label: '5m', value: 5 },
  { label: '10m', value: 10 },
  { label: '15m', value: 15 },
]
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.isSettingsOpen" class="modal modal-open"
         role="dialog" aria-modal="true" aria-labelledby="settingsTitle" tabindex="-1">
      <div class="modal-content">
        <h2 id="settingsTitle">Configuration Panel</h2>
        <!-- Preset Grid -->
        <div class="preset-grid">
          <div
            v-for="p in presets"
            :key="p.mode"
            class="preset-card"
            :class="{ active: settings.presetMode === p.mode }"
            @click="settings.setPreset(p.mode)"
            tabindex="0"
            role="button"
            :aria-pressed="settings.presetMode === p.mode ? 'true' : 'false'"
          >
            <span class="preset-card-title">{{ p.title }}</span>
            <span class="preset-card-desc">{{ p.desc }}</span>
          </div>
        </div>

        <!-- Session Limit -->
        <div class="settings-row">
          <span class="settings-label">Session Limit</span>
          <div class="pill-group">
            <button
              v-for="opt in sessionLimits"
              :key="opt.value"
              class="pill-btn"
              :class="{ active: settings.sessionLimit === opt.value }"
              @click="settings.setSessionLimit(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Auto-Next -->
        <div class="settings-row">
          <span class="settings-label">Auto-Next</span>
          <div class="pill-group">
            <button
              class="pill-btn" :class="{ active: settings.autoAdvance === true }"
              @click="settings.setAutoAdvance(true)">On</button>
            <button
              class="pill-btn" :class="{ active: settings.autoAdvance === false }"
              @click="settings.setAutoAdvance(false)">Off</button>
          </div>
        </div>

        <!-- Stage Advance -->
        <div class="settings-row">
          <span class="settings-label">Stage Advance</span>
          <div class="pill-group">
            <button
              class="pill-btn" :class="{ active: settings.allowStageAdvance === true }"
              @click="settings.setStageAdvance(true)">On</button>
            <button
              class="pill-btn" :class="{ active: settings.allowStageAdvance === false }"
              @click="settings.setStageAdvance(false)">Off</button>
          </div>
        </div>

        <!-- Flash Duration -->
        <div class="settings-row">
          <span class="settings-label">Flash Duration</span>
          <div class="pill-group">
            <button
              v-for="opt in flashDurations"
              :key="opt.value"
              class="pill-btn"
              :class="{ active: settings.flashDurationMode === opt.value }"
              @click="settings.setFlashDuration(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Timer Limit -->
        <div class="settings-row">
          <span class="settings-label">Timer Limit</span>
          <div class="pill-group">
            <button
              v-for="opt in timerLimits"
              :key="opt.value"
              class="pill-btn"
              :class="{ active: settings.timerLimitMinutes === opt.value }"
              @click="settings.setTimerLimit(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Mono Audio -->
        <div class="settings-row">
          <span class="settings-label">Mono Audio</span>
          <div class="pill-group">
            <button class="pill-btn" :class="{ active: settings.isMonoAudioEnabled === true }" @click="settings.setMonoAudio(true)">On</button>
            <button class="pill-btn" :class="{ active: settings.isMonoAudioEnabled === false }" @click="settings.setMonoAudio(false)">Off</button>
          </div>
        </div>

        <button type="button" class="close-btn" @click="ui.closeSettings()">OK</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
</style>