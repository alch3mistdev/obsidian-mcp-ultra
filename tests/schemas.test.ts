import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import * as schemas from '../src/schemas.js';

// Helper to validate a raw shape as a z.object schema
function parse<T extends Record<string, z.ZodType>>(shape: T, input: unknown) {
  return z.object(shape).parse(input);
}

function safeParse<T extends Record<string, z.ZodType>>(shape: T, input: unknown) {
  return z.object(shape).safeParse(input);
}

describe('Schemas', () => {
  describe('searchNotesInput', () => {
    it('should accept valid input', () => {
      const result = parse(schemas.searchNotesInput, { query: 'test' });
      expect(result.query).toBe('test');
      expect(result.limit).toBe(10); // default
    });

    it('should accept custom limit', () => {
      const result = parse(schemas.searchNotesInput, { query: 'test', limit: 5 });
      expect(result.limit).toBe(5);
    });

    it('should reject empty query', () => {
      const result = safeParse(schemas.searchNotesInput, { query: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing query', () => {
      const result = safeParse(schemas.searchNotesInput, {});
      expect(result.success).toBe(false);
    });

    it('should reject non-positive limit', () => {
      const result = safeParse(schemas.searchNotesInput, { query: 'test', limit: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe('readNoteInput', () => {
    it('should accept valid path', () => {
      const result = parse(schemas.readNoteInput, { path: 'notes/test.md' });
      expect(result.path).toBe('notes/test.md');
    });

    it('should reject empty path', () => {
      const result = safeParse(schemas.readNoteInput, { path: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('createNoteInput', () => {
    it('should accept path and content', () => {
      const result = parse(schemas.createNoteInput, { path: 'new.md', content: '# Title' });
      expect(result.path).toBe('new.md');
      expect(result.content).toBe('# Title');
    });

    it('should reject missing content', () => {
      const result = safeParse(schemas.createNoteInput, { path: 'new.md' });
      expect(result.success).toBe(false);
    });
  });

  describe('getGraphInput', () => {
    it('should accept no arguments (all optional)', () => {
      const result = parse(schemas.getGraphInput, {});
      expect(result.path).toBeUndefined();
      expect(result.depth).toBe(1); // default
    });

    it('should accept path and depth', () => {
      const result = parse(schemas.getGraphInput, { path: 'test.md', depth: 3 });
      expect(result.path).toBe('test.md');
      expect(result.depth).toBe(3);
    });
  });

  describe('findShortestPathInput', () => {
    it('should accept source and target', () => {
      const result = parse(schemas.findShortestPathInput, { source: 'a.md', target: 'b.md' });
      expect(result.source).toBe('a.md');
      expect(result.target).toBe('b.md');
    });

    it('should reject missing target', () => {
      const result = safeParse(schemas.findShortestPathInput, { source: 'a.md' });
      expect(result.success).toBe(false);
    });
  });

  describe('getHubNotesInput', () => {
    it('should default limit to 10', () => {
      const result = parse(schemas.getHubNotesInput, {});
      expect(result.limit).toBe(10);
    });
  });

  describe('getClustersInput', () => {
    it('should default minSize to 2', () => {
      const result = parse(schemas.getClustersInput, {});
      expect(result.minSize).toBe(2);
    });
  });

  describe('semanticSearchInput', () => {
    it('should accept query and limit', () => {
      const result = parse(schemas.semanticSearchInput, { query: 'machine learning', limit: 5 });
      expect(result.query).toBe('machine learning');
      expect(result.limit).toBe(5);
    });
  });

  describe('findSimilarInput', () => {
    it('should accept path and limit', () => {
      const result = parse(schemas.findSimilarInput, { path: 'ref.md', limit: 3 });
      expect(result.path).toBe('ref.md');
      expect(result.limit).toBe(3);
    });
  });
});
