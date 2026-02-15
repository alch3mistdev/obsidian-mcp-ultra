#!/usr/bin/env node

/**
 * Simple test script to verify the MCP server works with the sample vault
 */

import { Vault } from '../src/vault/vault.js';
import { GraphBuilder } from '../src/graph/builder.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const vaultPath = join(__dirname, 'sample-vault');

console.log('Testing obsidian-mcp-ultra with sample vault...\n');

// Initialize vault
const vault = new Vault({ path: vaultPath, cacheEnabled: true });

try {
  // Test 1: List notes
  console.log('📝 Test 1: List all notes');
  const notes = await vault.listNotes();
  console.log(`Found ${notes.length} notes:`);
  notes.forEach(note => console.log(`  - ${note}`));
  console.log('✓ Test 1 passed\n');

  // Test 2: Read a note
  console.log('📖 Test 2: Read a specific note');
  const note = await vault.readNote('index.md');
  console.log(`Title: ${note.title}`);
  console.log(`Tags: ${note.tags.join(', ')}`);
  console.log(`Links: ${note.links.length} found`);
  console.log(`Headings: ${note.headings.length} found`);
  console.log('✓ Test 2 passed\n');

  // Test 3: Search notes
  console.log('🔍 Test 3: Search for "Project Alpha"');
  const results = await vault.searchNotes('Project Alpha', 5);
  console.log(`Found ${results.length} results:`);
  results.forEach(r => console.log(`  - ${r}`));
  console.log('✓ Test 3 passed\n');

  // Test 4: Build graph
  console.log('🕸️  Test 4: Build knowledge graph');
  const graph = new GraphBuilder(vault);
  await graph.buildGraph();
  const stats = graph.getStats();
  console.log(`Total nodes: ${stats.totalNodes}`);
  console.log(`Total edges: ${stats.totalEdges}`);
  console.log(`Orphaned nodes: ${stats.orphanedNodes}`);
  console.log(`Average connections: ${stats.averageConnections.toFixed(2)}`);
  console.log('✓ Test 4 passed\n');

  // Test 5: Get backlinks
  console.log('🔗 Test 5: Get backlinks for "Knowledge Management.md"');
  const backlinks = graph.getBacklinks('Knowledge Management.md');
  console.log(`Found ${backlinks.length} backlinks:`);
  backlinks.forEach(link => console.log(`  - ${link}`));
  console.log('✓ Test 5 passed\n');

  // Test 6: Find by tag
  console.log('🏷️  Test 6: Find notes by tag "research"');
  const tagged = graph.findNodesByTag('research');
  console.log(`Found ${tagged.length} notes with tag "research":`);
  tagged.forEach(node => console.log(`  - ${node.path}`));
  console.log('✓ Test 6 passed\n');

  // Test 7: Get vault stats
  console.log('📊 Test 7: Get vault statistics');
  const vaultStats = await vault.getStats();
  console.log(`Total notes: ${vaultStats.totalNotes}`);
  console.log(`Total links: ${vaultStats.totalLinks}`);
  console.log(`Total tags: ${vaultStats.totalTags}`);
  console.log(`Orphaned notes: ${vaultStats.orphanedNotes}`);
  console.log('✓ Test 7 passed\n');

  console.log('✅ All tests passed!');
  console.log('\nThe MCP server is ready to use with your Obsidian vault.');

} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
