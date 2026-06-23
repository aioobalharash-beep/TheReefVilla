import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

// Shared with LanguageContext: prerendered documents (window.__SSG__) must
// start English to match the server markup; everything else may adopt the
// saved language right away.
export function initialLang(): 'en' | 'ar' {
  if (typeof window === 'undefined') return 'en';
  if ((window as unknown as { __SSG__?: boolean }).__SSG__) return 'en';
  const saved = localStorage.getItem('lang');
  return saved === 'ar' ? 'ar' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  // On prerendered (SSG) documents the markup is English, so init to 'en' to
  // keep first-render hydration clean — LanguageContext then switches to the
  // saved language in a mount effect. On pure client-rendered routes (and in
  // Node, where window is undefined) there's no hydration, so adopt the saved
  // language immediately to avoid a flash.
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
