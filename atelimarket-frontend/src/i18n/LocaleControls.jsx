import React from 'react';
import { CURRENCY_OPTIONS, LANGUAGE_OPTIONS, useLocalization } from './localization';

export default function LocaleControls({ language, currency, onLanguageChange, onCurrencyChange, compact = false }) {
  const { t } = useLocalization();
  const controlClass = compact
    ? 'w-[76px] px-1.5 py-1.5 text-[10px]'
    : 'min-w-[94px] px-2.5 py-2 text-xs';

  return (
    <div className="flex items-center gap-1.5">
      <label>
        <span className="sr-only">{t('Language')}</span>
        <select
          value={language}
          onChange={event => onLanguageChange(event.target.value)}
          aria-label={t('Language')}
          className={`rounded-full border border-neutral-300 bg-white font-semibold text-neutral-800 outline-none focus:border-[#173b32] ${controlClass}`}
        >
          {LANGUAGE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">{t('Currency')}</span>
        <select
          value={currency}
          onChange={event => onCurrencyChange(event.target.value)}
          aria-label={t('Currency')}
          className={`rounded-full border border-neutral-300 bg-white font-semibold text-neutral-800 outline-none focus:border-[#173b32] ${controlClass}`}
        >
          {CURRENCY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.value}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
