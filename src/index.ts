#!/usr/bin/env node

/**
 * Main entry point for the Obsidian MCP Ultra server
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import { Vault } from './vault/vault.js';
import { GraphBuilder } from './graph/builder.js';
import { VaultWatcher } from './polling/watcher.js';
import * as schemas from './schemas.js';

// Get API configuration from environment variables or command line
const apiUrl = process.env.OBSIDIAN_API_URL || 'http://127.0.0.1:27123';
const apiKey = process.env.OBSIDIAN_API_KEY || process.argv[2];
const pollIntervalMs = parseInt(process.env.OBSIDIAN_POLL_INTERVAL || '30000', 10);
const reindexIntervalMs = parseInt(process.env.OBSIDIAN_REINDEX_INTERVAL || '300000', 10);

if (!apiKey) {
  console.error('Error: API key not provided');
  console.error('Usage: obsidian-mcp-ultra <api-key>');
  console.error('Or set OBSIDIAN_API_KEY environment variable');
  console.error('Optionally set OBSIDIAN_API_URL (default: http://127.0.0.1:27123)');
  process.exit(1);
}

// Verify connection to Obsidian REST API
try {
  const healthCheck = await fetch(`${apiUrl}/`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!healthCheck.ok) {
    console.error(`Error: Cannot authenticate with Obsidian REST API (HTTP ${healthCheck.status})`);
    console.error('Check your OBSIDIAN_API_KEY');
    process.exit(1);
  }
  console.error('Connected to Obsidian REST API');
} catch {
  console.error('Error: Cannot connect to Obsidian REST API');
  console.error(`URL: ${apiUrl}`);
  console.error('Ensure Obsidian is running with the Local REST API plugin enabled');
  process.exit(1);
}

// Initialize vault and graph
const vault = new Vault({ apiUrl, apiKey, cacheEnabled: true });
const graph = new GraphBuilder(vault);

// Build initial graph
console.error('Building vault graph...');
await graph.buildGraph();
console.error('Graph built successfully');

// Create MCP server
const server = new McpServer(
  { name: 'obsidian-mcp-ultra', version: '2.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

// ── Tool registrations ──────────────────────────────────────────────────

server.registerTool('search_notes', {
  description: 'Search for notes by content, title, or tags',
  inputSchema: schemas.searchNotesInput,
}, async ({ query, limit }) => {
  const results = await vault.searchNotes(query, limit);
  const notes = await Promise.all(results.map(path => vault.readNote(path)));
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(notes.map(note => ({
        path: note.path,
        title: note.title,
        tags: note.tags,
        excerpt: note.content.substring(0, 200),
      })), null, 2),
    }],
  };
});

server.registerTool('read_note', {
  description: 'Read the full content of a note',
  inputSchema: schemas.readNoteInput,
}, async ({ path }) => {
  const note = await vault.readNote(path);
  return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
});

server.registerTool('create_note', {
  description: 'Create a new note in the vault',
  inputSchema: schemas.createNoteInput,
}, async ({ path, content }) => {
  const note = await vault.createNote(path, content);
  await graph.updateNode(note.path);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, note }, null, 2) }] };
});

server.registerTool('update_note', {
  description: 'Update an existing note',
  inputSchema: schemas.updateNoteInput,
}, async ({ path, content }) => {
  const note = await vault.updateNote(path, content);
  await graph.updateNode(note.path);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, note }, null, 2) }] };
});

server.registerTool('delete_note', {
  description: 'Delete a note from the vault',
  inputSchema: schemas.deleteNoteInput,
}, async ({ path }) => {
  const exists = await vault.noteExists(path);
  if (!exists) throw new Error(`Note not found: ${path}`);
  graph.removeNode(path);
  await vault.deleteNote(path);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: path }, null, 2) }] };
});

server.registerTool('list_notes', {
  description: 'List all notes in the vault',
}, async () => {
  const notes = await vault.listNotes();
  return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
});

server.registerTool('get_backlinks', {
  description: 'Get all notes that link to a specific note',
  inputSchema: schemas.getBacklinksInput,
}, async ({ path }) => {
  const backlinks = graph.getBacklinks(path);
  return { content: [{ type: 'text', text: JSON.stringify(backlinks, null, 2) }] };
});

server.registerTool('get_graph', {
  description: 'Get the complete knowledge graph structure',
  inputSchema: schemas.getGraphInput,
}, async ({ path, depth }) => {
  if (path) {
    const connectedNodes = graph.getConnectedNodes(path, depth);
    return { content: [{ type: 'text', text: JSON.stringify(connectedNodes, null, 2) }] };
  }
  const fullGraph = graph.exportGraph();
  return { content: [{ type: 'text', text: JSON.stringify(fullGraph, null, 2) }] };
});

server.registerTool('find_by_tag', {
  description: 'Find all notes with a specific tag',
  inputSchema: schemas.findByTagInput,
}, async ({ tag }) => {
  const nodes = graph.findNodesByTag(tag);
  return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
});

server.registerTool('get_stats', {
  description: 'Get vault and graph statistics (includes density, component count)',
}, async () => {
  const vaultStats = await vault.getStats();
  const graphStats = graph.getStats();
  return { content: [{ type: 'text', text: JSON.stringify({ vault: vaultStats, graph: graphStats }, null, 2) }] };
});

// ── Phase 2: Graph algorithm tools ──────────────────────────────────────

server.registerTool('find_shortest_path', {
  description: 'Find the shortest path between two notes in the knowledge graph',
  inputSchema: schemas.findShortestPathInput,
}, async ({ source, target }) => {
  const path = graph.findShortestPath(source, target);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(path ? { found: true, path, length: path.length } : { found: false, path: null }, null, 2),
    }],
  };
});

server.registerTool('get_hub_notes', {
  description: 'Get the most-connected notes in the vault (by degree centrality)',
  inputSchema: schemas.getHubNotesInput,
}, async ({ limit }) => {
  const hubs = graph.getHubNotes(limit);
  return { content: [{ type: 'text', text: JSON.stringify(hubs, null, 2) }] };
});

server.registerTool('get_clusters', {
  description: 'Detect connected clusters of notes in the knowledge graph',
  inputSchema: schemas.getClustersInput,
}, async ({ minSize }) => {
  const clusters = graph.getClusters(minSize);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(clusters.map((c, i) => ({
        cluster: i + 1,
        size: c.length,
        notes: c.map(n => ({ path: n.path, title: n.title })),
      })), null, 2),
    }],
  };
});

server.registerTool('find_bridge_notes', {
  description: 'Find notes whose removal would disconnect parts of the knowledge graph',
}, async () => {
  const bridges = graph.findBridgeNotes();
  return { content: [{ type: 'text', text: JSON.stringify(bridges, null, 2) }] };
});

// ── Phase 3: Semantic search tools ──────────────────────────────────────

server.registerTool('semantic_search', {
  description: 'Search notes using TF-IDF semantic similarity. Better than keyword search for finding conceptually related content.',
  inputSchema: schemas.semanticSearchInput,
}, async ({ query, limit }) => {
  const results = graph.semanticSearch(query, limit);
  const notes = await Promise.all(results.map(async r => {
    const note = await vault.readNote(r.path);
    return { path: r.path, title: note.title, score: r.score, excerpt: note.content.substring(0, 200) };
  }));
  return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
});

server.registerTool('find_similar', {
  description: 'Find notes similar to a given note based on content similarity (TF-IDF cosine similarity)',
  inputSchema: schemas.findSimilarInput,
}, async ({ path, limit }) => {
  const results = graph.findSimilar(path, limit);
  const notes = await Promise.all(results.map(async r => {
    const note = await vault.readNote(r.path);
    return { path: r.path, title: note.title, score: r.score, excerpt: note.content.substring(0, 200) };
  }));
  return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
});

// ── Resource registrations ──────────────────────────────────────────────

server.registerResource('All Notes', 'obsidian://vault/all-notes', {
  description: 'List of all notes in the vault',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await vault.listNotes(), null, 2) }],
}));

server.registerResource('Knowledge Graph', 'obsidian://vault/graph', {
  description: 'Complete knowledge graph structure',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(graph.exportGraph(), null, 2) }],
}));

server.registerResource('Vault Statistics', 'obsidian://vault/stats', {
  description: 'Statistics about the vault',
  mimeType: 'application/json',
}, async (uri) => {
  const vaultStats = await vault.getStats();
  const graphStats = graph.getStats();
  return {
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ vault: vaultStats, graph: graphStats }, null, 2) }],
  };
});

server.registerResource('Individual Note', new ResourceTemplate('obsidian://note/{path}', { list: undefined }), {
  description: 'Read a specific note by its path',
  mimeType: 'text/markdown',
}, async (uri, { path }) => {
  const note = await vault.readNote(path as string);
  return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: note.content }] };
});

// ── Prompt registrations ────────────────────────────────────────────────

server.registerPrompt('summarize_note', {
  description: 'Generate a summary of a note with its connections',
  argsSchema: { path: z.string().describe('Path to the note') },
}, async ({ path }) => {
  const note = await vault.readNote(path);
  const backlinks = graph.getBacklinks(path);
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Summarize this note and analyze its connections:\n\nTitle: ${note.title}\nPath: ${note.path}\nTags: ${note.tags.join(', ')}\n\nContent:\n${note.content}\n\nBacklinks: ${backlinks.join(', ')}\nOutlinks: ${note.links.map(l => l.target).join(', ')}`,
      },
    }],
  };
});

server.registerPrompt('find_connections', {
  description: 'Discover connections between notes',
  argsSchema: {
    note1: z.string().describe('First note path'),
    note2: z.string().describe('Second note path'),
  },
}, async ({ note1, note2 }) => {
  const n1 = await vault.readNote(note1);
  const n2 = await vault.readNote(note2);
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Find and explain connections between these two notes:\n\nNote 1: ${n1.title}\nTags: ${n1.tags.join(', ')}\nContent: ${n1.content.substring(0, 500)}...\n\nNote 2: ${n2.title}\nTags: ${n2.tags.join(', ')}\nContent: ${n2.content.substring(0, 500)}...`,
      },
    }],
  };
});

// ── Polling for graph freshness ─────────────────────────────────────────

const watcher = new VaultWatcher(vault, {
  pollIntervalMs,
  onChanges: async (changes) => {
    console.error(`Vault changes detected: +${changes.added.length} -${changes.deleted.length}`);
    for (const addedPath of changes.added) {
      await graph.updateNode(addedPath);
    }
    for (const deletedPath of changes.deleted) {
      graph.removeNode(deletedPath);
    }
  },
});

await watcher.start();

// Periodic full reindex to catch in-place content modifications
setInterval(async () => {
  console.error('Running full graph reindex...');
  vault.clearCache();
  await graph.buildGraph();
  console.error('Reindex complete');
}, reindexIntervalMs);

// ── Start server ────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Obsidian MCP Ultra server running on stdio');
