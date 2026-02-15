import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { MarkdownParser } from '../src/parser/markdown.js';

describe('MarkdownParser', () => {
  const parser = new MarkdownParser();

  describe('parse', () => {
    it('should extract title from frontmatter', () => {
      const content = `---
title: Test Note
tags: [test, demo]
---

Content here`;

      const result = parser.parse(content, 'test.md');
      expect(result.title).toBe('Test Note');
      expect(result.frontmatter.title).toBe('Test Note');
    });

    it('should extract title from filename if no frontmatter', () => {
      const content = 'Just content';
      const result = parser.parse(content, 'my-note.md');
      expect(result.title).toBe('my-note');
    });

    it('should extract wikilinks', () => {
      const content = 'Check out [[Note 1]] and [[Note 2|custom text]]';
      const result = parser.parse(content, 'test.md');
      
      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({
        target: 'Note 1',
        text: undefined,
        type: 'wikilink',
      });
      expect(result.links[1]).toEqual({
        target: 'Note 2',
        text: 'custom text',
        type: 'wikilink',
      });
    });

    it('should extract markdown links', () => {
      const content = 'Check [Link Text](relative/path.md) and [External](https://example.com)';
      const result = parser.parse(content, 'test.md');
      
      // Should only include internal links
      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toEqual({
        target: 'relative/path',
        text: 'Link Text',
        type: 'markdown',
      });
    });

    it('should extract inline tags', () => {
      const content = 'This has #tag1 and #tag2/subtag';
      const result = parser.parse(content, 'test.md');
      
      expect(result.tags).toContain('tag1');
      expect(result.tags).toContain('tag2/subtag');
    });

    it('should extract tags from frontmatter', () => {
      const content = `---
tags: [frontend, javascript]
---

Content`;
      const result = parser.parse(content, 'test.md');
      
      expect(result.tags).toContain('frontend');
      expect(result.tags).toContain('javascript');
    });

    it('should extract headings', () => {
      const content = `# Heading 1
Some content
## Heading 2
More content
### Heading 3`;

      const result = parser.parse(content, 'test.md');
      
      expect(result.headings).toHaveLength(3);
      expect(result.headings[0]).toEqual({
        level: 1,
        text: 'Heading 1',
        line: 1,
      });
      expect(result.headings[1]).toEqual({
        level: 2,
        text: 'Heading 2',
        line: 3,
      });
      expect(result.headings[2]).toEqual({
        level: 3,
        text: 'Heading 3',
        line: 5,
      });
    });

    it('should handle complex documents', () => {
      const content = `---
title: Complex Note
tags: [complex, test]
---

# Introduction

This note links to [[Other Note]] and uses #inline-tag.

## Section 1

More content with [markdown link](./other.md).

### Subsection

Final content.`;

      const result = parser.parse(content, 'test.md');
      
      expect(result.title).toBe('Complex Note');
      expect(result.tags).toContain('complex');
      expect(result.tags).toContain('test');
      expect(result.tags).toContain('inline-tag');
      expect(result.links).toHaveLength(2);
      expect(result.headings).toHaveLength(3);
    });
  });
});
