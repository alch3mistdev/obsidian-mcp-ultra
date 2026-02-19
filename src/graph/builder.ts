/**
 * Graph builder that constructs and maintains the knowledge graph
 */

import type { GraphNode } from '../types.js';
import type { Vault } from '../vault/vault.js';
import { TfIdfIndex } from '../search/tfidf.js';

export class GraphBuilder {
  private vault: Vault;
  private graph: Map<string, GraphNode>;
  private searchIndex: TfIdfIndex;

  constructor(vault: Vault) {
    this.vault = vault;
    this.graph = new Map();
    this.searchIndex = new TfIdfIndex();
  }

  /**
   * Build the complete graph from all notes in the vault
   */
  async buildGraph(): Promise<void> {
    this.graph.clear();
    const notePaths = await this.vault.listNotes();
    const contentMap = new Map<string, string>();

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
      contentMap.set(notePath, note.content);
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

    // Third pass: build search index
    this.searchIndex.buildIndex(contentMap);
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

    // Update search index
    this.searchIndex.updateDocument(notePath, note.content);
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
    this.searchIndex.removeDocument(notePath);
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
   * Find the shortest path between two notes using BFS.
   * Returns the path as an array of note paths, or null if unreachable.
   */
  findShortestPath(sourcePath: string, targetPath: string): string[] | null {
    const sourceNode = this.resolveNode(sourcePath);
    const targetNode = this.resolveNode(targetPath);
    if (!sourceNode || !targetNode) return null;
    if (sourceNode.path === targetNode.path) return [sourceNode.path];

    const queue: string[][] = [[sourceNode.path]];
    const visited = new Set<string>([sourceNode.path]);

    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const current = this.graph.get(currentPath[currentPath.length - 1])!;

      const neighbors: string[] = [];
      for (const outlink of current.outlinks) {
        const resolved = this.resolveNode(outlink);
        if (resolved) neighbors.push(resolved.path);
      }
      for (const inlink of current.inlinks) {
        neighbors.push(inlink);
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const newPath = [...currentPath, neighbor];
        if (neighbor === targetNode.path) return newPath;
        visited.add(neighbor);
        queue.push(newPath);
      }
    }

    return null;
  }

  /**
   * Get the most-connected notes sorted by degree centrality.
   */
  getHubNotes(limit = 10): Array<{ node: GraphNode; degree: number }> {
    return Array.from(this.graph.values())
      .map(node => ({ node, degree: node.inlinks.length + node.outlinks.length }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  /**
   * Detect connected clusters (components) in the graph via BFS.
   * Treats the graph as undirected (follows both outlinks and inlinks).
   */
  getClusters(minSize = 2): GraphNode[][] {
    const visited = new Set<string>();
    const clusters: GraphNode[][] = [];

    for (const [path] of this.graph) {
      if (visited.has(path)) continue;

      const component: GraphNode[] = [];
      const queue = [path];
      visited.add(path);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const node = this.graph.get(current)!;
        component.push(node);

        const neighbors: string[] = [];
        for (const outlink of node.outlinks) {
          const resolved = this.resolveNode(outlink);
          if (resolved) neighbors.push(resolved.path);
        }
        for (const inlink of node.inlinks) {
          neighbors.push(inlink);
        }

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (component.length >= minSize) {
        clusters.push(component);
      }
    }

    return clusters;
  }

  /**
   * Find bridge notes whose removal increases the number of connected components.
   */
  findBridgeNotes(): GraphNode[] {
    const baselineCount = this.countComponents();
    const bridges: GraphNode[] = [];

    for (const [removePath, removeNode] of this.graph) {
      const count = this.countComponentsWithout(removePath);
      if (count > baselineCount) {
        bridges.push(removeNode);
      }
    }

    return bridges;
  }

  /**
   * Get graph statistics
   */
  getStats() {
    const nodes = Array.from(this.graph.values());
    const totalNodes = nodes.length;
    const totalEdges = nodes.reduce((sum, node) => sum + node.outlinks.length, 0);
    const maxPossibleEdges = totalNodes * (totalNodes - 1);
    const density = maxPossibleEdges > 0 ? totalEdges / maxPossibleEdges : 0;

    return {
      totalNodes,
      totalEdges,
      orphanedNodes: this.findOrphanedNodes().length,
      averageConnections: totalNodes > 0
        ? nodes.reduce((sum, node) => sum + node.inlinks.length + node.outlinks.length, 0) / totalNodes
        : 0,
      density,
      components: this.countComponents(),
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
   * Search notes using TF-IDF semantic similarity.
   */
  semanticSearch(query: string, limit: number): Array<{ path: string; score: number }> {
    return this.searchIndex.search(query, limit);
  }

  /**
   * Find notes similar to a given note using TF-IDF cosine similarity.
   */
  findSimilar(notePath: string, limit: number): Array<{ path: string; score: number }> {
    const node = this.resolveNode(notePath);
    if (!node) return [];
    return this.searchIndex.findSimilar(node.path, limit);
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

  /**
   * Count connected components in the graph (treating edges as undirected).
   */
  private countComponents(): number {
    const visited = new Set<string>();
    let count = 0;

    for (const [path] of this.graph) {
      if (visited.has(path)) continue;
      count++;
      this.bfsVisit(path, visited);
    }

    return count;
  }

  /**
   * Count connected components excluding a specific node.
   */
  private countComponentsWithout(excludePath: string): number {
    const visited = new Set<string>([excludePath]);
    let count = 0;

    for (const [path] of this.graph) {
      if (visited.has(path)) continue;
      count++;
      this.bfsVisit(path, visited, excludePath);
    }

    return count;
  }

  /**
   * BFS visit all nodes reachable from `start`, optionally excluding a node.
   */
  private bfsVisit(start: string, visited: Set<string>, excludePath?: string): void {
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this.graph.get(current)!;

      const neighbors: string[] = [];
      for (const outlink of node.outlinks) {
        const resolved = this.resolveNode(outlink);
        if (resolved) neighbors.push(resolved.path);
      }
      for (const inlink of node.inlinks) {
        neighbors.push(inlink);
      }

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor) && neighbor !== excludePath) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
}
