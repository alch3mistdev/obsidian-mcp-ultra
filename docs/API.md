# API Documentation

## Overview

The obsidian-mcp-ultra server exposes your Obsidian vault through the Model Context Protocol (MCP), providing tools for reading, searching, and manipulating notes, as well as querying the knowledge graph structure.

## Tools

### search_notes
Search for notes by content, title, or tags.

**Parameters:**
- `query` (string): Search query
- `limit` (number, optional): Max results (default: 10)

### read_note
Read full content and metadata of a note.

**Parameters:**
- `path` (string): Path to the note

### create_note
Create a new note in the vault.

**Parameters:**
- `path` (string): Path for new note
- `content` (string): Note content

### update_note
Update an existing note.

**Parameters:**
- `path` (string): Path to note
- `content` (string): New content

### list_notes
List all notes in vault.

### get_backlinks
Get notes linking to a specific note.

**Parameters:**
- `path` (string): Path to note

### get_graph
Get knowledge graph structure.

**Parameters:**
- `path` (string, optional): Get connected nodes
- `depth` (number, optional): Connection depth (default: 1)

### find_by_tag
Find notes with a specific tag.

**Parameters:**
- `tag` (string): Tag to search for

### get_stats
Get vault statistics.

## Resources

- `obsidian://vault/all-notes` - All notes (JSON)
- `obsidian://vault/graph` - Graph structure (JSON)
- `obsidian://vault/stats` - Statistics (JSON)
- `obsidian://note/{path}` - Note content (Markdown)

## Prompts

### summarize_note
Generate note summary with connections.
**Arguments:** `path`

### find_connections
Discover connections between notes.
**Arguments:** `note1`, `note2`
