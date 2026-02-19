/**
 * Zod validation schemas for all MCP tool inputs.
 * Exported as raw shapes for McpServer.registerTool() inputSchema.
 */

import { z } from 'zod/v4';

// --- Existing tools ---

export const searchNotesInput = {
  query: z.string().min(1).describe('Search query string'),
  limit: z.number().int().positive().default(10).describe('Maximum number of results'),
};

export const readNoteInput = {
  path: z.string().min(1).describe('Path to the note (relative to vault root)'),
};

export const createNoteInput = {
  path: z.string().min(1).describe('Path for the new note (relative to vault root)'),
  content: z.string().describe('Content of the note'),
};

export const updateNoteInput = {
  path: z.string().min(1).describe('Path to the note (relative to vault root)'),
  content: z.string().describe('New content of the note'),
};

export const deleteNoteInput = {
  path: z.string().min(1).describe('Path to the note (relative to vault root)'),
};

export const getBacklinksInput = {
  path: z.string().min(1).describe('Path to the note (relative to vault root)'),
};

export const getGraphInput = {
  path: z.string().optional().describe('Optional: Get connected nodes for a specific note'),
  depth: z.number().int().positive().default(1).describe('Depth of connections to retrieve'),
};

export const findByTagInput = {
  tag: z.string().min(1).describe('Tag to search for (with or without # prefix)'),
};

// --- Phase 2: Graph algorithm tools ---

export const findShortestPathInput = {
  source: z.string().min(1).describe('Path of the source note'),
  target: z.string().min(1).describe('Path of the target note'),
};

export const getHubNotesInput = {
  limit: z.number().int().positive().default(10).describe('Number of top hub notes to return'),
};

export const getClustersInput = {
  minSize: z.number().int().positive().default(2).describe('Minimum cluster size to include'),
};

// find_bridge_notes has no inputs

// --- Phase 3: Semantic search tools ---

export const semanticSearchInput = {
  query: z.string().min(1).describe('Natural language search query'),
  limit: z.number().int().positive().default(10).describe('Maximum number of results'),
};

export const findSimilarInput = {
  path: z.string().min(1).describe('Path to the reference note'),
  limit: z.number().int().positive().default(10).describe('Maximum number of similar notes'),
};
