import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Vault } from '../src/vault/vault.js';

describe('Vault', () => {
  let vault: Vault;
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vault = new Vault({
      apiUrl: 'http://localhost:27123',
      apiKey: 'test-api-key',
      cacheEnabled: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createNote', () => {
    it('should create a new note', async () => {
      const content = '# Test Note\n\nTest content';

      fetchMock
        // PUT to create
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        // GET to read back
        .mockResolvedValueOnce(new Response(content, { status: 200 }));

      const note = await vault.createNote('test.md', content);

      expect(note.title).toBe('test');
      expect(note.content).toContain('Test content');
      expect(note.path).toBe('test.md');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:27123/vault/test.md',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should create nested notes', async () => {
      const content = 'Nested content';

      fetchMock
        // PUT to create
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        // GET to read back
        .mockResolvedValueOnce(new Response(content, { status: 200 }))
        // GET for noteExists check
        .mockResolvedValueOnce(new Response(content, { status: 200 }));

      const note = await vault.createNote('folder/nested.md', content);
      expect(note.path).toBe('folder/nested.md');

      const exists = await vault.noteExists('folder/nested.md');
      expect(exists).toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:27123/vault/folder/nested.md',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  describe('readNote', () => {
    it('should read a note via API', async () => {
      const content = '---\ntitle: Test\n---\n\n# Test\n\nContent';
      fetchMock.mockResolvedValueOnce(new Response(content, { status: 200 }));

      const note = await vault.readNote('test.md');

      expect(note.title).toBe('Test');
      expect(note.content).toContain('Content');
    });

    it('should cache notes when enabled', async () => {
      const content = 'Cached content';
      fetchMock.mockResolvedValueOnce(new Response(content, { status: 200 }));

      const note1 = await vault.readNote('cached.md');
      const note2 = await vault.readNote('cached.md');

      expect(note1).toEqual(note2);
      // fetch should only be called once (second read uses cache)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateNote', () => {
    it('should update an existing note', async () => {
      fetchMock
        // GET for noteExists check
        .mockResolvedValueOnce(new Response('Original', { status: 200 }))
        // PUT to update
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        // GET to read back
        .mockResolvedValueOnce(new Response('Updated content', { status: 200 }));

      const updated = await vault.updateNote('update.md', 'Updated content');
      expect(updated.content).toBe('Updated content');
    });

    it('should throw error for non-existent note', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
      await expect(vault.updateNote('nonexistent.md', 'content')).rejects.toThrow();
    });
  });

  describe('listNotes', () => {
    it('should list all notes', async () => {
      // Root directory listing
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ files: ['note1.md', 'note2.md', 'folder/'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // Subdirectory listing
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ files: ['note3.md'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const notes = await vault.listNotes();

      expect(notes).toHaveLength(3);
      expect(notes).toContain('note1.md');
      expect(notes).toContain('note2.md');
      expect(notes).toContain('folder/note3.md');
    });

    it('should return empty array for empty vault', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [] }), { status: 200 }),
      );

      const notes = await vault.listNotes();
      expect(notes).toHaveLength(0);
    });
  });

  describe('searchNotes', () => {
    it('should search via API', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { filename: 'javascript.md', matches: [{ match: { start: 0, end: 10 }, context: 'JavaScript Guide' }] },
          ]),
          { status: 200 },
        ),
      );

      const results = await vault.searchNotes('JavaScript Guide');
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('javascript.md');
    });

    it('should return multiple results', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { filename: 'javascript.md', matches: [{ match: { start: 0, end: 5 }, context: 'Learn JavaScript' }] },
            { filename: 'python.md', matches: [{ match: { start: 0, end: 5 }, context: 'Learn Python' }] },
          ]),
          { status: 200 },
        ),
      );

      const results = await vault.searchNotes('Learn');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit parameter', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { filename: 'a.md', matches: [] },
            { filename: 'b.md', matches: [] },
          ]),
          { status: 200 },
        ),
      );

      const results = await vault.searchNotes('Learn', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      // noteExists check
      fetchMock.mockResolvedValueOnce(new Response('Content', { status: 200 }));
      const existsBefore = await vault.noteExists('delete-me.md');
      expect(existsBefore).toBe(true);

      // DELETE request
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await vault.deleteNote('delete-me.md');

      // noteExists check after delete
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
      const existsAfter = await vault.noteExists('delete-me.md');
      expect(existsAfter).toBe(false);
    });

    it('should clear cache entry on delete', async () => {
      const content = 'Content';

      // Read to populate cache
      fetchMock.mockResolvedValueOnce(new Response(content, { status: 200 }));
      await vault.readNote('cached-delete.md');

      // Delete
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await vault.deleteNote('cached-delete.md');

      // Should call API again (not use cache) and get 404
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
      await expect(vault.readNote('cached-delete.md')).rejects.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return vault statistics', async () => {
      // listNotes - root directory
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ files: ['note1.md', 'note2.md', 'orphan.md'] }), { status: 200 }),
      );
      // readNote for note1
      fetchMock.mockResolvedValueOnce(
        new Response('# Note 1\n\nLinks to [[note2]]', { status: 200 }),
      );
      // readNote for note2
      fetchMock.mockResolvedValueOnce(
        new Response('# Note 2\n\n#tag1 #tag2', { status: 200 }),
      );
      // readNote for orphan
      fetchMock.mockResolvedValueOnce(
        new Response('Orphaned note', { status: 200 }),
      );

      const stats = await vault.getStats();

      expect(stats.totalNotes).toBe(3);
      expect(stats.totalLinks).toBeGreaterThan(0);
      expect(stats.totalTags).toBeGreaterThan(0);
    });
  });

  describe('authentication', () => {
    it('should include Authorization header in requests', async () => {
      fetchMock.mockResolvedValueOnce(new Response('content', { status: 200 }));
      await vault.readNote('test.md');

      const [, options] = fetchMock.mock.calls[0];
      const headers = new Headers(options.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-api-key');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
      await expect(vault.readNote('test.md')).rejects.toThrow('Failed to read note');
    });

    it('should throw on 404 for readNote', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
      await expect(vault.readNote('missing.md')).rejects.toThrow('Note not found');
    });
  });
});
