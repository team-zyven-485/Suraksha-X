import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { LANGUAGES, Lang, translations } from './translations';

const LANG_KEY = 'suraksha_lang';

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key; `{name}` placeholders are filled from `vars`. Falls back to English, then the key. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored as Lang;
    const nav = navigator.language?.slice(0, 2);
    if (nav === 'hi' || nav === 'mr') return nav;
  } catch {
    /* storage / navigator unavailable */
  }
  return 'en';
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = translations[lang][key] ?? translations.en[key] ?? key;
      return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : template;
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
};

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      aria-label={t('role.language')}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`bg-paper-alt border border-hairline rounded-lg px-2 py-1.5 text-[11px] font-mono text-ink-soft focus:outline-none focus:border-brand ${className}`}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
};
