import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VaultWatcher } from '../src/polling/watcher.js';
import type { Vault } from '../src/vault/vault.js';
import type { VaultChanges } from '../src/types.js';

describe('VaultWatcher', () => {
  let mockVault: {
    listNotes: ReturnType<typeof vi.fn>;
    clearCache: ReturnType<typeof vi.fn>;
  };
  let onChanges: ReturnType<typeof vi.fn>;
  let watcher: VaultWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    mockVault = {
      listNotes: vi.fn(),
      clearCache: vi.fn(),
    };
    onChanges = vi.fn().mockResolvedValue(undefined);
    watcher = new VaultWatcher(mockVault as unknown as Vault, {
      pollIntervalMs: 1000,
      onChanges,
    });
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  it('should take an initial snapshot on start', async () => {
    mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
    await watcher.start();
    expect(mockVault.listNotes).toHaveBeenCalledTimes(1);
  });

  it('should detect new files', async () => {
    // Initial state: one file
    mockVault.listNotes.mockResolvedValueOnce(['a.md']);
    await watcher.start();

    // Poll returns a new file
    mockVault.listNotes.mockResolvedValueOnce(['a.md', 'b.md']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChanges).toHaveBeenCalledWith({
      added: ['b.md'],
      deleted: [],
    });
  });

  it('should detect deleted files', async () => {
    mockVault.listNotes.mockResolvedValueOnce(['a.md', 'b.md']);
    await watcher.start();

    // Poll returns one fewer file
    mockVault.listNotes.mockResolvedValueOnce(['a.md']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChanges).toHaveBeenCalledWith({
      added: [],
      deleted: ['b.md'],
    });
  });

  it('should not call onChanges when nothing changes', async () => {
    mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
    await watcher.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onChanges).not.toHaveBeenCalled();
  });

  it('should clear vault cache on each poll', async () => {
    mockVault.listNotes.mockResolvedValue(['a.md']);
    await watcher.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockVault.clearCache).toHaveBeenCalled();
  });

  it('should handle errors gracefully and continue polling', async () => {
    mockVault.listNotes.mockResolvedValueOnce(['a.md']);
    await watcher.start();

    // First poll throws
    mockVault.listNotes.mockRejectedValueOnce(new Error('Network error'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChanges).not.toHaveBeenCalled();

    // Second poll succeeds with a change
    mockVault.listNotes.mockResolvedValueOnce(['a.md', 'new.md']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChanges).toHaveBeenCalledWith({
      added: ['new.md'],
      deleted: [],
    });
  });

  it('should stop polling after stop is called', async () => {
    mockVault.listNotes.mockResolvedValue(['a.md']);
    await watcher.start();

    watcher.stop();

    mockVault.listNotes.mockResolvedValueOnce(['a.md', 'b.md']);
    await vi.advanceTimersByTimeAsync(1000);

    // onChanges should not be called since polling was stopped
    expect(onChanges).not.toHaveBeenCalled();
  });

  it('should detect both additions and deletions simultaneously', async () => {
    mockVault.listNotes.mockResolvedValueOnce(['a.md', 'b.md']);
    await watcher.start();

    mockVault.listNotes.mockResolvedValueOnce(['b.md', 'c.md']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onChanges).toHaveBeenCalledWith({
      added: ['c.md'],
      deleted: ['a.md'],
    });
  });
});
