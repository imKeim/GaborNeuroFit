import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const isSettingsOpen = ref(false)

  function openSettings() { isSettingsOpen.value = true }
  function closeSettings() { isSettingsOpen.value = false }

  return { isSettingsOpen, openSettings, closeSettings }
})