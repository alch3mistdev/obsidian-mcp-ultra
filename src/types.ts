/**
 * Core types for the Obsidian MCP Ultra server
 */

export interface VaultConfig {
  apiUrl: string;
  apiKey: string;
  cacheEnabled?: boolean;
}

export interface Note {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, any>;
  links: Link[];
  backlinks: Link[];
  tags: string[];
  headings: Heading[];
  created?: Date;
  modified?: Date;
}

export interface Link {
  target: string;
  text?: string;
  type: 'wikilink' | 'markdown';
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface GraphNode {
  path: string;
  title: string;
  tags: string[];
  outlinks: string[];
  inlinks: string[];
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  excerpt?: string;
}

export interface VaultStats {
  totalNotes: number;
  totalLinks: number;
  totalTags: number;
  orphanedNotes: number;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  excerpt: string;
}

export interface VaultChanges {
  added: string[];
  deleted: string[];
}
