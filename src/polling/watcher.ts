/**
 * Vault change polling system.
 * Periodically compares the vault file list against a known snapshot
 * to detect additions and deletions, then triggers incremental updates.
 */

import type { VaultChanges } from '../types.js';
import type { Vault } from '../vault/vault.js';

export interface WatcherConfig {
  pollIntervalMs: number;
  onChanges: (changes: VaultChanges) => Promise<void>;
}

export class VaultWatcher {
  private vault: Vault;
  private config: WatcherConfig;
  private knownPaths: Set<string> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(vault: Vault, config: WatcherConfig) {
    this.vault = vault;
    this.config = config;
  }

  /**
   * Take an initial snapshot of the vault and start polling.
   */
  async start(): Promise<void> {
    const notes = await this.vault.listNotes();
    this.knownPaths = new Set(notes);
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a single poll cycle. Detects file additions and deletions.
   * Clears the vault cache so subsequent reads get fresh content.
   */
  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      this.vault.clearCache();

      const currentNotes = await this.vault.listNotes();
      const currentSet = new Set(currentNotes);

      const changes: VaultChanges = { added: [], deleted: [] };

      for (const path of currentNotes) {
        if (!this.knownPaths.has(path)) {
          changes.added.push(path);
        }
      }

      for (const path of this.knownPaths) {
        if (!currentSet.has(path)) {
          changes.deleted.push(path);
        }
      }

      this.knownPaths = currentSet;

      if (changes.added.length > 0 || changes.deleted.length > 0) {
        await this.config.onChanges(changes);
      }
    } catch (error) {
      console.error('Polling error:', error);
    } finally {
      this.polling = false;
    }
  }
}
