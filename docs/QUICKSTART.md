# Quick Start Guide

Get up and running with obsidian-mcp-ultra in minutes!

## Prerequisites

- Node.js 18 or later
- An Obsidian vault (or create a test vault)
- Claude Desktop (optional, for MCP integration)

## Installation

### Option 1: From Source (Recommended for now)

```bash
# Clone the repository
git clone https://github.com/alch3mistdev/obsidian-mcp-ultra.git
cd obsidian-mcp-ultra

# Install dependencies
npm install

# Build the project
npm run build
```

### Option 2: From npm (Coming Soon)

```bash
npm install -g obsidian-mcp-ultra
```

## Quick Test

Test the server with the included sample vault:

```bash
# Run the test script
npx tsx examples/test-vault.ts
```

You should see output showing successful vault operations.

## Usage

### Standalone Mode

Run the server directly with your vault:

```bash
node dist/index.js /path/to/your/vault
```

The server will:
1. Build a graph of your vault
2. Start listening on stdio for MCP requests

### Claude Desktop Integration

1. Locate your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the server configuration:

```json
{
  "mcpServers": {
    "obsidian-mcp-ultra": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-mcp-ultra/dist/index.js",
        "/absolute/path/to/your/vault"
      ]
    }
  }
}
```

3. Restart Claude Desktop

4. You should now see "obsidian-mcp-ultra" in the MCP tools list

## First Commands

Try these commands in Claude:

### Search Your Vault

```
Search my vault for notes about "project management"
```

### Read a Note

```
Read the note at "Projects/Project Alpha.md"
```

### Get Vault Statistics

```
Show me statistics about my vault
```

### Find Connected Notes

```
What notes are connected to my index note?
```

### Create a New Note

```
Create a new note at "Daily/2024-01-15.md" with today's date and a todo list
```

## Example Workflows

### 1. Daily Note Creation

Ask Claude:
```
Create a daily note for today with:
- Date header
- Quick capture section
- Task list
- Notes section
```

### 2. Knowledge Graph Exploration

Ask Claude:
```
Show me all notes tagged with #research and their connections
```

### 3. Note Summarization

Ask Claude:
```
Summarize my "Project Alpha" note and show what other notes reference it
```

### 4. Finding Orphaned Notes

Ask Claude:
```
Find notes in my vault that have no links to or from other notes
```

## Troubleshooting

### Server Not Starting

**Issue:** Error about vault path

**Solution:** Make sure you provide the full absolute path to your vault

```bash
# Wrong
node dist/index.js ~/vault

# Right
node dist/index.js /Users/username/Documents/vault
```

### No Tools Showing in Claude

**Issue:** Server not appearing in Claude Desktop

**Solution:**
1. Check config file path is correct
2. Restart Claude Desktop completely
3. Check Claude Desktop logs for errors

### Permission Errors

**Issue:** Cannot read/write files

**Solution:** Ensure the vault path is readable and writable by your user

```bash
# Check permissions
ls -la /path/to/vault

# Fix if needed (Unix/macOS)
chmod -R u+rw /path/to/vault
```

## Next Steps

- Read the [API Documentation](docs/API.md) for detailed tool information
- Check out [CONTRIBUTING.md](CONTRIBUTING.md) to contribute
- Explore the sample vault in `examples/sample-vault/`

## Getting Help

- Check the [README](README.md) for full documentation
- Open an issue on GitHub for bugs or questions
- Review existing issues for common problems

## Tips

1. **Start Small:** Test with a small vault first
2. **Use Tags:** Tags make searching and organizing easier
3. **Link Notes:** More links = better graph structure
4. **Regular Backups:** Always backup your vault before using write operations
5. **Frontmatter:** Use YAML frontmatter for better metadata

Enjoy using obsidian-mcp-ultra! 🚀
