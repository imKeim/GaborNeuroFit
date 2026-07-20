<script setup lang="ts">
import { onMounted } from 'vue'
import SettingsModal from './SettingsModal.vue'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'

const ui = useUIStore()
useSettingsStore() // side‑effect: синхронизирует старый Store через watch

onMounted(() => {
  // Перехватываем клик по старой кнопке настроек
  const btn = document.getElementById('btn-settings')
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation()
      e.preventDefault()
      ui.openSettings()
    })
  }
  // Скрываем старую модалку (временный костыль)
  const oldModal = document.getElementById('settings-modal')
  if (oldModal) oldModal.style.display = 'none'
})
</script>

<template>
  <div class="vue-app-wrapper">
    <SettingsModal />
  </div>
</template>