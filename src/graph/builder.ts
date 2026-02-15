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
        outlinks: note.links.map(link => this.normalizeLink(link.target)),
        inlinks: [],
      });
    }

    // Second pass: populate backlinks
    for (const [path, node] of this.graph.entries()) {
      for (const outlink of node.outlinks) {
        const targetNode = this.findNode(outlink);
        if (targetNode) {
          targetNode.inlinks.push(path);
        }
      }
    }
  }

  /**
   * Get a node from the graph
   */
  getNode(notePath: string): GraphNode | undefined {
    return this.graph.get(notePath);
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
          const targetNode = this.findNode(outlink);
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

    traverse(notePath, 0);
    return result;
  }

  /**
   * Get backlinks for a note
   */
  getBacklinks(notePath: string): string[] {
    const node = this.graph.get(notePath);
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
        const target = this.findNode(outlink);
        if (target) {
          edges.push({ source: node.path, target: target.path });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Find a node by various identifiers (path, title, or link reference)
   */
  private findNode(identifier: string): GraphNode | undefined {
    // Try exact path match
    let node = this.graph.get(identifier);
    if (node) return node;

    // Try with .md extension
    node = this.graph.get(`${identifier}.md`);
    if (node) return node;

    // Try to find by title
    for (const [_, n] of this.graph.entries()) {
      if (n.title === identifier) return n;
    }

    return undefined;
  }

  /**
   * Normalize a link reference to a path
   */
  private normalizeLink(link: string): string {
    // Remove .md extension if present
    return link.replace(/\.md$/, '');
  }
}
