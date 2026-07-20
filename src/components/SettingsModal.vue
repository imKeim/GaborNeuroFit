<script setup lang="ts">
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import type { GaborPreset, FlashDurationMode, CrowdingMode } from '../types/clinical'

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
const crowdingModes = [
  { label: 'Vertical', value: 'vertical' },
  { label: 'Horizontal', value: 'horizontal' },
  { label: 'All', value: 'all' },
]
const flankerSpacings = [
  { label: 'Close (2x)', value: 2 },
  { label: 'Far (4x)', value: 4 },
]
const pullSpeeds = [
  { label: '1.5s', value: 1500 },
  { label: '2.5s', value: 2500 },
  { label: '4.0s', value: 4000 },
]
const targetSizes = [
  { label: '65px (Mac.)', value: 65 },
  { label: '45px (Param.)', value: 45 },
  { label: '30px (Fov.)', value: 30 },
]
const disparities = [
  { label: '8px', value: 8 },
  { label: '6px', value: 6 },
  { label: '4px', value: 4 },
  { label: '2px', value: 2 },
  { label: '1px', value: 1 },
]
const dotSizes = [
  { label: '2px', value: 2 },
  { label: '4px', value: 4 },
  { label: '6px', value: 6 },
]
const densities = [
  { label: '35%', value: 35 },
  { label: '50%', value: 50 },
  { label: '65%', value: 65 },
]
const floatSpeeds = [
  { label: 'Slow', value: 'slow' },
  { label: 'Normal', value: 'medium' },
  { label: 'Fast', value: 'fast' },
]
const rdsSessionLimits = [
  { label: 'Off', value: 0 },
  { label: '15', value: 15 },
  { label: '30', value: 30 },
  { label: '45', value: 45 },
]
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.isSettingsOpen" class="modal modal-open"
         role="dialog" aria-modal="true" aria-labelledby="settingsTitle" tabindex="-1">
      <div class="modal-content">
        <h2 id="settingsTitle">Configuration Panel</h2>

        <!-- Tab bar -->
        <nav class="modal-tab-bar">
          <button class="tab-btn" :class="{ active: settings.appMode === 'gabor' }" @click="settings.setAppMode('gabor')">🧿 Gabor</button>
          <button class="tab-btn" :class="{ active: settings.appMode === 'synoptophore' }" @click="settings.setAppMode('synoptophore')">🧲 Synoptophore</button>
          <button class="tab-btn" :class="{ active: settings.appMode === 'rds' }" @click="settings.setAppMode('rds')">🧊 RDS</button>
        </nav>

        <div class="modal-scroll-body" style="overflow-y: auto; max-height: 60vh; padding-right: 8px;">

          <!-- ==================== GABOR ==================== -->
          <template v-if="settings.appMode === 'gabor'">
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
                <button v-for="opt in sessionLimits" :key="opt.value" class="pill-btn" :class="{ active: settings.sessionLimit === opt.value }" @click="settings.setSessionLimit(opt.value)">{{ opt.label }}</button>
              </div>
            </div>

            <!-- Auto-Next -->
            <div class="settings-row">
              <span class="settings-label">Auto-Next</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.autoAdvance === true }" @click="settings.setAutoAdvance(true)">On</button>
                <button class="pill-btn" :class="{ active: settings.autoAdvance === false }" @click="settings.setAutoAdvance(false)">Off</button>
              </div>
            </div>

            <!-- Stage Advance -->
            <div class="settings-row">
              <span class="settings-label">Stage Advance</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.allowStageAdvance === true }" @click="settings.setStageAdvance(true)">On</button>
                <button class="pill-btn" :class="{ active: settings.allowStageAdvance === false }" @click="settings.setStageAdvance(false)">Off</button>
              </div>
            </div>

            <!-- Flash Duration -->
            <div class="settings-row">
              <span class="settings-label">Flash Duration</span>
              <div class="pill-group">
                <button v-for="opt in flashDurations" :key="opt.value" class="pill-btn" :class="{ active: settings.flashDurationMode === opt.value }" @click="settings.setFlashDuration(opt.value)">{{ opt.label }}</button>
              </div>
            </div>

            <!-- Timer Limit -->
            <div class="settings-row">
              <span class="settings-label">Timer Limit</span>
              <div class="pill-group">
                <button v-for="opt in timerLimits" :key="opt.value" class="pill-btn" :class="{ active: settings.timerLimitMinutes === opt.value }" @click="settings.setTimerLimit(opt.value)">{{ opt.label }}</button>
              </div>
            </div>

            <!-- Mono Audio -->
            <div class="settings-row">
              <span class="settings-label">Mono Audio</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.isMonoAudioEnabled }" @click="settings.setMonoAudio(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.isMonoAudioEnabled }" @click="settings.setMonoAudio(false)">Off</button>
              </div>
            </div>

	        <!-- 3D Anaglyph Mode -->
		        <div class="settings-row">
		          <span class="settings-label">3D Anaglyph Mode</span>
		          <div class="pill-group">
		            <button class="pill-btn" :class="{ active: settings.isAnaglyphEnabled }" @click="settings.setAnaglyph(true)">On</button>
		            <button class="pill-btn" :class="{ active: !settings.isAnaglyphEnabled }" @click="settings.setAnaglyph(false)">Off</button>
		          </div>
		        </div>
		
		        <!-- Subpixel Calibration -->
		        <div class="settings-row">
		          <div style="display:flex; flex-direction:column; gap:6px; width:100%">
		            <div style="display:flex; justify-content:space-between; align-items:center">
		              <span style="color:#ef4444; font-weight:bold">R (Left Lens)</span>
		              <span style="color:#ef4444; font-weight:bold">{{ settings.calibratorLeftR }}</span>
		            </div>
		            <div style="display:flex; align-items:center; gap:6px">
		              <button class="pill-btn" @click="settings.setCalibratorLeftR(Math.max(0, settings.calibratorLeftR - 1))">−</button>
		              <input type="range" min="0" max="255" :value="settings.calibratorLeftR"
		                     @input="settings.setCalibratorLeftR(Number(($event.target as HTMLInputElement).value))"
		                     style="flex:1">
		              <button class="pill-btn" @click="settings.setCalibratorLeftR(Math.min(255, settings.calibratorLeftR + 1))">+</button>
		            </div>
		          </div>
		        </div>
		        <div class="settings-row">
		          <div style="display:flex; flex-direction:column; gap:6px; width:100%">
		            <div style="display:flex; justify-content:space-between; align-items:center">
		              <span style="color:#22c55e; font-weight:bold">G (Right Lens)</span>
		              <span style="color:#22c55e; font-weight:bold">{{ settings.calibratorRightG }}</span>
		            </div>
		            <div style="display:flex; align-items:center; gap:6px">
		              <button class="pill-btn" @click="settings.setCalibratorRightG(Math.max(0, settings.calibratorRightG - 1))">−</button>
		              <input type="range" min="0" max="255" :value="settings.calibratorRightG"
		                     @input="settings.setCalibratorRightG(Number(($event.target as HTMLInputElement).value))"
		                     style="flex:1">
		              <button class="pill-btn" @click="settings.setCalibratorRightG(Math.min(255, settings.calibratorRightG + 1))">+</button>
		            </div>
		          </div>
		        </div>
		        <div class="settings-row">
		          <div style="display:flex; flex-direction:column; gap:6px; width:100%">
		            <div style="display:flex; justify-content:space-between; align-items:center">
		              <span style="color:#3b82f6; font-weight:bold">B (Right Lens)</span>
		              <span style="color:#3b82f6; font-weight:bold">{{ settings.calibratorRightB }}</span>
		            </div>
		            <div style="display:flex; align-items:center; gap:6px">
		              <button class="pill-btn" @click="settings.setCalibratorRightB(Math.max(0, settings.calibratorRightB - 1))">−</button>
		              <input type="range" min="0" max="255" :value="settings.calibratorRightB"
		                     @input="settings.setCalibratorRightB(Number(($event.target as HTMLInputElement).value))"
		                     style="flex:1">
		              <button class="pill-btn" @click="settings.setCalibratorRightB(Math.min(255, settings.calibratorRightB + 1))">+</button>
		            </div>
		          </div>
		        </div>
		
		        <!-- Strong Eye Contrast Balancer -->
            <div class="settings-row" v-if="settings.isAnaglyphEnabled">
              <label for="range-strong-contrast" class="settings-label">Strong Eye Contrast Balancer</label>
              <div style="display:flex; align-items:center; gap:8px; width:100%">
                <input type="range" id="range-strong-contrast" min="10" max="100" step="5"
                       :value="settings.strongEyeContrastPercent"
                       @input="settings.setStrongContrastPercent(Number(($event.target as HTMLInputElement).value))"
                       style="flex:1">
                <span style="min-width:3em; text-align:right; font-weight:bold; color:#3b90ff">{{ settings.strongEyeContrastPercent }}%</span>
              </div>
            </div>

            <!-- Permanent Cross -->
            <div class="settings-row">
              <span class="settings-label">Permanent Cross</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.isPermanentCrossEnabled }" @click="settings.setPermanentCross(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.isPermanentCrossEnabled }" @click="settings.setPermanentCross(false)">Off</button>
              </div>
            </div>

            <!-- Ultra-Low Contrast -->
            <div class="settings-row">
              <span class="settings-label">Ultra-Low Contrast</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.allowLowContrast }" @click="settings.setLowContrast(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.allowLowContrast }" @click="settings.setLowContrast(false)">Off</button>
              </div>
            </div>

            <!-- Dynamic Level Drift -->
            <div class="settings-row">
              <span class="settings-label">Dynamic Level Drift</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.allowDynamicLevelDrift }" @click="settings.setDynamicLevelDrift(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.allowDynamicLevelDrift }" @click="settings.setDynamicLevelDrift(false)">Off</button>
              </div>
            </div>

            <!-- Density Variance -->
            <div class="settings-row">
              <span class="settings-label">Density Variance</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.allowDensityVariance }" @click="settings.setDensityVariance(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.allowDensityVariance }" @click="settings.setDensityVariance(false)">Off</button>
              </div>
            </div>

            <!-- Shape Variance -->
            <div class="settings-row">
              <span class="settings-label">Shape Variance</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.allowShapeVariance }" @click="settings.setShapeVariance(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.allowShapeVariance }" @click="settings.setShapeVariance(false)">Off</button>
              </div>
            </div>

            <!-- Peripheral Shift -->
            <div class="settings-row">
              <span class="settings-label">Peripheral Shift</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.isPeripheralEnabled }" @click="settings.setPeripheral(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.isPeripheralEnabled }" @click="settings.setPeripheral(false)">Off</button>
              </div>
            </div>

            <!-- Visual Crowding -->
            <div class="settings-row">
              <span class="settings-label">Visual Crowding</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.isCrowdingEnabled }" @click="settings.setCrowding(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.isCrowdingEnabled }" @click="settings.setCrowding(false)">Off</button>
              </div>
            </div>

            <!-- Crowding Options -->
            <div v-if="settings.isCrowdingEnabled">
              <div class="settings-row">
                <span class="settings-label">Crowding Axis</span>
                <div class="pill-group">
                  <button v-for="mode in crowdingModes" :key="mode.value" class="pill-btn" :class="{ active: settings.crowdingMode === mode.value }" @click="settings.setCrowdingMode(mode.value)">{{ mode.label }}</button>
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Flanker Spacing</span>
                <div class="pill-group">
                  <button v-for="sp in flankerSpacings" :key="sp.value" class="pill-btn" :class="{ active: settings.flankerDistanceCoeff === sp.value }" @click="settings.setFlankerDistance(sp.value)">{{ sp.label }}</button>
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Orthogonal Distractor</span>
                <div class="pill-group">
                  <button class="pill-btn" :class="{ active: settings.isOrthogonalFlankersEnabled }" @click="settings.setOrthogonalFlankers(true)">On</button>
                  <button class="pill-btn" :class="{ active: !settings.isOrthogonalFlankersEnabled }" @click="settings.setOrthogonalFlankers(false)">Off</button>
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Dynamic Flankers</span>
                <div class="pill-group">
                  <button class="pill-btn" :class="{ active: settings.isDynamicFlankersEnabled }" @click="settings.setDynamicFlankers(true)">On</button>
                  <button class="pill-btn" :class="{ active: !settings.isDynamicFlankersEnabled }" @click="settings.setDynamicFlankers(false)">Off</button>
                </div>
              </div>
            </div>
          </template>

          <!-- ==================== SYNOPTOPHORE ==================== -->
          <template v-if="settings.appMode === 'synoptophore'">
            <!-- Ocular Pulling Rate -->
            <div class="settings-row">
              <span class="settings-label">Ocular Pulling Rate</span>
              <div class="pill-group">
                <button v-for="opt in pullSpeeds" :key="opt.value" class="pill-btn" :class="{ active: settings.synopPullSpeed === opt.value }" @click="settings.setSynopPullSpeed(opt.value)">{{ opt.label }}</button>
              </div>
            </div>

            <!-- Target Geometry -->
            <div class="settings-row">
              <span class="settings-label">Target Geometry</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopTargetType === 'ring-dot' }" @click="settings.setSynopTargetType('ring-dot')">Ring &amp; Dot</button>
                <button class="pill-btn" :class="{ active: settings.synopTargetType === 'cross-square' }" @click="settings.setSynopTargetType('cross-square')">Cross &amp; Square</button>
              </div>
            </div>

            <!-- Lazy Eye Grid -->
            <div class="settings-row">
              <span class="settings-label">Lazy Eye Grid</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopShowLazyGrid }" @click="settings.setSynopLazyGrid(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.synopShowLazyGrid }" @click="settings.setSynopLazyGrid(false)">Off</button>
              </div>
            </div>

            <!-- Strong Eye Grid -->
            <div class="settings-row">
              <span class="settings-label">Strong Eye Grid</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopShowStrongGrid }" @click="settings.setSynopStrongGrid(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.synopShowStrongGrid }" @click="settings.setSynopStrongGrid(false)">Off</button>
              </div>
            </div>

            <!-- Flicker (10 Hz) -->
            <div class="settings-row">
              <span class="settings-label">Flicker (10 Hz)</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopFlickerActive }" @click="settings.setSynopFlicker(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.synopFlickerActive }" @click="settings.setSynopFlicker(false)">Off</button>
              </div>
            </div>

            <!-- Strict Vertical Mode (Lock X) -->
            <div class="settings-row">
              <span class="settings-label">Strict Vertical Mode (Lock X)</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopLockVertical }" @click="settings.setSynopLockVertical(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.synopLockVertical }" @click="settings.setSynopLockVertical(false)">Off</button>
              </div>
            </div>

            <!-- Strict Horizontal Mode (Lock Y) -->
            <div class="settings-row">
              <span class="settings-label">Strict Horizontal Mode (Lock Y)</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.synopLockHorizontal }" @click="settings.setSynopLockHorizontal(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.synopLockHorizontal }" @click="settings.setSynopLockHorizontal(false)">Off</button>
              </div>
            </div>

            <!-- Ophthalmic Target Size -->
            <div class="settings-row">
              <span class="settings-label">Ophthalmic Target Size</span>
              <div class="pill-group">
                <button v-for="sz in targetSizes" :key="sz.value" class="pill-btn" :class="{ active: settings.synopTargetSize === sz.value }" @click="settings.setSynopTargetSize(sz.value)">{{ sz.label }}</button>
              </div>
            </div>
          </template>

          <!-- ==================== RDS ==================== -->
          <template v-if="settings.appMode === 'rds'">
            <!-- Starting Disparity -->
            <div class="settings-row">
              <span class="settings-label">Starting Disparity</span>
              <div class="pill-group">
                <button v-for="d in disparities" :key="d.value" class="pill-btn" :class="{ active: settings.rdsStartDisparity === d.value }" @click="settings.setRdsStartDisparity(d.value)">{{ d.label }}</button>
              </div>
            </div>

            <!-- Dot Size -->
            <div class="settings-row">
              <span class="settings-label">Dot Size</span>
              <div class="pill-group">
                <button v-for="ds in dotSizes" :key="ds.value" class="pill-btn" :class="{ active: settings.rdsDotSize === ds.value }" @click="settings.setRdsDotSize(ds.value)">{{ ds.label }}</button>
              </div>
            </div>

            <!-- Density -->
            <div class="settings-row">
              <span class="settings-label">Density</span>
              <div class="pill-group">
                <button v-for="den in densities" :key="den.value" class="pill-btn" :class="{ active: settings.rdsDensityPercent === den.value }" @click="settings.setRdsDensityPercent(den.value)">{{ den.label }}</button>
              </div>
            </div>

            <!-- Auto-Next -->
            <div class="settings-row">
              <span class="settings-label">Auto-Next</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.rdsAutoAdvance }" @click="settings.setRdsAutoAdvance(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.rdsAutoAdvance }" @click="settings.setRdsAutoAdvance(false)">Off</button>
              </div>
            </div>

            <!-- Dynamic Noise -->
            <div class="settings-row">
              <span class="settings-label">Dynamic Noise</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.rdsIsDynamic }" @click="settings.setRdsIsDynamic(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.rdsIsDynamic }" @click="settings.setRdsIsDynamic(false)">Off</button>
              </div>
            </div>

            <!-- Randomize Vertical -->
            <div class="settings-row">
              <span class="settings-label">Randomize Vertical</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.rdsRandomizeVertical }" @click="settings.setRdsRandomizeVertical(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.rdsRandomizeVertical }" @click="settings.setRdsRandomizeVertical(false)">Off</button>
              </div>
            </div>

            <!-- Floating Target -->
            <div class="settings-row">
              <span class="settings-label">Floating Target</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.rdsIsFloating }" @click="settings.setRdsIsFloating(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.rdsIsFloating }" @click="settings.setRdsIsFloating(false)">Off</button>
              </div>
            </div>

            <!-- Float Speed (only if floating) -->
            <div class="settings-row" v-if="settings.rdsIsFloating">
              <span class="settings-label">Float Speed</span>
              <div class="pill-group">
                <button v-for="fs in floatSpeeds" :key="fs.value" class="pill-btn" :class="{ active: settings.rdsFloatSpeed === fs.value }" @click="settings.setRdsFloatSpeed(fs.value)">{{ fs.label }}</button>
              </div>
            </div>

            <!-- Permanent Cross -->
            <div class="settings-row">
              <span class="settings-label">Permanent Cross</span>
              <div class="pill-group">
                <button class="pill-btn" :class="{ active: settings.rdsIsPermanentCrossEnabled }" @click="settings.setRdsPermanentCross(true)">On</button>
                <button class="pill-btn" :class="{ active: !settings.rdsIsPermanentCrossEnabled }" @click="settings.setRdsPermanentCross(false)">Off</button>
              </div>
            </div>

            <!-- Session Limit -->
            <div class="settings-row">
              <span class="settings-label">Session Limit</span>
              <div class="pill-group">
                <button v-for="lim in rdsSessionLimits" :key="lim.value" class="pill-btn" :class="{ active: settings.rdsSessionLimit === lim.value }" @click="settings.setRdsSessionLimit(lim.value)">{{ lim.label }}</button>
              </div>
            </div>
          </template>

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