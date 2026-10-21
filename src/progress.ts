import type { LibraryRepository } from './repository';
import type { ReaderLocation, ReadingState } from './types';

/** A single writer per book; never clear a newer location when an older write finishes. */
export class ProgressWriter {
  private pending: ReadingState | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private active: Promise<void> | null = null;
  constructor(private repository: LibraryRepository, private bookId: string, private onFailure: (failed: boolean) => void) {}
  update(location: ReaderLocation) {
    this.pending = { bookId: this.bookId, cfi: location.cfi, fraction: location.fraction, updatedAt: Date.now() };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 300);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.active) return this.active;
    this.active = this.write().finally(() => { this.active = null; });
    return this.active;
  }
  private async write() {
    while (this.pending) {
      const state = this.pending;
      try {
        await this.repository.saveState(state);
        if (this.pending === state) this.pending = null;
        this.onFailure(false);
      } catch { this.onFailure(true); break; }
    }
  }
  async dispose() { clearTimeout(this.timer); await this.flush(); }
}
