import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { Vault } from '../src/vault/vault.js';
import { GraphBuilder } from '../src/graph/builder.js';

describe('GraphBuilder', () => {
  let tempDir: string;
  let vault: Vault;
  let graph: GraphBuilder;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'graph-test-'));
    vault = new Vault({ path: tempDir, cacheEnabled: true });
    graph = new GraphBuilder(vault);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('buildGraph', () => {
    it('should build a graph from vault notes', async () => {
      await vault.createNote('note1.md', '# Note 1\n\nLinks to [[Note 2]]');
      await vault.createNote('note2.md', '# Note 2\n\nLinks to [[Note 1]]');
      await graph.buildGraph();

      const stats = graph.getStats();
      expect(stats.totalNodes).toBe(2);
      expect(stats.totalEdges).toBe(2);
    });

    it('should resolve wikilinks to graph nodes', async () => {
      await vault.createNote('Projects/Alpha.md', '# Alpha\n\nSee [[Beta]]');
      await vault.createNote('Notes/Beta.md', '# Beta\n\nRelated to [[Alpha]]');
      await graph.buildGraph();

      // Alpha should have outlink to Beta (resolved via filename)
      const alpha = graph.getNode('Projects/Alpha.md');
      expect(alpha).toBeDefined();
      expect(alpha!.outlinks).toContain('Beta');

      // Beta should have a backlink from Alpha
      const backlinks = graph.getBacklinks('Notes/Beta.md');
      expect(backlinks).toContain('Projects/Alpha.md');
    });
  });

  describe('getBacklinks (fuzzy resolution)', () => {
    it('should find backlinks using fuzzy path resolution', async () => {
      await vault.createNote('note1.md', 'Links to [[note2]]');
      await vault.createNote('note2.md', 'Target note');
      await graph.buildGraph();

      // Should work with exact path
      const bl1 = graph.getBacklinks('note2.md');
      expect(bl1).toContain('note1.md');

      // Should also work without .md extension
      const bl2 = graph.getBacklinks('note2');
      expect(bl2).toContain('note1.md');
    });
  });

  describe('getConnectedNodes', () => {
    it('should return connected nodes at depth 1', async () => {
      await vault.createNote('center.md', '# Center\n\n[[left]] and [[right]]');
      await vault.createNote('left.md', '# Left');
      await vault.createNote('right.md', '# Right');
      await graph.buildGraph();

      const connected = graph.getConnectedNodes('center.md', 1);
      expect(connected).toHaveLength(2);
    });

    it('should return empty array for unknown paths', async () => {
      await graph.buildGraph();
      const connected = graph.getConnectedNodes('nonexistent.md', 1);
      expect(connected).toHaveLength(0);
    });
  });

  describe('findNodesByTag', () => {
    it('should find nodes by tag', async () => {
      await vault.createNote('tagged.md', '# Tagged\n\n#research #important');
      await vault.createNote('other.md', '# Other\n\n#unrelated');
      await graph.buildGraph();

      const results = graph.findNodesByTag('research');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('tagged.md');
    });

    it('should normalize tag with # prefix', async () => {
      await vault.createNote('tagged.md', '# Tagged\n\n#myTag');
      await graph.buildGraph();

      const results = graph.findNodesByTag('#myTag');
      expect(results).toHaveLength(1);
    });
  });

  describe('incremental updates', () => {
    it('should update a single node without full rebuild', async () => {
      await vault.createNote('note1.md', '# Note 1\n\nOriginal');
      await vault.createNote('note2.md', '# Note 2');
      await graph.buildGraph();

      expect(graph.getStats().totalNodes).toBe(2);

      // Update note1 to link to note2 (use matching wikilink target)
      await vault.updateNote('note1.md', '# Note 1\n\nNow links to [[note2]]');
      vault.clearCache();
      await graph.updateNode('note1.md');

      const backlinks = graph.getBacklinks('note2.md');
      expect(backlinks).toContain('note1.md');
    });

    it('should handle new node addition', async () => {
      await vault.createNote('existing.md', '# Existing');
      await graph.buildGraph();

      await vault.createNote('new-note.md', '# New\n\nLinks to [[Existing]]');
      await graph.updateNode('new-note.md');

      expect(graph.getStats().totalNodes).toBe(2);
      const backlinks = graph.getBacklinks('existing.md');
      expect(backlinks).toContain('new-note.md');
    });
  });

  describe('removeNode', () => {
    it('should remove a node and clean up links', async () => {
      await vault.createNote('source.md', '# Source\n\n[[target]]');
      await vault.createNote('target.md', '# Target');
      await graph.buildGraph();

      expect(graph.getBacklinks('target.md')).toContain('source.md');

      graph.removeNode('source.md');

      expect(graph.getNode('source.md')).toBeUndefined();
      expect(graph.getBacklinks('target.md')).not.toContain('source.md');
    });
  });

  describe('exportGraph', () => {
    it('should export nodes and edges', async () => {
      await vault.createNote('a.md', '# A\n\n[[B]]');
      await vault.createNote('b.md', '# B\n\n[[A]]');
      await graph.buildGraph();

      const exported = graph.exportGraph();
      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(2);
    });
  });
});
