#!/usr/bin/env node

/**
 * Simple test script to verify the MCP server works with a live Obsidian vault
 * via the Local REST API plugin.
 *
 * Prerequisites:
 *   1. Obsidian must be running
 *   2. The Local REST API plugin must be installed and enabled
 *   3. Set OBSIDIAN_API_KEY env var (or pass as first CLI arg)
 *   4. Optionally set OBSIDIAN_API_URL (default: http://127.0.0.1:27123)
 */

import { Vault } from '../src/vault/vault.js';
import { GraphBuilder } from '../src/graph/builder.js';

const apiUrl = process.env.OBSIDIAN_API_URL || 'http://127.0.0.1:27123';
const apiKey = process.env.OBSIDIAN_API_KEY || process.argv[2];

if (!apiKey) {
  console.error('Usage: npx tsx examples/test-vault.ts <api-key>');
  console.error('Or set OBSIDIAN_API_KEY environment variable');
  process.exit(1);
}

console.log(`Testing obsidian-mcp-ultra against ${apiUrl}...\n`);

const vault = new Vault({ apiUrl, apiKey, cacheEnabled: true });

try {
  // Test 1: List notes
  console.log('Test 1: List all notes');
  const notes = await vault.listNotes();
  console.log(`Found ${notes.length} notes:`);
  notes.slice(0, 10).forEach(note => console.log(`  - ${note}`));
  if (notes.length > 10) console.log(`  ... and ${notes.length - 10} more`);
  console.log('PASS\n');

  // Test 2: Read a note
  if (notes.length > 0) {
    console.log('Test 2: Read a specific note');
    const note = await vault.readNote(notes[0]);
    console.log(`Title: ${note.title}`);
    console.log(`Tags: ${note.tags.join(', ') || '(none)'}`);
    console.log(`Links: ${note.links.length} found`);
    console.log(`Headings: ${note.headings.length} found`);
    console.log('PASS\n');
  }

  // Test 3: Search notes
  console.log('Test 3: Search notes');
  const results = await vault.searchNotes('test', 5);
  console.log(`Found ${results.length} results:`);
  results.forEach(r => console.log(`  - ${r}`));
  console.log('PASS\n');

  // Test 4: Build graph
  console.log('Test 4: Build knowledge graph');
  const graph = new GraphBuilder(vault);
  await graph.buildGraph();
  const stats = graph.getStats();
  console.log(`Total nodes: ${stats.totalNodes}`);
  console.log(`Total edges: ${stats.totalEdges}`);
  console.log(`Orphaned nodes: ${stats.orphanedNodes}`);
  console.log(`Average connections: ${stats.averageConnections.toFixed(2)}`);
  console.log('PASS\n');

  // Test 5: Get vault stats
  console.log('Test 5: Get vault statistics');
  const vaultStats = await vault.getStats();
  console.log(`Total notes: ${vaultStats.totalNotes}`);
  console.log(`Total links: ${vaultStats.totalLinks}`);
  console.log(`Total tags: ${vaultStats.totalTags}`);
  console.log(`Orphaned notes: ${vaultStats.orphanedNotes}`);
  console.log('PASS\n');

  console.log('All tests passed!\nThe MCP server is ready to use with your Obsidian vault.');
} catch (error) {
  console.error('Test failed:', error);
  process.exit(1);
}
