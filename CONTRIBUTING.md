# Contributing to obsidian-mcp-ultra

Thank you for your interest in contributing to obsidian-mcp-ultra!

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/alch3mistdev/obsidian-mcp-ultra.git
cd obsidian-mcp-ultra
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

## Project Structure

```
obsidian-mcp-ultra/
├── src/
│   ├── index.ts           # Main MCP server entry point
│   ├── types.ts           # TypeScript type definitions
│   ├── parser/
│   │   └── markdown.ts    # Markdown parser
│   ├── vault/
│   │   └── vault.ts       # Vault interface
│   └── graph/
│       └── builder.ts     # Knowledge graph builder
├── tests/
│   ├── parser.test.ts     # Parser tests
│   └── vault.test.ts      # Vault tests
└── examples/
    ├── sample-vault/      # Sample vault for testing
    └── test-vault.ts      # Integration test script
```

## Making Changes

1. Create a new branch for your changes:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and ensure tests pass:
```bash
npm test
```

3. Add tests for new functionality

4. Build and verify:
```bash
npm run build
npm run lint
```

5. Commit your changes with a descriptive message:
```bash
git commit -m "feat: Add new feature"
```

6. Push your branch and create a pull request

## Code Style

- Use TypeScript for all new code
- Follow existing code style and formatting
- Add JSDoc comments for public APIs
- Keep functions focused and testable

## Testing

- Write unit tests for new functionality
- Ensure all tests pass before submitting PR
- Test with the sample vault in `examples/sample-vault`
- Consider edge cases and error handling

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update tests to cover your changes
3. Ensure the build passes and tests succeed
4. The PR will be reviewed by maintainers

## Reporting Issues

When reporting issues, please include:

- Version of obsidian-mcp-ultra
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Any relevant error messages or logs

## Feature Requests

Feature requests are welcome! Please open an issue with:

- Clear description of the feature
- Use case and benefits
- Any implementation ideas

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
