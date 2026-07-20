import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './components/App.vue'
import en from '../public/i18n/en.json'
import ru from '../public/i18n/ru.json'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('gabor_lang') || 'en',
  fallbackLocale: 'en',
  messages: { en, ru }
})

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#vue-root')
