/**
 * Vault interface for accessing and manipulating Obsidian vault files
 */

import { promises as fs } from 'fs';
import { join, relative, dirname } from 'path';
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
   * Get the vault path
   */
  getPath(): string {
    return this.config.path;
  }

  /**
   * List all markdown files in the vault
   */
  async listNotes(): Promise<string[]> {
    const notes: string[] = [];
    await this.scanDirectory(this.config.path, notes);
    return notes.sort();
  }

  /**
   * Read and parse a note by its path
   */
  async readNote(notePath: string): Promise<Note> {
    // Check cache first
    if (this.config.cacheEnabled && this.cache.has(notePath)) {
      return this.cache.get(notePath)!;
    }

    const fullPath = this.resolveNotePath(notePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const note = this.parser.parse(content, notePath);

    // Get file stats
    const stats = await fs.stat(fullPath);
    note.created = stats.birthtime;
    note.modified = stats.mtime;

    // Cache the note
    if (this.config.cacheEnabled) {
      this.cache.set(notePath, note);
    }

    return note;
  }

  /**
   * Create a new note
   */
  async createNote(notePath: string, content: string): Promise<Note> {
    const fullPath = this.resolveNotePath(notePath);

    // Ensure directory exists
    await fs.mkdir(dirname(fullPath), { recursive: true });

    // Write the file
    await fs.writeFile(fullPath, content, 'utf-8');

    // Invalidate cache
    this.cache.delete(notePath);

    return this.readNote(notePath);
  }

  /**
   * Update an existing note
   */
  async updateNote(notePath: string, content: string): Promise<Note> {
    const fullPath = this.resolveNotePath(notePath);

    // Verify file exists
    await fs.access(fullPath);

    // Write the file
    await fs.writeFile(fullPath, content, 'utf-8');

    // Invalidate cache
    this.cache.delete(notePath);

    return this.readNote(notePath);
  }

  /**
   * Delete a note
   */
  async deleteNote(notePath: string): Promise<void> {
    const fullPath = this.resolveNotePath(notePath);
    await fs.unlink(fullPath);
    this.cache.delete(notePath);
  }

  /**
   * Check if a note exists
   */
  async noteExists(notePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolveNotePath(notePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search notes by content or title
   */
  async searchNotes(query: string, limit = 10): Promise<string[]> {
    const allNotes = await this.listNotes();
    const queryLower = query.toLowerCase();
    const results: Array<{ path: string; score: number }> = [];

    for (const notePath of allNotes) {
      const note = await this.readNote(notePath);
      let score = 0;

      // Check title match
      if (note.title.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // Check content match
      if (note.content.toLowerCase().includes(queryLower)) {
        score += 5;
      }

      // Check tag match
      if (note.tags.some(tag => tag.includes(queryLower))) {
        score += 3;
      }

      if (score > 0) {
        results.push({ path: notePath, score });
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.path);
  }

  /**
   * Get vault statistics
   */
  async getStats(): Promise<VaultStats> {
    const notes = await this.listNotes();
    let totalLinks = 0;
    const allTags = new Set<string>();
    const linkedNotes = new Set<string>();

    for (const notePath of notes) {
      const note = await this.readNote(notePath);
      totalLinks += note.links.length;
      note.tags.forEach(tag => allTags.add(tag));
      
      if (note.links.length > 0) {
        linkedNotes.add(notePath);
        note.links.forEach(link => linkedNotes.add(link.target));
      }
    }

    return {
      totalNotes: notes.length,
      totalLinks,
      totalTags: allTags.size,
      orphanedNotes: notes.length - linkedNotes.size,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Resolve a note path to an absolute filesystem path
   */
  private resolveNotePath(notePath: string): string {
    // Remove leading slash if present
    const cleanPath = notePath.replace(/^\//, '');
    // Ensure .md extension
    const pathWithExt = cleanPath.endsWith('.md') ? cleanPath : `${cleanPath}.md`;
    return join(this.config.path, pathWithExt);
  }

  /**
   * Recursively scan directory for markdown files
   */
  private async scanDirectory(dirPath: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (!entry.name.startsWith('.')) {
          await this.scanDirectory(fullPath, results);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Store relative path from vault root
        const relativePath = relative(this.config.path, fullPath);
        results.push(relativePath);
      }
    }
  }
}
