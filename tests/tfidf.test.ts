import { describe, it, expect, beforeEach } from 'vitest';
import { TfIdfIndex } from '../src/search/tfidf.js';

describe('TfIdfIndex', () => {
  let index: TfIdfIndex;

  beforeEach(() => {
    index = new TfIdfIndex();
  });

  describe('tokenize', () => {
    it('should lowercase and split text', () => {
      const tokens = index.tokenize('Hello World Programming');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('programm'); // "programming" -> strip -ing
    });

    it('should remove stopwords', () => {
      const tokens = index.tokenize('the quick brown fox is a very fast animal');
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('is');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('very');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should strip markdown syntax', () => {
      const tokens = index.tokenize('# Heading\n\nSome **bold** text with [[wikilink]] and [link](url)');
      expect(tokens).toContain('head'); // stemmed from heading
      expect(tokens).toContain('bold');
      expect(tokens).toContain('text');
      expect(tokens).toContain('wikilink');
      expect(tokens).toContain('link');
      expect(tokens).not.toContain('url');
      expect(tokens).not.toContain('#');
    });

    it('should strip code blocks', () => {
      const tokens = index.tokenize('Real text\n```js\nconst x = 1;\n```\nMore text');
      expect(tokens).toContain('real');
      expect(tokens).toContain('text');
      expect(tokens).not.toContain('const');
    });

    it('should filter short tokens', () => {
      const tokens = index.tokenize('I am a x big dog');
      expect(tokens).not.toContain('i');
      expect(tokens).not.toContain('x');
      expect(tokens).toContain('big');
      expect(tokens).toContain('dog');
    });

    it('should apply basic stemming', () => {
      const tokens = index.tokenize('running jumped libraries quickly processes');
      expect(tokens).toContain('runn'); // "running" -> strip -ing
      expect(tokens).toContain('jump'); // "jumped" -> strip -ed
      expect(tokens).toContain('library'); // "libraries" -> -ies -> -y
      expect(tokens).toContain('quick'); // "quickly" -> strip -ly
      expect(tokens).toContain('process'); // "processes" -> strip -es
    });
  });

  describe('buildIndex', () => {
    it('should build an index from documents', () => {
      const docs = new Map([
        ['a.md', 'JavaScript is great for web development'],
        ['b.md', 'Python is great for machine learning'],
      ]);

      index.buildIndex(docs);

      const results = index.search('javascript', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('a.md');
    });

    it('should handle empty documents', () => {
      const docs = new Map([['empty.md', '']]);
      index.buildIndex(docs);

      const results = index.search('anything', 10);
      expect(results).toHaveLength(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const docs = new Map([
        ['js.md', 'JavaScript programming language for web browsers and Node.js server-side development'],
        ['python.md', 'Python programming language for data science and machine learning applications'],
        ['cooking.md', 'Recipe for chocolate cake with vanilla frosting and sprinkles'],
      ]);
      index.buildIndex(docs);
    });

    it('should rank relevant documents higher', () => {
      const results = index.search('javascript web development', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('js.md');
    });

    it('should rank python document higher for ML query', () => {
      const results = index.search('machine learning data science', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('python.md');
    });

    it('should find cooking document for food query', () => {
      const results = index.search('chocolate cake recipe', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('cooking.md');
    });

    it('should respect limit parameter', () => {
      const results = index.search('programming', 1);
      expect(results).toHaveLength(1);
    });

    it('should return empty for no matching terms', () => {
      const results = index.search('quantum physics', 10);
      expect(results).toHaveLength(0);
    });

    it('should return scores between 0 and 1', () => {
      const results = index.search('javascript', 10);
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('findSimilar', () => {
    beforeEach(() => {
      const docs = new Map([
        ['js.md', 'JavaScript programming language for web browsers and Node.js server-side development'],
        ['ts.md', 'TypeScript programming language extends JavaScript with static types for web development'],
        ['cooking.md', 'Recipe for chocolate cake with vanilla frosting and sprinkles'],
      ]);
      index.buildIndex(docs);
    });

    it('should find TypeScript similar to JavaScript', () => {
      const results = index.findSimilar('js.md', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('ts.md');
    });

    it('should rank cooking lower in similarity to JavaScript', () => {
      const results = index.findSimilar('js.md', 10);
      const tsIndex = results.findIndex(r => r.path === 'ts.md');
      const cookingIndex = results.findIndex(r => r.path === 'cooking.md');

      if (cookingIndex !== -1) {
        expect(tsIndex).toBeLessThan(cookingIndex);
      }
    });

    it('should return empty for unknown document', () => {
      const results = index.findSimilar('nonexistent.md', 10);
      expect(results).toHaveLength(0);
    });

    it('should not include self in results', () => {
      const results = index.findSimilar('js.md', 10);
      expect(results.find(r => r.path === 'js.md')).toBeUndefined();
    });
  });

  describe('incremental updates', () => {
    it('should add a new document and find it in search', () => {
      const docs = new Map([['a.md', 'Original document about cats and felines']]);
      index.buildIndex(docs);

      index.updateDocument('b.md', 'New document about dogs and canines');

      // Search for a term unique to b.md
      const results = index.search('dogs canines', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('b.md');
    });

    it('should update an existing document', () => {
      const docs = new Map([
        ['a.md', 'Document about feline behavior'],
        ['b.md', 'Document about canine training'],
      ]);
      index.buildIndex(docs);

      index.updateDocument('a.md', 'Document about quantum computing research');

      const felineResults = index.search('feline behavior', 10);
      expect(felineResults).toHaveLength(0);

      const quantumResults = index.search('quantum computing', 10);
      expect(quantumResults).toHaveLength(1);
      expect(quantumResults[0].path).toBe('a.md');
    });

    it('should remove a document', () => {
      const docs = new Map([
        ['a.md', 'Cats are cute'],
        ['b.md', 'Dogs are loyal'],
      ]);
      index.buildIndex(docs);

      index.removeDocument('a.md');

      const results = index.search('cute cats', 10);
      expect(results).toHaveLength(0);
    });
  });
});
