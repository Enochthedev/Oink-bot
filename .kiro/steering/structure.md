# Project Structure

## Directory Organization

```
.
├── .kiro/                    # Kiro AI assistant configuration
│   ├── settings/            # Configuration files
│   │   └── mcp.json        # MCP server definitions (workspace-level)
│   └── steering/           # AI assistant guidance documents
│       ├── product.md      # Product overview and purpose
│       ├── tech.md         # Technology stack and commands
│       └── structure.md    # This file - project organization
└── .vscode/                # VSCode workspace settings
    └── settings.json       # Editor configuration with Kiro MCP enabled
```

## Key Conventions

### Configuration Management
- **Workspace-level MCP config**: `.kiro/settings/mcp.json` - project-specific servers
- **User-level MCP config**: `~/.kiro/settings/mcp.json` - global servers
- Workspace config takes precedence over user config for conflicting server names

### Steering Files
- All steering documents live in `.kiro/steering/`
- Use markdown format for readability
- Keep files focused and concise
- Reference external files using `#[[file:<relative_path>]]` syntax when needed

### File Naming
- Use lowercase with hyphens for multi-word files
- Keep steering file names descriptive but brief
- Configuration files follow established conventions (mcp.json, settings.json)

## Development Patterns
- Minimal file structure to reduce complexity
- Configuration-driven approach for MCP integration
- AI-first development workflow through Kiro interface