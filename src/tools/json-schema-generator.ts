/**
 * Generate JSON Schema from sample JSON data.
 * Infers types, required fields, patterns, enums from multiple examples.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  format?: string;
  additionalProperties?: boolean;
}

function detectFormat(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "date-time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "email";
  if (/^https?:\/\//.test(value)) return "uri";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return "uuid";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ipv4";
  return undefined;
}

function inferSchemaFromValue(value: unknown): JsonSchema {
  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: {} };
    }
    const itemSchemas = value.map(inferSchemaFromValue);
    const merged = mergeSchemas(itemSchemas);
    return { type: "array", items: merged };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchema> = {};
    for (const [key, val] of Object.entries(obj)) {
      properties[key] = inferSchemaFromValue(val);
    }
    return {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }

  if (typeof value === "string") {
    const schema: JsonSchema = { type: "string" };
    const fmt = detectFormat(value);
    if (fmt) schema.format = fmt;
    return schema;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }

  if (typeof value === "boolean") {
    return { type: "boolean" };
  }

  return {};
}

function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  const types = new Set<string>();
  let hasObject = false;
  let hasArray = false;
  const allProperties: Map<string, JsonSchema[]> = new Map();
  const allItemSchemas: JsonSchema[] = [];
  const allRequiredSets: Set<string>[] = [];
  const formats = new Set<string>();

  for (const schema of schemas) {
    const schemaTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    for (const t of schemaTypes) types.add(t);

    if (schema.type === "object" && schema.properties) {
      hasObject = true;
      allRequiredSets.push(new Set(schema.required || []));
      for (const [key, val] of Object.entries(schema.properties)) {
        if (!allProperties.has(key)) allProperties.set(key, []);
        allProperties.get(key)!.push(val);
      }
    }

    if (schema.type === "array" && schema.items) {
      hasArray = true;
      allItemSchemas.push(schema.items);
    }

    if (schema.format) formats.add(schema.format);
  }

  if (hasObject && types.size === 1) {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, vals] of allProperties) {
      properties[key] = mergeSchemas(vals);
    }
    // Required = fields present in ALL examples
    const required = [...allProperties.keys()].filter((key) =>
      allRequiredSets.every((reqSet) => reqSet.has(key))
    );
    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  if (hasArray && types.size === 1) {
    return {
      type: "array",
      items: mergeSchemas(allItemSchemas),
    };
  }

  const result: JsonSchema = {};

  if (types.size === 1) {
    result.type = [...types][0];
  } else if (types.size > 1) {
    // Merge integer + number into number
    if (types.has("integer") && types.has("number")) {
      types.delete("integer");
    }
    result.type = types.size === 1 ? [...types][0] : [...types];
  }

  if (formats.size === 1) {
    result.format = [...formats][0];
  }

  return result;
}

function detectEnums(samples: unknown[], schema: JsonSchema): JsonSchema {
  if (schema.type === "object" && schema.properties) {
    const newProps: Record<string, JsonSchema> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const values = samples
        .filter((s) => s !== null && typeof s === "object" && !Array.isArray(s))
        .map((s) => (s as Record<string, unknown>)[key])
        .filter((v) => v !== undefined);

      newProps[key] = detectEnums(values, propSchema);

      // If string field has limited unique values relative to sample count, mark as enum
      if (
        propSchema.type === "string" &&
        !propSchema.format &&
        values.length >= 3
      ) {
        const unique = [...new Set(values.filter((v) => typeof v === "string"))] as string[];
        if (unique.length >= 2 && unique.length <= Math.max(5, values.length * 0.3)) {
          newProps[key] = { ...newProps[key], enum: unique };
        }
      }
    }
    return { ...schema, properties: newProps };
  }
  return schema;
}

export function generateJsonSchema(
  samples: unknown[],
  options?: { title?: string; detectEnums?: boolean }
): JsonSchema & { $schema?: string; title?: string } {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Provide at least one sample JSON value");
  }

  const schemas = samples.map(inferSchemaFromValue);
  let merged = mergeSchemas(schemas);

  if (options?.detectEnums !== false && samples.length >= 3) {
    merged = detectEnums(samples, merged);
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options?.title,
    ...merged,
  };
}
