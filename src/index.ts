#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { generateJsonSchema } from "./tools/json-schema-generator.js";
import { generateTypescript } from "./tools/typescript-generator.js";
import { validateSchema } from "./tools/schema-validator.js";
import { generateMockData } from "./tools/mock-from-schema.js";
import { diffSchemaObjects } from "./tools/schema-diff.js";

const server = new Server(
  {
    name: "mcp-schema-tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_json_schema",
      description:
        "Generate a JSON Schema from one or more sample JSON values. Infers types, required fields, formats (email, date, URI, UUID), and detects enum patterns from multiple examples.",
      inputSchema: {
        type: "object" as const,
        properties: {
          samples: {
            type: "array",
            items: {},
            description:
              "Array of sample JSON values to infer the schema from. More samples produce a more accurate schema.",
          },
          title: {
            type: "string",
            description: "Optional title for the generated schema",
          },
          detect_enums: {
            type: "boolean",
            description:
              "Whether to detect enum values from string fields across samples (default: true, requires >= 3 samples)",
          },
        },
        required: ["samples"],
      },
    },
    {
      name: "generate_typescript",
      description:
        "Generate TypeScript interfaces and types from JSON data or a JSON Schema. Handles nested objects, arrays, optional fields, enums, union types, and Record types.",
      inputSchema: {
        type: "object" as const,
        properties: {
          schema: {
            type: "object",
            description:
              "A JSON Schema to convert to TypeScript types. Provide either this or 'json'.",
          },
          json: {
            description:
              "Sample JSON data to convert to TypeScript types. Provide either this or 'schema'.",
          },
          root_name: {
            type: "string",
            description:
              "Name for the root interface/type (default: 'Root')",
          },
        },
      },
    },
    {
      name: "validate_schema",
      description:
        "Validate data against a JSON Schema. Returns detailed error messages with JSON path, expected type, actual value, and the violated keyword (type, required, format, pattern, minimum, etc.).",
      inputSchema: {
        type: "object" as const,
        properties: {
          schema: {
            type: "object",
            description: "The JSON Schema to validate against",
          },
          data: {
            description: "The data to validate",
          },
        },
        required: ["schema", "data"],
      },
    },
    {
      name: "mock_from_schema",
      description:
        "Generate realistic mock data from a JSON Schema. Uses smart field-name detection to produce contextual values: email fields get valid emails, name fields get realistic names, dates get ISO strings, etc. Supports all JSON Schema types and constraints.",
      inputSchema: {
        type: "object" as const,
        properties: {
          schema: {
            type: "object",
            description: "The JSON Schema to generate mock data from",
          },
          count: {
            type: "number",
            description:
              "Number of mock objects to generate (default: 1). If > 1, returns an array.",
          },
          seed: {
            type: "number",
            description:
              "Random seed for reproducible output. Same seed + same schema = same data.",
          },
        },
        required: ["schema"],
      },
    },
    {
      name: "diff_schemas",
      description:
        "Compare two JSON Schemas and identify all differences: added/removed/changed fields, type changes, constraint changes (min/max, patterns, enums). Classifies each change as breaking or non-breaking for backwards compatibility analysis.",
      inputSchema: {
        type: "object" as const,
        properties: {
          old_schema: {
            type: "object",
            description: "The original (old) JSON Schema",
          },
          new_schema: {
            type: "object",
            description: "The updated (new) JSON Schema",
          },
        },
        required: ["old_schema", "new_schema"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "generate_json_schema": {
        const samples = args?.samples as unknown[];
        if (!samples || !Array.isArray(samples) || samples.length === 0) {
          throw new Error("Provide at least one sample in the 'samples' array");
        }
        const result = generateJsonSchema(samples, {
          title: args?.title as string | undefined,
          detectEnums: args?.detect_enums as boolean | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "generate_typescript": {
        if (!args?.schema && args?.json === undefined) {
          throw new Error("Provide either 'schema' (JSON Schema) or 'json' (sample data)");
        }
        const result = generateTypescript(
          {
            schema: args?.schema as unknown,
            json: args?.json as unknown,
          },
          { rootName: args?.root_name as string | undefined }
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "validate_schema": {
        const schema = args?.schema;
        const data = args?.data;
        if (!schema) throw new Error("Provide a 'schema' object");
        const result = validateSchema(schema, data);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mock_from_schema": {
        const schema = args?.schema;
        if (!schema) throw new Error("Provide a 'schema' object");
        const result = generateMockData(schema, {
          count: args?.count as number | undefined,
          seed: args?.seed as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "diff_schemas": {
        const oldSchema = args?.old_schema;
        const newSchema = args?.new_schema;
        if (!oldSchema) throw new Error("Provide 'old_schema'");
        if (!newSchema) throw new Error("Provide 'new_schema'");
        const result = diffSchemaObjects(oldSchema, newSchema);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Schema Tools server running on stdio");
}

main().catch(console.error);
