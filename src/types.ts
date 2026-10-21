export type Theme = 'light' | 'dark';
export interface Settings { theme: Theme; fontScale: number }
export const defaultSettings: Settings = { theme: 'light', fontScale: 100 };
export function normalizeSettings(value?: Partial<Settings>): Settings {
  return {
    theme: value?.theme === 'dark' ? 'dark' : 'light',
    fontScale: typeof value?.fontScale === 'number' && value.fontScale >= 80 && value.fontScale <= 160 && value.fontScale % 10 === 0 ? value.fontScale : 100,
  };
}
export interface BookMeta {
  id: string; filename: string; title: string; author: string;
  importedAt: number; lastOpenedAt: number | null; size: number; hasCover: boolean;
}
export interface ReadingState { bookId: string; cfi: string | null; fraction: number | null; updatedAt: number }
export interface BookSummary extends BookMeta { progress: ReadingState | null }
export interface Assets { bookId: string; epub: Blob }
export interface Cover { bookId: string; blob: Blob }
export interface LocationCache { bookId: string; version: number; locations: string }
export interface TocEntry { id: string; label: string; href: string; children: TocEntry[] }
export interface ReaderLocation { cfi: string; fraction: number | null; atStart: boolean; atEnd: boolean }
export class ReaderError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ReaderError'; }
}
export function errorMessage(error: unknown): string {
  return error instanceof ReaderError ? error.message : 'Something went wrong. Please try again.';
}
