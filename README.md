
# mcp-schema-tools

MCP server providing schema validation and generation tools for AI agents.

## Tools

### generate_json_schema
Generate a JSON Schema from sample JSON data. Infers types, required fields, formats (email, date, URI, UUID), and detects enum patterns from multiple examples.

### generate_typescript
Generate TypeScript interfaces and types from JSON data or a JSON Schema. Handles nested objects, arrays, optional fields, enums, and union types.

### validate_schema
Validate data against a JSON Schema with detailed error messages including JSON path, expected type, actual value, and the violated constraint keyword.

### mock_from_schema
Generate realistic mock data from a JSON Schema. Smart field-name detection produces contextual values: email fields get valid emails, name fields get realistic names, phone fields get formatted numbers, etc.

### diff_schemas
Compare two JSON Schemas to find added, removed, and changed fields. Identifies type changes, constraint changes, and classifies each difference as breaking or non-breaking for backwards compatibility analysis.

## Setup

```bash
npm install
npm run build
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "schema-tools": {
      "command": "node",
      "args": ["path/to/mcp-schema-tools/dist/index.js"]
    }
  }
}
```

## License

MIT
