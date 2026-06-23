import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initialLang } from '../i18n';

interface LanguageContextType {
  language: 'en' | 'ar';
  isRTL: boolean;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  isRTL: false,
  toggleLanguage: () => {},
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  // On prerendered documents this starts 'en' to match the server markup (clean
  // hydration); on pure client-rendered routes it adopts the saved language
  // straight away. An inline <head> script also sets <html dir/lang> ASAP so
  // RTL layout never flashes before hydration.
  const [language, setLanguage] = useState<'en' | 'ar'>(initialLang);

  // Adopt the persisted language on the client, after first paint/hydration.
  // (No-op when the initializer already picked it up on a CSR route.)
  useEffect(() => {
    const saved = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('lang') as 'en' | 'ar' | null)
      : null;
    if (saved === 'ar' || saved === 'en') setLanguage(saved);
  }, []);

  const isRTL = language === 'ar';

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    root.setAttribute('lang', language);
    // Toggle Arabic body font class
    root.classList.toggle('ar', isRTL);
    localStorage.setItem('lang', language);
    i18n.changeLanguage(language);
  }, [language, isRTL, i18n]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'ar' : 'en');
  };

  return (
    <LanguageContext.Provider value={{ language, isRTL, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
