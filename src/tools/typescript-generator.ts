/**
 * Generate TypeScript interfaces/types from JSON data or JSON Schema.
 * Handles nested objects, arrays, optional fields.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  title?: string;
  description?: string;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sanitizeIdentifier(name: string): string {
  // Convert kebab-case or snake_case to PascalCase
  return name
    .split(/[-_\s]+/)
    .map(capitalize)
    .join("");
}

function needsQuotes(key: string): boolean {
  return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function formatKey(key: string): string {
  return needsQuotes(key) ? `"${key}"` : key;
}

class TypeScriptGenerator {
  private interfaces: Map<string, string> = new Map();
  private indent: string;

  constructor(indent: string = "  ") {
    this.indent = indent;
  }

  private schemaToType(schema: JsonSchema, name: string, depth: number): string {
    if (schema.enum) {
      return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    if (schema.oneOf || schema.anyOf) {
      const variants = (schema.oneOf || schema.anyOf)!;
      return variants.map((v, i) => this.schemaToType(v, `${name}Variant${i + 1}`, depth)).join(" | ");
    }

    if (schema.allOf) {
      return schema.allOf.map((v, i) => this.schemaToType(v, `${name}Part${i + 1}`, depth)).join(" & ");
    }

    const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : ["any"];

    if (types.length > 1) {
      const mapped = types.map((t) => this.primitiveType(t, schema, name, depth));
      return mapped.join(" | ");
    }

    return this.primitiveType(types[0], schema, name, depth);
  }

  private primitiveType(type: string, schema: JsonSchema, name: string, depth: number): string {
    switch (type) {
      case "string":
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array":
        if (schema.items) {
          const itemType = this.schemaToType(schema.items, `${name}Item`, depth);
          // Wrap union types in parens for array
          if (itemType.includes(" | ")) return `(${itemType})[]`;
          return `${itemType}[]`;
        }
        return "unknown[]";
      case "object":
        if (schema.properties) {
          if (depth === 0) {
            // Top-level: generate as a named interface
            return this.generateInterface(name, schema);
          }
          // Nested: generate inline or as separate interface if complex
          const propCount = Object.keys(schema.properties).length;
          if (propCount > 3) {
            const ifaceName = sanitizeIdentifier(name);
            this.generateInterface(ifaceName, schema);
            return ifaceName;
          }
          return this.inlineObject(schema, name, depth);
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
          const valueType = this.schemaToType(schema.additionalProperties, `${name}Value`, depth + 1);
          return `Record<string, ${valueType}>`;
        }
        return "Record<string, unknown>";
      default:
        return "unknown";
    }
  }

  private inlineObject(schema: JsonSchema, name: string, depth: number): string {
    const required = new Set(schema.required || []);
    const lines: string[] = [];

    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      const optional = required.has(key) ? "" : "?";
      const propType = this.schemaToType(propSchema, `${name}${capitalize(key)}`, depth + 1);
      const comment = propSchema.description ? ` // ${propSchema.description}` : "";
      lines.push(`${formatKey(key)}${optional}: ${propType};${comment}`);
    }

    if (lines.length === 0) return "Record<string, unknown>";

    const pad = this.indent.repeat(depth + 1);
    const closePad = this.indent.repeat(depth);
    return `{\n${lines.map((l) => `${pad}${l}`).join("\n")}\n${closePad}}`;
  }

  private generateInterface(name: string, schema: JsonSchema): string {
    const ifaceName = sanitizeIdentifier(name);
    const required = new Set(schema.required || []);
    const lines: string[] = [];

    if (schema.description) {
      lines.push(`/** ${schema.description} */`);
    }
    lines.push(`export interface ${ifaceName} {`);

    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      if (propSchema.description) {
        lines.push(`${this.indent}/** ${propSchema.description} */`);
      }
      const optional = required.has(key) ? "" : "?";
      const propType = this.schemaToType(propSchema, `${ifaceName}${capitalize(key)}`, 1);
      lines.push(`${this.indent}${formatKey(key)}${optional}: ${propType};`);
    }

    lines.push("}");
    this.interfaces.set(ifaceName, lines.join("\n"));
    return ifaceName;
  }

  generateFromSchema(schema: JsonSchema, rootName: string): string {
    this.interfaces.clear();
    this.schemaToType(schema, rootName, 0);

    if (this.interfaces.size === 0) {
      // Schema was a primitive type
      const tsType = this.schemaToType(schema, rootName, 1);
      return `export type ${sanitizeIdentifier(rootName)} = ${tsType};\n`;
    }

    return [...this.interfaces.values()].join("\n\n") + "\n";
  }

  generateFromJson(data: unknown, rootName: string): string {
    const schema = this.jsonToSchema(data);
    return this.generateFromSchema(schema, rootName);
  }

  private jsonToSchema(value: unknown): JsonSchema {
    if (value === null) return { type: "null" };
    if (Array.isArray(value)) {
      if (value.length === 0) return { type: "array", items: {} };
      const itemSchemas = value.map((v) => this.jsonToSchema(v));
      return { type: "array", items: this.mergeSimple(itemSchemas) };
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const properties: Record<string, JsonSchema> = {};
      for (const [key, val] of Object.entries(obj)) {
        properties[key] = this.jsonToSchema(val);
      }
      return { type: "object", properties, required: Object.keys(properties) };
    }
    if (typeof value === "string") return { type: "string" };
    if (typeof value === "number") return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
    if (typeof value === "boolean") return { type: "boolean" };
    return {};
  }

  private mergeSimple(schemas: JsonSchema[]): JsonSchema {
    if (schemas.length === 0) return {};
    if (schemas.length === 1) return schemas[0];

    const types = new Set<string>();
    const allProps: Map<string, JsonSchema[]> = new Map();
    const allKeySets: Set<string>[] = [];
    let hasObj = false;

    for (const s of schemas) {
      const t = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
      t.forEach((x) => types.add(x));
      if (s.type === "object" && s.properties) {
        hasObj = true;
        allKeySets.push(new Set(Object.keys(s.properties)));
        for (const [k, v] of Object.entries(s.properties)) {
          if (!allProps.has(k)) allProps.set(k, []);
          allProps.get(k)!.push(v);
        }
      }
    }

    if (hasObj && types.size === 1) {
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of allProps) {
        properties[k] = this.mergeSimple(v);
      }
      const required = [...allProps.keys()].filter((k) =>
        allKeySets.every((s) => s.has(k))
      );
      return { type: "object", properties, required };
    }

    if (types.has("integer") && types.has("number")) types.delete("integer");
    return { type: types.size === 1 ? [...types][0] : [...types] };
  }
}

export function generateTypescript(
  input: { schema?: unknown; json?: unknown },
  options?: { rootName?: string }
): string {
  const generator = new TypeScriptGenerator();
  const rootName = options?.rootName || "Root";

  if (input.schema) {
    return generator.generateFromSchema(input.schema as JsonSchema, rootName);
  }
  if (input.json !== undefined) {
    return generator.generateFromJson(input.json, rootName);
  }
  throw new Error("Provide either 'schema' (JSON Schema) or 'json' (sample JSON data)");
}
