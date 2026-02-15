/**
 * Graph builder that constructs and maintains the knowledge graph
 */

import type { GraphNode, Note } from '../types.js';
import type { Vault } from '../vault/vault.js';

export class GraphBuilder {
  private vault: Vault;
  private graph: Map<string, GraphNode>;

  constructor(vault: Vault) {
    this.vault = vault;
    this.graph = new Map();
  }

  /**
   * Build the complete graph from all notes in the vault
   */
  async buildGraph(): Promise<void> {
    this.graph.clear();
    const notePaths = await this.vault.listNotes();

    // First pass: create nodes
    for (const notePath of notePaths) {
      const note = await this.vault.readNote(notePath);
      this.graph.set(notePath, {
        path: notePath,
        title: note.title,
        tags: note.tags,
        outlinks: note.links.map(link => link.target),
        inlinks: [],
      });
    }

    // Second pass: populate backlinks (inlinks)
    for (const [path, node] of this.graph.entries()) {
      for (const outlink of node.outlinks) {
        const targetNode = this.resolveNode(outlink);
        if (targetNode) {
          targetNode.inlinks.push(path);
        }
      }
    }
  }

  /**
   * Incrementally add or update a single node in the graph.
   * Much cheaper than a full rebuild for single-note mutations.
   */
  async updateNode(notePath: string): Promise<void> {
    // Remove old inlinks contributed by this node
    const oldNode = this.graph.get(notePath);
    if (oldNode) {
      for (const outlink of oldNode.outlinks) {
        const target = this.resolveNode(outlink);
        if (target) {
          target.inlinks = target.inlinks.filter(l => l !== notePath);
        }
      }
    }

    // Re-read and rebuild this node
    const note = await this.vault.readNote(notePath);
    this.graph.set(notePath, {
      path: notePath,
      title: note.title,
      tags: note.tags,
      outlinks: note.links.map(link => link.target),
      inlinks: [],
    });

    // Re-populate inlinks for this node from all other nodes
    for (const [path, node] of this.graph.entries()) {
      if (path === notePath) continue;
      for (const outlink of node.outlinks) {
        const target = this.resolveNode(outlink);
        if (target && target.path === notePath) {
          this.graph.get(notePath)!.inlinks.push(path);
        }
      }
    }

    // Re-populate inlinks that this node contributes to others
    const newNode = this.graph.get(notePath)!;
    for (const outlink of newNode.outlinks) {
      const target = this.resolveNode(outlink);
      if (target && target.path !== notePath) {
        target.inlinks.push(notePath);
      }
    }
  }

  /**
   * Remove a node from the graph and clean up its links.
   */
  removeNode(notePath: string): void {
    const node = this.graph.get(notePath);
    if (!node) return;

    // Remove inlinks this node contributes to other nodes
    for (const outlink of node.outlinks) {
      const target = this.resolveNode(outlink);
      if (target) {
        target.inlinks = target.inlinks.filter(l => l !== notePath);
      }
    }

    // Remove this node from inlinks of nodes that linked to it
    for (const inlink of node.inlinks) {
      // No need to update outlinks since those are raw link targets, not resolved paths
    }

    this.graph.delete(notePath);
  }

  /**
   * Get a node from the graph (uses fuzzy resolution)
   */
  getNode(notePath: string): GraphNode | undefined {
    return this.resolveNode(notePath);
  }

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.graph.values());
  }

  /**
   * Get nodes connected to a given node
   */
  getConnectedNodes(notePath: string, depth = 1): GraphNode[] {
    const startNode = this.resolveNode(notePath);
    if (!startNode) return [];

    const visited = new Set<string>();
    const result: GraphNode[] = [];

    const traverse = (path: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(path)) return;

      visited.add(path);
      const node = this.graph.get(path);

      if (node && currentDepth > 0) {
        result.push(node);
      }

      if (node && currentDepth < depth) {
        // Traverse outlinks
        for (const outlink of node.outlinks) {
          const targetNode = this.resolveNode(outlink);
          if (targetNode) {
            traverse(targetNode.path, currentDepth + 1);
          }
        }

        // Traverse inlinks
        for (const inlink of node.inlinks) {
          traverse(inlink, currentDepth + 1);
        }
      }
    };

    traverse(startNode.path, 0);
    return result;
  }

  /**
   * Get backlinks for a note (uses fuzzy resolution)
   */
  getBacklinks(notePath: string): string[] {
    const node = this.resolveNode(notePath);
    return node?.inlinks || [];
  }

  /**
   * Find nodes by tag
   */
  findNodesByTag(tag: string): GraphNode[] {
    const normalizedTag = tag.toLowerCase().replace(/^#/, '');
    return Array.from(this.graph.values()).filter(node =>
      node.tags.some(t => t === normalizedTag)
    );
  }

  /**
   * Find orphaned notes (no inlinks or outlinks)
   */
  findOrphanedNodes(): GraphNode[] {
    return Array.from(this.graph.values()).filter(
      node => node.inlinks.length === 0 && node.outlinks.length === 0
    );
  }

  /**
   * Get graph statistics
   */
  getStats() {
    const nodes = Array.from(this.graph.values());
    return {
      totalNodes: nodes.length,
      totalEdges: nodes.reduce((sum, node) => sum + node.outlinks.length, 0),
      orphanedNodes: this.findOrphanedNodes().length,
      averageConnections: nodes.length > 0
        ? nodes.reduce((sum, node) => sum + node.inlinks.length + node.outlinks.length, 0) / nodes.length
        : 0,
    };
  }

  /**
   * Export graph as JSON
   */
  exportGraph(): { nodes: GraphNode[]; edges: Array<{ source: string; target: string }> } {
    const nodes = this.getAllNodes();
    const edges: Array<{ source: string; target: string }> = [];

    for (const node of nodes) {
      for (const outlink of node.outlinks) {
        const target = this.resolveNode(outlink);
        if (target) {
          edges.push({ source: node.path, target: target.path });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Resolve a node by various identifiers: exact path, path with .md,
   * filename match, or title match. Mimics Obsidian's link resolution.
   */
  resolveNode(identifier: string): GraphNode | undefined {
    // Try exact path match
    let node = this.graph.get(identifier);
    if (node) return node;

    // Try with .md extension
    node = this.graph.get(`${identifier}.md`);
    if (node) return node;

    // Try matching just the filename (for wikilinks without folder paths)
    const identifierLower = identifier.toLowerCase();
    for (const [path, n] of this.graph.entries()) {
      const filename = path.replace(/\.md$/, '').split('/').pop()?.toLowerCase();
      if (filename === identifierLower) return n;
    }

    // Try to find by title
    for (const [, n] of this.graph.entries()) {
      if (n.title.toLowerCase() === identifierLower) return n;
    }

    return undefined;
  }
}
