import { afterEach, expect, it, vi } from 'vitest';
import { ProgressWriter } from '../src/progress';
import type { LibraryRepository } from '../src/repository';
const location = (cfi: string) => ({ cfi, fraction: .5, atStart: false, atEnd: false });
afterEach(() => vi.useRealTimers());
it('debounces changes and retries failed writes without discarding the latest CFI', async () => {
  vi.useFakeTimers();
  const saveState = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
  const failed = vi.fn(); const writer = new ProgressWriter({ saveState } as unknown as LibraryRepository, 'book', failed);
  writer.update(location('one')); writer.update(location('two'));
  await vi.advanceTimersByTimeAsync(300);
  expect(saveState).toHaveBeenCalledTimes(1); expect(failed).toHaveBeenLastCalledWith(true);
  await writer.flush(); expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({ bookId: 'book', cfi: 'two' })); expect(failed).toHaveBeenLastCalledWith(false);
  await writer.dispose(); expect(saveState).toHaveBeenCalledTimes(2);
});
it('serializes concurrent flushes and saves a newer position received during an active write', async () => {
  let release!: () => void;
  const saveState = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const writer = new ProgressWriter({ saveState } as unknown as LibraryRepository, 'book', () => {});
  writer.update(location('one')); const first = writer.flush(); writer.update(location('two')); const second = writer.flush(); const third = writer.flush();
  expect(saveState).toHaveBeenCalledTimes(1); release(); await Promise.all([first, second, third]);
  expect(saveState.mock.calls.map(call => call[0].cfi)).toEqual(['one', 'two']); await writer.dispose();
});
