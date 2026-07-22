<script setup lang="ts">
import { onMounted, nextTick, ref, watch } from 'vue'
import SettingsModal from './SettingsModal.vue'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useHudStore } from '../stores/hudStore'

const ui = useUIStore()
const settings = useSettingsStore()
const hud = useHudStore()
const startBtnRef = ref<HTMLElement | null>(null)

watch(() => ui.isSettingsOpen, (open) => {
  document.body.classList.toggle('modal-is-open', open)
  if (open) {
    window.dispatchEvent(new CustomEvent('vue-settings-opened'))
  } else {
    window.dispatchEvent(new CustomEvent('vue-settings-closed'))
  }
})

onMounted(() => {
  // Перехватываем клик по старой кнопке настроек
  const oldSettingsBtn = document.getElementById('btn-settings')
  if (oldSettingsBtn) {
    oldSettingsBtn.addEventListener('click', (e) => {
      e.stopImmediatePropagation()
      e.preventDefault()
      ui.openSettings()
    })
  }

  // Скрываем старую модалку
  const oldModal = document.getElementById('settings-modal')
  if (oldModal) oldModal.style.display = 'none'

  // Перемещаем новую кнопку Start внутрь #controls-layout
  nextTick(() => {
    if (!startBtnRef.value) return
    const controlsLayout = document.getElementById('controls-layout')
    const oldStartBtn = document.getElementById('btn-start')
    if (controlsLayout && oldStartBtn) {
      oldStartBtn.style.display = 'none'
      controlsLayout.insertBefore(startBtnRef.value, oldStartBtn)
    }
  })
})
</script>

<template>
  <button
    id="vue-btn-start"
    ref="startBtnRef"
    :disabled="hud.isPrimaryDisabled"
    @click="hud.onPrimaryClick()"
    class="action-btn btn-start-vue"
  >
    {{ hud.primaryLabel }}
  </button>
  <SettingsModal />
</template>

<style scoped>
.btn-start-vue {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 12px;
  background: #007aff;
  color: white;
  border: none;
  cursor: pointer;
}
.btn-start-vue:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>