import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { Vault } from '../src/vault/vault.js';

describe('Vault', () => {
  let tempDir: string;
  let vault: Vault;

  beforeEach(async () => {
    // Create a temporary vault directory
    tempDir = await mkdtemp(join(tmpdir(), 'vault-test-'));
    vault = new Vault({ path: tempDir, cacheEnabled: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('createNote', () => {
    it('should create a new note', async () => {
      const content = '# Test Note\n\nTest content';
      const note = await vault.createNote('test.md', content);

      expect(note.title).toBe('test');
      expect(note.content).toContain('Test content');
      expect(note.path).toBe('test.md');
    });

    it('should create nested notes', async () => {
      const content = 'Nested content';
      const note = await vault.createNote('folder/nested.md', content);

      expect(note.path).toBe('folder/nested.md');
      expect(await vault.noteExists('folder/nested.md')).toBe(true);
    });
  });

  describe('readNote', () => {
    it('should read an existing note', async () => {
      await vault.createNote('test.md', '---\ntitle: Test\n---\n\n# Test\n\nContent');
      const note = await vault.readNote('test.md');

      expect(note.title).toBe('Test');
      expect(note.content).toContain('Content');
    });

    it('should cache notes when enabled', async () => {
      await vault.createNote('cached.md', 'Cached content');

      // First read
      const note1 = await vault.readNote('cached.md');

      // Second read should use cache
      const note2 = await vault.readNote('cached.md');

      expect(note1).toEqual(note2);
    });
  });

  describe('updateNote', () => {
    it('should update an existing note', async () => {
      await vault.createNote('update.md', 'Original');
      const updated = await vault.updateNote('update.md', 'Updated content');

      expect(updated.content).toBe('Updated content');
    });

    it('should throw error for non-existent note', async () => {
      await expect(vault.updateNote('nonexistent.md', 'content')).rejects.toThrow();
    });
  });

  describe('listNotes', () => {
    it('should list all notes', async () => {
      await vault.createNote('note1.md', 'Content 1');
      await vault.createNote('note2.md', 'Content 2');
      await vault.createNote('folder/note3.md', 'Content 3');

      const notes = await vault.listNotes();

      expect(notes).toHaveLength(3);
      expect(notes).toContain('note1.md');
      expect(notes).toContain('note2.md');
      expect(notes).toContain('folder/note3.md');
    });

    it('should return empty array for empty vault', async () => {
      const notes = await vault.listNotes();
      expect(notes).toHaveLength(0);
    });
  });

  describe('searchNotes', () => {
    beforeEach(async () => {
      await vault.createNote('javascript.md', '# JavaScript Guide\n\nLearn JavaScript');
      await vault.createNote('python.md', '# Python Tutorial\n\nLearn Python');
      await vault.createNote('tags.md', '---\ntags: [javascript, coding]\n---\n\nCode examples');
    });

    it('should search by title', async () => {
      const results = await vault.searchNotes('JavaScript Guide');
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('javascript.md');
    });

    it('should search by content', async () => {
      const results = await vault.searchNotes('Learn');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should search by tag', async () => {
      const results = await vault.searchNotes('javascript');
      expect(results).toContain('tags.md');
    });

    it('should respect limit parameter', async () => {
      const results = await vault.searchNotes('Learn', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      await vault.createNote('delete-me.md', 'Content');
      expect(await vault.noteExists('delete-me.md')).toBe(true);

      await vault.deleteNote('delete-me.md');
      expect(await vault.noteExists('delete-me.md')).toBe(false);
    });

    it('should clear cache entry on delete', async () => {
      await vault.createNote('cached-delete.md', 'Content');
      // Read to populate cache
      await vault.readNote('cached-delete.md');
      // Delete
      await vault.deleteNote('cached-delete.md');
      // Should throw because file is gone, not return cached version
      await expect(vault.readNote('cached-delete.md')).rejects.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return vault statistics', async () => {
      await vault.createNote('note1.md', '# Note 1\n\nLinks to [[note2]]');
      await vault.createNote('note2.md', '# Note 2\n\n#tag1 #tag2');
      await vault.createNote('orphan.md', 'Orphaned note');

      const stats = await vault.getStats();

      expect(stats.totalNotes).toBe(3);
      expect(stats.totalLinks).toBeGreaterThan(0);
      expect(stats.totalTags).toBeGreaterThan(0);
    });
  });

  describe('path traversal protection', () => {
    it('should reject paths that escape vault root', async () => {
      await expect(vault.readNote('../../etc/passwd')).rejects.toThrow('Path traversal detected');
    });

    it('should reject paths with .. components', async () => {
      await expect(vault.createNote('../outside.md', 'content')).rejects.toThrow('Path traversal detected');
    });

    it('should allow valid nested paths', async () => {
      const note = await vault.createNote('folder/subfolder/note.md', 'content');
      expect(note.path).toBe('folder/subfolder/note.md');
    });
  });
});
