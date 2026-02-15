/**
 * Markdown parser that extracts semantic units from Obsidian notes
 */

import matter from 'gray-matter';
import type { Note, Link, Heading } from '../types.js';

export class MarkdownParser {
  /**
   * Parse markdown content into a structured Note object
   */
  parse(content: string, path: string): Note {
    // Parse frontmatter
    const { data: frontmatter, content: body } = matter(content);

    // Extract title from frontmatter or filename
    const filename = path.split('/').pop()?.replace(/\.md$/, '') || '';
    const title = frontmatter.title || filename;

    // Extract components
    const links = this.extractLinks(body);
    const tags = this.extractTags(body, frontmatter);
    const headings = this.extractHeadings(body);

    return {
      path,
      title,
      content: body,
      frontmatter,
      links,
      backlinks: [], // Will be populated by graph builder
      tags,
      headings,
    };
  }

  /**
   * Extract all wikilinks and markdown links from content
   */
  private extractLinks(content: string): Link[] {
    const links: Link[] = [];

    // Extract wikilinks [[target]] or [[target|text]]
    const wikilinkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
    let match;
    while ((match = wikilinkRegex.exec(content)) !== null) {
      links.push({
        target: match[1].trim(),
        text: match[3]?.trim(),
        type: 'wikilink',
      });
    }

    // Extract markdown links [text](target)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      // Only include internal links (relative paths or .md files)
      const target = match[2];
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        links.push({
          target: target.replace(/\.md$/, ''),
          text: match[1],
          type: 'markdown',
        });
      }
    }

    return links;
  }

  /**
   * Extract tags from content and frontmatter
   */
  private extractTags(content: string, frontmatter: Record<string, any>): string[] {
    const tags = new Set<string>();

    // Extract from frontmatter
    if (frontmatter.tags) {
      const fmTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
      fmTags.forEach(tag => tags.add(this.normalizeTag(String(tag))));
    }

    // Strip code blocks and inline code before extracting tags
    const stripped = this.stripCodeBlocks(content);

    // Extract inline tags: must be preceded by whitespace or start of line,
    // and followed by word characters (not inside URLs or hex colors)
    const tagRegex = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_/-]*)/gm;
    let match;
    while ((match = tagRegex.exec(stripped)) !== null) {
      tags.add(this.normalizeTag(match[1]));
    }

    return Array.from(tags).sort();
  }

  /**
   * Strip fenced code blocks and inline code to avoid false matches
   */
  private stripCodeBlocks(content: string): string {
    // Remove fenced code blocks (``` ... ```)
    let stripped = content.replace(/```[\s\S]*?```/g, '');
    // Remove inline code (`...`)
    stripped = stripped.replace(/`[^`]+`/g, '');
    return stripped;
  }

  /**
   * Extract headings from content
   */
  private extractHeadings(content: string): Heading[] {
    const headings: Heading[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1,
        });
      }
    });

    return headings;
  }

  /**
   * Normalize tag format
   */
  private normalizeTag(tag: string): string {
    return tag.replace(/^#/, '').toLowerCase();
  }
}
