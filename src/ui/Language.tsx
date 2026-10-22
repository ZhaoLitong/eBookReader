import { createContext, useContext } from 'react';
import { translate } from '../i18n';
import type { Language, Settings } from '../types';

export const LanguageContext = createContext<Language>('en');
export function useTranslation() {
  const language = useContext(LanguageContext);
  return (message: string, values?: Record<string, string | number>) => translate(language, message, values);
}

export function LanguagePicker({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  const t = useTranslation();
  return <label className="language-picker"><span>{t('Language')}</span><select value={settings.language} onChange={event => onChange({ ...settings, language: event.target.value === 'zh-CN' ? 'zh-CN' : 'en' })}>
    <option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">简体中文</option>
  </select></label>;
}
