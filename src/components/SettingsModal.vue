<script setup lang="ts">
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import type { GaborPreset } from '../types/clinical'

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

function selectPreset(mode: GaborPreset) {
  settings.setPreset(mode)
}
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
            @click="selectPreset(p.mode)"
            tabindex="0"
            role="button"
            :aria-pressed="settings.presetMode === p.mode ? 'true' : 'false'"
          >
            <span class="preset-card-title">{{ p.title }}</span>
            <span class="preset-card-desc">{{ p.desc }}</span>
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