/**
 * Vault interface for accessing and manipulating Obsidian vault
 * via the Obsidian Local REST API plugin.
 */

import type { VaultConfig, Note, VaultStats } from '../types.js';
import { MarkdownParser } from '../parser/markdown.js';

export class Vault {
  private config: VaultConfig;
  private parser: MarkdownParser;
  private cache: Map<string, Note>;

  constructor(config: VaultConfig) {
    this.config = config;
    this.parser = new MarkdownParser();
    this.cache = new Map();
  }

  /**
   * List all markdown files in the vault
   */
  async listNotes(): Promise<string[]> {
    const notes: string[] = [];
    await this.listDirectory('', notes);
    return notes.sort();
  }

  /**
   * Read and parse a note by its path
   */
  async readNote(notePath: string): Promise<Note> {
    const normalized = this.normalizePath(notePath);

    if (this.config.cacheEnabled && this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    const response = await this.request(
      `/vault/${this.encodeURIPath(normalized)}`,
      { headers: { 'Accept': 'text/markdown' } },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Note not found: ${normalized}`);
      }
      throw new Error(`Failed to read note '${normalized}': ${response.status}`);
    }

    const content = await response.text();
    const note = this.parser.parse(content, normalized);

    if (this.config.cacheEnabled) {
      this.cache.set(normalized, note);
    }

    return note;
  }

  /**
   * Create a new note
   */
  async createNote(notePath: string, content: string): Promise<Note> {
    const normalized = this.normalizePath(notePath);

    const response = await this.request(
      `/vault/${this.encodeURIPath(normalized)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create note '${normalized}': ${response.status}`);
    }

    this.cache.delete(normalized);
    return this.readNote(normalized);
  }

  /**
   * Update an existing note
   */
  async updateNote(notePath: string, content: string): Promise<Note> {
    const normalized = this.normalizePath(notePath);

    const exists = await this.noteExists(normalized);
    if (!exists) {
      throw new Error(`Note not found: ${normalized}`);
    }

    const response = await this.request(
      `/vault/${this.encodeURIPath(normalized)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: content,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to update note '${normalized}': ${response.status}`);
    }

    this.cache.delete(normalized);
    return this.readNote(normalized);
  }

  /**
   * Delete a note
   */
  async deleteNote(notePath: string): Promise<void> {
    const normalized = this.normalizePath(notePath);

    const response = await this.request(
      `/vault/${this.encodeURIPath(normalized)}`,
      { method: 'DELETE' },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete note '${normalized}': ${response.status}`);
    }

    this.cache.delete(normalized);
  }

  /**
   * Check if a note exists
   */
  async noteExists(notePath: string): Promise<boolean> {
    const normalized = this.normalizePath(notePath);

    const response = await this.request(
      `/vault/${this.encodeURIPath(normalized)}`,
      { headers: { 'Accept': 'text/markdown' } },
    );

    return response.ok;
  }

  /**
   * Search notes using the Obsidian REST API simple search
   */
  async searchNotes(query: string, limit = 10): Promise<string[]> {
    const response = await this.request(
      `/search/simple/?query=${encodeURIComponent(query)}&contextLength=100`,
      {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      },
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const results = await response.json() as Array<{
      filename: string;
      matches: Array<{ match: { start: number; end: number }; context: string }>;
    }>;

    return results
      .slice(0, limit)
      .map(r => r.filename)
      .filter(f => f.endsWith('.md'));
  }

  /**
   * Get vault statistics
   */
  async getStats(): Promise<VaultStats> {
    const notes = await this.listNotes();
    let totalLinks = 0;
    const allTags = new Set<string>();
    let orphanedCount = 0;

    for (const notePath of notes) {
      const note = await this.readNote(notePath);
      totalLinks += note.links.length;
      note.tags.forEach(tag => allTags.add(tag));

      if (note.links.length === 0 && note.backlinks.length === 0) {
        orphanedCount++;
      }
    }

    return {
      totalNotes: notes.length,
      totalLinks,
      totalTags: allTags.size,
      orphanedNotes: orphanedCount,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Make an authenticated request to the Obsidian REST API
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.apiUrl}${path}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.config.apiKey}`);

    return fetch(url, { ...options, headers });
  }

  /**
   * Normalize a note path: strip leading slash, ensure .md extension
   */
  private normalizePath(notePath: string): string {
    const clean = notePath.replace(/^\//, '');
    return clean.endsWith('.md') ? clean : `${clean}.md`;
  }

  /**
   * Encode path segments for use in URLs (preserves forward slashes)
   */
  private encodeURIPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  /**
   * Recursively list markdown files via the REST API directory listing
   */
  private async listDirectory(dirPath: string, results: string[]): Promise<void> {
    const apiPath = dirPath ? `/vault/${this.encodeURIPath(dirPath)}/` : '/vault/';
    const response = await this.request(apiPath, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to list directory '${dirPath}': ${response.status}`);
    }

    const data = await response.json() as { files: string[] };

    for (const file of data.files) {
      if (file.endsWith('/')) {
        // Subdirectory — skip hidden dirs
        const name = file.slice(0, -1).split('/').pop() || '';
        if (!name.startsWith('.')) {
          const subdir = dirPath ? `${dirPath}/${file.slice(0, -1)}` : file.slice(0, -1);
          await this.listDirectory(subdir, results);
        }
      } else if (file.endsWith('.md')) {
        const fullPath = dirPath ? `${dirPath}/${file}` : file;
        results.push(fullPath);
      }
    }
  }
}
