import { describe, expect, it } from 'vitest';
import { translate } from '../src/i18n';
import { preferredLanguage } from '../src/types';

describe('language selection and messages', () => {
  it('recognizes Chinese device locales and falls back to English for other languages', () => {
    for (const locale of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans-CN', 'zh-Hant-HK']) expect(preferredLanguage(locale)).toBe('zh-CN');
    for (const locale of ['en-US', 'fr-FR', 'ja-JP', '']) expect(preferredLanguage(locale)).toBe('en');
  });
  it('translates asynchronous timeout errors without changing their operation or recursing', () => {
    const message = 'Preparing this book took too long. Try again or choose a smaller EPUB.';
    expect(translate('en', message)).toBe(message);
    expect(translate('zh-CN', message)).toBe('准备书籍耗时过长，请重试或选择较小的 EPUB。');
  });
  it('interpolates titles literally and retains untranslated messages', () => {
    expect(translate('zh-CN', 'Read {title}', { title: '<花园> {progress} $&' })).toBe('阅读《<花园> {progress} $&》');
    expect(translate('en', '{progress}% read', { progress: 25 })).toBe('25% read');
    expect(translate('zh-CN', 'Unknown future error')).toBe('Unknown future error');
    expect(translate('zh-CN', 'toString')).toBe('toString');
  });
});
