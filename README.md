# obsidian-mcp-ultra

A high-performance MCP (Model Context Protocol) server that exposes Obsidian vaults as structured, queryable knowledge graphs for AI agents. Uses the [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin to communicate with Obsidian, ensuring full compatibility with plugins, sync, and live editing.

## Prerequisites

1. [Obsidian](https://obsidian.md/) installed and running
2. [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin installed and enabled in Obsidian
3. Copy your API key from Obsidian Settings > Local REST API

## Features

- 🔍 **Semantic Parsing**: Extracts atomic semantic units (links, backlinks, tags, headings) from Markdown
- 🕸️ **Knowledge Graph**: Builds and maintains a graph representation of your vault
- ⚡ **Low-Latency**: In-memory caching for fast retrieval
- 🔐 **Safe Edits**: Bidirectional read/write operations via Obsidian's API
- 🎯 **Context Injection**: Scoped context for agentic workflows
- 📊 **Rich Queries**: Search by content, tags, and graph structure
- 🔌 **Plugin-Aware**: Works through Obsidian, respecting plugins, sync, and metadata

## Installation

```bash
npm install obsidian-mcp-ultra
```

## Usage

### As a Standalone Server

```bash
# Run with API key
OBSIDIAN_API_KEY=your-api-key obsidian-mcp-ultra

# Or pass API key as argument
obsidian-mcp-ultra your-api-key

# Custom API URL (default: http://127.0.0.1:27123)
OBSIDIAN_API_URL=http://localhost:27123 OBSIDIAN_API_KEY=your-api-key obsidian-mcp-ultra
```

### As an MCP Server (Claude Desktop)

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "obsidian-mcp-ultra": {
      "command": "node",
      "args": [
        "/path/to/obsidian-mcp-ultra/dist/index.js"
      ],
      "env": {
        "OBSIDIAN_API_URL": "http://127.0.0.1:27123",
        "OBSIDIAN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

### `search_notes`
Search for notes by content, title, or tags.

**Parameters:**
- `query` (string): Search query
- `limit` (number, optional): Maximum results (default: 10)

### `read_note`
Read the full content and metadata of a note.

**Parameters:**
- `path` (string): Path to the note (relative to vault root)

### `create_note`
Create a new note in the vault.

**Parameters:**
- `path` (string): Path for the new note
- `content` (string): Content of the note

### `update_note`
Update an existing note.

**Parameters:**
- `path` (string): Path to the note
- `content` (string): New content

### `list_notes`
List all notes in the vault.

### `get_backlinks`
Get all notes that link to a specific note.

**Parameters:**
- `path` (string): Path to the note

### `get_graph`
Get the knowledge graph structure.

**Parameters:**
- `path` (string, optional): Get connected nodes for a specific note
- `depth` (number, optional): Depth of connections (default: 1)

### `find_by_tag`
Find all notes with a specific tag.

**Parameters:**
- `tag` (string): Tag to search for

### `get_stats`
Get vault statistics (total notes, links, tags, etc.)

## Available Resources

### `obsidian://vault/all-notes`
List of all notes in the vault (JSON)

### `obsidian://vault/graph`
Complete knowledge graph structure (JSON)

### `obsidian://vault/stats`
Vault statistics (JSON)

### `obsidian://note/{path}`
Individual note content (Markdown)

## Available Prompts

### `summarize_note`
Generate a summary of a note with its connections.

**Arguments:**
- `path` (string): Path to the note

### `find_connections`
Discover connections between notes.

**Arguments:**
- `note1` (string): First note path
- `note2` (string): Second note path

## Architecture

```
obsidian-mcp-ultra
├── Parser Layer
│   └── Extracts frontmatter, links, tags, headings
├── Vault Interface
│   └── Obsidian REST API client with caching
├── Graph Builder
│   └── Constructs and queries knowledge graph
└── MCP Server
    ├── Tools (actions)
    ├── Resources (data access)
    └── Prompts (templates)
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode (requires Obsidian + Local REST API plugin)
OBSIDIAN_API_KEY=your-key npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run lint
```

## Example Vault Structure

```
my-vault/
├── daily/
│   ├── 2024-01-01.md
│   └── 2024-01-02.md
├── projects/
│   ├── project-a.md
│   └── project-b.md
└── index.md
```

## Markdown Features Supported

- **Wikilinks**: `[[Note Name]]` or `[[Note Name|Display Text]]`
- **Markdown Links**: `[Display Text](path/to/note.md)`
- **Tags**: `#tag` or `#nested/tag`
- **Frontmatter**: YAML metadata at the top of files
- **Headings**: `# H1` through `###### H6`

## Performance

- **Caching**: Parsed notes are cached in memory
- **Incremental Updates**: Only modified notes are re-parsed
- **Lazy Loading**: Notes are parsed on-demand
- **Graph Index**: Pre-built graph structure for fast queries

## Security

- **API Key Authentication**: All requests authenticated via Bearer token
- **No Direct Filesystem Access**: All operations go through Obsidian's REST API
- **No Code Execution**: No dynamic code execution or eval
- **Read-Only by Default**: Write operations require explicit tool calls

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Obsidian](https://obsidian.md/)


## Verification

### Quick Verification Test

After installation, verify the server works:

```bash
# Build the project
npm run build

# Run tests
npm test

# Test with a live Obsidian vault (requires Local REST API plugin)
OBSIDIAN_API_KEY=your-key npx tsx examples/test-vault.ts
```

All tests should pass and the vault should be queried successfully.

### MCP Server Test

Test the MCP server directly:

```bash
# Start the server
OBSIDIAN_API_KEY=your-key node dist/index.js
```

The server should output:
```
Connected to Obsidian REST API
Building vault graph...
Graph built successfully
Obsidian MCP Ultra server running on stdio
```

Press Ctrl+C to stop the server.

## Troubleshooting

### Common Issues

**Issue:** `Cannot connect to Obsidian REST API`
**Solution:** Ensure Obsidian is running with the Local REST API plugin enabled

**Issue:** `Cannot authenticate with Obsidian REST API (HTTP 401)`
**Solution:** Check your `OBSIDIAN_API_KEY` matches the key in Obsidian Settings > Local REST API

**Issue:** `Cannot find module '@modelcontextprotocol/sdk'`
**Solution:** Run `npm install` to install dependencies

**Issue:** TypeScript compilation errors
**Solution:** Run `npm run build` to compile TypeScript

**Issue:** Tests failing
**Solution:** Clear the build cache with `rm -rf dist && npm run build`

## Version History

### v1.0.0 (2024-02-15)
- Initial release
- Full MCP protocol support
- 9 tools, 4 resources, 2 prompts
- Knowledge graph implementation
- Caching and performance optimization
- Comprehensive test suite
- Complete documentation

