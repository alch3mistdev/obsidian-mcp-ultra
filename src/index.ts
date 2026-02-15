#!/usr/bin/env node

/**
 * Main entry point for the Obsidian MCP Ultra server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Vault } from './vault/vault.js';
import { GraphBuilder } from './graph/builder.js';

// Get vault path from environment variable or command line argument
const vaultPath = process.env.OBSIDIAN_VAULT_PATH || process.argv[2];

if (!vaultPath) {
  console.error('Error: Vault path not provided');
  console.error('Usage: obsidian-mcp-ultra <vault-path>');
  console.error('Or set OBSIDIAN_VAULT_PATH environment variable');
  process.exit(1);
}

// Initialize vault and graph
const vault = new Vault({ path: vaultPath, cacheEnabled: true });
const graph = new GraphBuilder(vault);

// Build initial graph
console.error('Building vault graph...');
await graph.buildGraph();
console.error('Graph built successfully');

// Create MCP server
const server = new Server(
  {
    name: 'obsidian-mcp-ultra',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_notes',
      description: 'Search for notes by content, title, or tags',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10)',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_note',
      description: 'Read the full content of a note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault root)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'create_note',
      description: 'Create a new note in the vault',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path for the new note (relative to vault root)',
          },
          content: {
            type: 'string',
            description: 'Content of the note',
          },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'update_note',
      description: 'Update an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault root)',
          },
          content: {
            type: 'string',
            description: 'New content of the note',
          },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_notes',
      description: 'List all notes in the vault',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_backlinks',
      description: 'Get all notes that link to a specific note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note (relative to vault root)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'get_graph',
      description: 'Get the complete knowledge graph structure',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional: Get connected nodes for a specific note',
          },
          depth: {
            type: 'number',
            description: 'Depth of connections to retrieve (default: 1)',
            default: 1,
          },
        },
      },
    },
    {
      name: 'find_by_tag',
      description: 'Find all notes with a specific tag',
      inputSchema: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Tag to search for (with or without # prefix)',
          },
        },
        required: ['tag'],
      },
    },
    {
      name: 'get_stats',
      description: 'Get vault statistics',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_notes': {
        const { query, limit = 10 } = args as { query: string; limit?: number };
        const results = await vault.searchNotes(query, limit);
        const notes = await Promise.all(results.map(path => vault.readNote(path)));
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                notes.map(note => ({
                  path: note.path,
                  title: note.title,
                  tags: note.tags,
                  excerpt: note.content.substring(0, 200),
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'read_note': {
        const { path } = args as { path: string };
        const note = await vault.readNote(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(note, null, 2),
            },
          ],
        };
      }

      case 'create_note': {
        const { path, content } = args as { path: string; content: string };
        const note = await vault.createNote(path, content);
        await graph.buildGraph(); // Rebuild graph
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, note }, null, 2),
            },
          ],
        };
      }

      case 'update_note': {
        const { path, content } = args as { path: string; content: string };
        const note = await vault.updateNote(path, content);
        await graph.buildGraph(); // Rebuild graph
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, note }, null, 2),
            },
          ],
        };
      }

      case 'list_notes': {
        const notes = await vault.listNotes();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(notes, null, 2),
            },
          ],
        };
      }

      case 'get_backlinks': {
        const { path } = args as { path: string };
        const backlinks = graph.getBacklinks(path);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(backlinks, null, 2),
            },
          ],
        };
      }

      case 'get_graph': {
        const { path, depth = 1 } = args as { path?: string; depth?: number };
        
        if (path) {
          const connectedNodes = graph.getConnectedNodes(path, depth);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(connectedNodes, null, 2),
              },
            ],
          };
        } else {
          const fullGraph = graph.exportGraph();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(fullGraph, null, 2),
              },
            ],
          };
        }
      }

      case 'find_by_tag': {
        const { tag } = args as { tag: string };
        const nodes = graph.findNodesByTag(tag);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(nodes, null, 2),
            },
          ],
        };
      }

      case 'get_stats': {
        const vaultStats = await vault.getStats();
        const graphStats = graph.getStats();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ vault: vaultStats, graph: graphStats }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: (error as Error).message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'obsidian://vault/all-notes',
      name: 'All Notes',
      description: 'List of all notes in the vault',
      mimeType: 'application/json',
    },
    {
      uri: 'obsidian://vault/graph',
      name: 'Knowledge Graph',
      description: 'Complete knowledge graph structure',
      mimeType: 'application/json',
    },
    {
      uri: 'obsidian://vault/stats',
      name: 'Vault Statistics',
      description: 'Statistics about the vault',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  try {
    if (uri === 'obsidian://vault/all-notes') {
      const notes = await vault.listNotes();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(notes, null, 2),
          },
        ],
      };
    } else if (uri === 'obsidian://vault/graph') {
      const fullGraph = graph.exportGraph();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(fullGraph, null, 2),
          },
        ],
      };
    } else if (uri === 'obsidian://vault/stats') {
      const vaultStats = await vault.getStats();
      const graphStats = graph.getStats();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ vault: vaultStats, graph: graphStats }, null, 2),
          },
        ],
      };
    } else if (uri.startsWith('obsidian://note/')) {
      const path = uri.replace('obsidian://note/', '');
      const note = await vault.readNote(path);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: note.content,
          },
        ],
      };
    } else {
      throw new Error(`Unknown resource URI: ${uri}`);
    }
  } catch (error) {
    throw new Error(`Failed to read resource: ${(error as Error).message}`);
  }
});

// Prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'summarize_note',
      description: 'Generate a summary of a note with its connections',
      arguments: [
        {
          name: 'path',
          description: 'Path to the note',
          required: true,
        },
      ],
    },
    {
      name: 'find_connections',
      description: 'Discover connections between notes',
      arguments: [
        {
          name: 'note1',
          description: 'First note path',
          required: true,
        },
        {
          name: 'note2',
          description: 'Second note path',
          required: true,
        },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'summarize_note': {
        const { path } = args as { path: string };
        const note = await vault.readNote(path);
        const backlinks = graph.getBacklinks(path);
        
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Summarize this note and analyze its connections:\n\nTitle: ${note.title}\nPath: ${note.path}\nTags: ${note.tags.join(', ')}\n\nContent:\n${note.content}\n\nBacklinks: ${backlinks.join(', ')}\nOutlinks: ${note.links.map(l => l.target).join(', ')}`,
              },
            },
          ],
        };
      }

      case 'find_connections': {
        const { note1, note2 } = args as { note1: string; note2: string };
        const n1 = await vault.readNote(note1);
        const n2 = await vault.readNote(note2);
        
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Find and explain connections between these two notes:\n\nNote 1: ${n1.title}\nTags: ${n1.tags.join(', ')}\nContent: ${n1.content.substring(0, 500)}...\n\nNote 2: ${n2.title}\nTags: ${n2.tags.join(', ')}\nContent: ${n2.content.substring(0, 500)}...`,
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  } catch (error) {
    throw new Error(`Failed to get prompt: ${(error as Error).message}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Obsidian MCP Ultra server running on stdio');
