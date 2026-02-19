import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphBuilder } from '../src/graph/builder.js';
import type { Vault } from '../src/vault/vault.js';
import type { Note, Link } from '../src/types.js';

function makeNote(
  path: string,
  content: string,
  links: Link[] = [],
  tags: string[] = [],
): Note {
  return {
    path,
    title: path.replace(/\.md$/, '').split('/').pop() || '',
    content,
    frontmatter: {},
    links,
    backlinks: [],
    tags,
    headings: [],
  };
}

describe('GraphBuilder', () => {
  let mockVault: {
    listNotes: ReturnType<typeof vi.fn>;
    readNote: ReturnType<typeof vi.fn>;
    clearCache: ReturnType<typeof vi.fn>;
  };
  let graph: GraphBuilder;

  beforeEach(() => {
    mockVault = {
      listNotes: vi.fn(),
      readNote: vi.fn(),
      clearCache: vi.fn(),
    };
    graph = new GraphBuilder(mockVault as unknown as Vault);
  });

  describe('buildGraph', () => {
    it('should build a graph from vault notes', async () => {
      const note1 = makeNote('note1.md', 'Links to [[Note 2]]', [
        { target: 'Note 2', type: 'wikilink' },
      ]);
      const note2 = makeNote('note2.md', 'Links to [[Note 1]]', [
        { target: 'Note 1', type: 'wikilink' },
      ]);

      mockVault.listNotes.mockResolvedValue(['note1.md', 'note2.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'note1.md') return note1;
        if (path === 'note2.md') return note2;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const stats = graph.getStats();
      expect(stats.totalNodes).toBe(2);
      expect(stats.totalEdges).toBe(2);
    });

    it('should resolve wikilinks to graph nodes', async () => {
      const alpha = makeNote('Projects/Alpha.md', 'See [[Beta]]', [
        { target: 'Beta', type: 'wikilink' },
      ]);
      const beta = makeNote('Notes/Beta.md', 'Related to [[Alpha]]', [
        { target: 'Alpha', type: 'wikilink' },
      ]);

      mockVault.listNotes.mockResolvedValue(['Projects/Alpha.md', 'Notes/Beta.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'Projects/Alpha.md') return alpha;
        if (path === 'Notes/Beta.md') return beta;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const alphaNode = graph.getNode('Projects/Alpha.md');
      expect(alphaNode).toBeDefined();
      expect(alphaNode!.outlinks).toContain('Beta');

      const backlinks = graph.getBacklinks('Notes/Beta.md');
      expect(backlinks).toContain('Projects/Alpha.md');
    });
  });

  describe('getBacklinks (fuzzy resolution)', () => {
    it('should find backlinks using fuzzy path resolution', async () => {
      const note1 = makeNote('note1.md', 'Links to [[note2]]', [
        { target: 'note2', type: 'wikilink' },
      ]);
      const note2 = makeNote('note2.md', 'Target note');

      mockVault.listNotes.mockResolvedValue(['note1.md', 'note2.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'note1.md') return note1;
        if (path === 'note2.md') return note2;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const bl1 = graph.getBacklinks('note2.md');
      expect(bl1).toContain('note1.md');

      const bl2 = graph.getBacklinks('note2');
      expect(bl2).toContain('note1.md');
    });
  });

  describe('getConnectedNodes', () => {
    it('should return connected nodes at depth 1', async () => {
      const center = makeNote('center.md', '[[left]] and [[right]]', [
        { target: 'left', type: 'wikilink' },
        { target: 'right', type: 'wikilink' },
      ]);
      const left = makeNote('left.md', 'Left');
      const right = makeNote('right.md', 'Right');

      mockVault.listNotes.mockResolvedValue(['center.md', 'left.md', 'right.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'center.md') return center;
        if (path === 'left.md') return left;
        if (path === 'right.md') return right;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const connected = graph.getConnectedNodes('center.md', 1);
      expect(connected).toHaveLength(2);
    });

    it('should return empty array for unknown paths', async () => {
      mockVault.listNotes.mockResolvedValue([]);
      await graph.buildGraph();

      const connected = graph.getConnectedNodes('nonexistent.md', 1);
      expect(connected).toHaveLength(0);
    });
  });

  describe('findNodesByTag', () => {
    it('should find nodes by tag', async () => {
      const tagged = makeNote('tagged.md', '#research #important', [], ['research', 'important']);
      const other = makeNote('other.md', '#unrelated', [], ['unrelated']);

      mockVault.listNotes.mockResolvedValue(['tagged.md', 'other.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'tagged.md') return tagged;
        if (path === 'other.md') return other;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const results = graph.findNodesByTag('research');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('tagged.md');
    });

    it('should normalize tag with # prefix', async () => {
      const tagged = makeNote('tagged.md', '#myTag', [], ['mytag']);

      mockVault.listNotes.mockResolvedValue(['tagged.md']);
      mockVault.readNote.mockResolvedValue(tagged);

      await graph.buildGraph();

      const results = graph.findNodesByTag('#myTag');
      expect(results).toHaveLength(1);
    });
  });

  describe('incremental updates', () => {
    it('should update a single node without full rebuild', async () => {
      const note1 = makeNote('note1.md', 'Original');
      const note2 = makeNote('note2.md', 'Note 2');

      mockVault.listNotes.mockResolvedValue(['note1.md', 'note2.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'note1.md') return note1;
        if (path === 'note2.md') return note2;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();
      expect(graph.getStats().totalNodes).toBe(2);

      // Update note1 to link to note2
      const updatedNote1 = makeNote('note1.md', 'Now links to [[note2]]', [
        { target: 'note2', type: 'wikilink' },
      ]);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'note1.md') return updatedNote1;
        if (path === 'note2.md') return note2;
        throw new Error(`Not found: ${path}`);
      });

      await graph.updateNode('note1.md');

      const backlinks = graph.getBacklinks('note2.md');
      expect(backlinks).toContain('note1.md');
    });

    it('should handle new node addition', async () => {
      const existing = makeNote('existing.md', 'Existing');

      mockVault.listNotes.mockResolvedValue(['existing.md']);
      mockVault.readNote.mockResolvedValue(existing);

      await graph.buildGraph();

      const newNote = makeNote('new-note.md', 'Links to [[Existing]]', [
        { target: 'Existing', type: 'wikilink' },
      ]);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'existing.md') return existing;
        if (path === 'new-note.md') return newNote;
        throw new Error(`Not found: ${path}`);
      });

      await graph.updateNode('new-note.md');

      expect(graph.getStats().totalNodes).toBe(2);
      const backlinks = graph.getBacklinks('existing.md');
      expect(backlinks).toContain('new-note.md');
    });
  });

  describe('removeNode', () => {
    it('should remove a node and clean up links', async () => {
      const source = makeNote('source.md', '[[target]]', [
        { target: 'target', type: 'wikilink' },
      ]);
      const target = makeNote('target.md', 'Target');

      mockVault.listNotes.mockResolvedValue(['source.md', 'target.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'source.md') return source;
        if (path === 'target.md') return target;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();
      expect(graph.getBacklinks('target.md')).toContain('source.md');

      graph.removeNode('source.md');

      expect(graph.getNode('source.md')).toBeUndefined();
      expect(graph.getBacklinks('target.md')).not.toContain('source.md');
    });
  });

  describe('exportGraph', () => {
    it('should export nodes and edges', async () => {
      const a = makeNote('a.md', '[[B]]', [{ target: 'B', type: 'wikilink' }]);
      const b = makeNote('b.md', '[[A]]', [{ target: 'A', type: 'wikilink' }]);

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const exported = graph.exportGraph();
      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(2);
    });
  });

  describe('findShortestPath', () => {
    it('should find shortest path in a linear chain', async () => {
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', '[[c]]', [{ target: 'c', type: 'wikilink' }]);
      const c = makeNote('c.md', 'End');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md', 'c.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        if (path === 'c.md') return c;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const path = graph.findShortestPath('a.md', 'c.md');
      expect(path).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('should return null for disconnected nodes', async () => {
      const a = makeNote('a.md', 'Island A');
      const b = makeNote('b.md', 'Island B');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const path = graph.findShortestPath('a.md', 'b.md');
      expect(path).toBeNull();
    });

    it('should return single-element path for same node', async () => {
      const a = makeNote('a.md', 'Self');
      mockVault.listNotes.mockResolvedValue(['a.md']);
      mockVault.readNote.mockResolvedValue(a);

      await graph.buildGraph();

      const path = graph.findShortestPath('a.md', 'a.md');
      expect(path).toEqual(['a.md']);
    });

    it('should return null for unknown nodes', async () => {
      mockVault.listNotes.mockResolvedValue([]);
      await graph.buildGraph();

      const path = graph.findShortestPath('x.md', 'y.md');
      expect(path).toBeNull();
    });
  });

  describe('getHubNotes', () => {
    it('should return most-connected notes first', async () => {
      // Star graph: hub links to spoke1, spoke2, spoke3
      const hub = makeNote('hub.md', '[[spoke1]] [[spoke2]] [[spoke3]]', [
        { target: 'spoke1', type: 'wikilink' },
        { target: 'spoke2', type: 'wikilink' },
        { target: 'spoke3', type: 'wikilink' },
      ]);
      const spoke1 = makeNote('spoke1.md', 'Spoke 1');
      const spoke2 = makeNote('spoke2.md', 'Spoke 2');
      const spoke3 = makeNote('spoke3.md', 'Spoke 3');

      mockVault.listNotes.mockResolvedValue(['hub.md', 'spoke1.md', 'spoke2.md', 'spoke3.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'hub.md') return hub;
        if (path === 'spoke1.md') return spoke1;
        if (path === 'spoke2.md') return spoke2;
        if (path === 'spoke3.md') return spoke3;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const hubs = graph.getHubNotes(2);
      expect(hubs).toHaveLength(2);
      expect(hubs[0].node.path).toBe('hub.md');
      expect(hubs[0].degree).toBe(3); // 3 outlinks
    });

    it('should respect limit parameter', async () => {
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', 'B');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const hubs = graph.getHubNotes(1);
      expect(hubs).toHaveLength(1);
    });
  });

  describe('getClusters', () => {
    it('should detect two disconnected clusters', async () => {
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', 'B');
      const c = makeNote('c.md', '[[d]]', [{ target: 'd', type: 'wikilink' }]);
      const d = makeNote('d.md', 'D');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md', 'c.md', 'd.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        if (path === 'c.md') return c;
        if (path === 'd.md') return d;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const clusters = graph.getClusters(2);
      expect(clusters).toHaveLength(2);
      expect(clusters[0]).toHaveLength(2);
      expect(clusters[1]).toHaveLength(2);
    });

    it('should filter clusters smaller than minSize', async () => {
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', 'B');
      const orphan = makeNote('orphan.md', 'Orphan');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md', 'orphan.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        if (path === 'orphan.md') return orphan;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      // minSize=2 should exclude the orphan
      const clusters = graph.getClusters(2);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]).toHaveLength(2);
    });
  });

  describe('findBridgeNotes', () => {
    it('should find bridge in a linear chain', async () => {
      // A -> B -> C: removing B disconnects A from C
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', '[[c]]', [{ target: 'c', type: 'wikilink' }]);
      const c = makeNote('c.md', 'End');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md', 'c.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        if (path === 'c.md') return c;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const bridges = graph.findBridgeNotes();
      const bridgePaths = bridges.map(b => b.path);
      expect(bridgePaths).toContain('b.md');
    });

    it('should find no bridges in a fully connected triangle', async () => {
      const a = makeNote('a.md', '[[b]] [[c]]', [
        { target: 'b', type: 'wikilink' },
        { target: 'c', type: 'wikilink' },
      ]);
      const b = makeNote('b.md', '[[a]] [[c]]', [
        { target: 'a', type: 'wikilink' },
        { target: 'c', type: 'wikilink' },
      ]);
      const c = makeNote('c.md', '[[a]] [[b]]', [
        { target: 'a', type: 'wikilink' },
        { target: 'b', type: 'wikilink' },
      ]);

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md', 'c.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        if (path === 'c.md') return c;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const bridges = graph.findBridgeNotes();
      expect(bridges).toHaveLength(0);
    });
  });

  describe('enhanced getStats', () => {
    it('should include density and component count', async () => {
      const a = makeNote('a.md', '[[b]]', [{ target: 'b', type: 'wikilink' }]);
      const b = makeNote('b.md', 'B');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const stats = graph.getStats();
      expect(stats).toHaveProperty('density');
      expect(stats).toHaveProperty('components');
      expect(stats.density).toBeGreaterThan(0);
      expect(stats.components).toBe(1); // a and b are connected
    });

    it('should report correct component count for disconnected graph', async () => {
      const a = makeNote('a.md', 'Island A');
      const b = makeNote('b.md', 'Island B');

      mockVault.listNotes.mockResolvedValue(['a.md', 'b.md']);
      mockVault.readNote.mockImplementation(async (path: string) => {
        if (path === 'a.md') return a;
        if (path === 'b.md') return b;
        throw new Error(`Not found: ${path}`);
      });

      await graph.buildGraph();

      const stats = graph.getStats();
      expect(stats.components).toBe(2);
      expect(stats.density).toBe(0);
    });
  });
});
