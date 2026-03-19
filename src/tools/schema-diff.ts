/**
 * Compare two JSON Schemas: find added/removed/changed fields,
 * type changes, constraint changes. Breaking vs non-breaking.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  description?: string;
  title?: string;
  default?: unknown;
}

export interface SchemaDiffChange {
  path: string;
  type: "added" | "removed" | "changed";
  breaking: boolean;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface SchemaDiffResult {
  compatible: boolean;
  totalChanges: number;
  breakingChanges: number;
  nonBreakingChanges: number;
  changes: SchemaDiffChange[];
  summary: string;
}

function normalizeType(type: string | string[] | undefined): string[] {
  if (!type) return [];
  return Array.isArray(type) ? [...type].sort() : [type];
}

function typesEqual(a: string | string[] | undefined, b: string | string[] | undefined): boolean {
  const na = normalizeType(a);
  const nb = normalizeType(b);
  return na.length === nb.length && na.every((t, i) => t === nb[i]);
}

function isTypeNarrowed(oldType: string[], newType: string[]): boolean {
  // Type was narrowed if new type is a strict subset of old type
  return newType.length < oldType.length && newType.every((t) => oldType.includes(t));
}

function isTypeWidened(oldType: string[], newType: string[]): boolean {
  // Type was widened if old type is a strict subset of new type
  return oldType.length < newType.length && oldType.every((t) => newType.includes(t));
}

function diffSchemas(
  oldSchema: JsonSchema,
  newSchema: JsonSchema,
  path: string,
  changes: SchemaDiffChange[]
): void {
  // Type changes
  if (!typesEqual(oldSchema.type, newSchema.type)) {
    const oldTypes = normalizeType(oldSchema.type);
    const newTypes = normalizeType(newSchema.type);

    if (isTypeWidened(oldTypes, newTypes)) {
      changes.push({
        path,
        type: "changed",
        breaking: false,
        description: `Type widened from ${oldTypes.join(" | ")} to ${newTypes.join(" | ")}`,
        oldValue: oldSchema.type,
        newValue: newSchema.type,
      });
    } else if (isTypeNarrowed(oldTypes, newTypes)) {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Type narrowed from ${oldTypes.join(" | ")} to ${newTypes.join(" | ")} (existing data may not validate)`,
        oldValue: oldSchema.type,
        newValue: newSchema.type,
      });
    } else {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Type changed from ${oldTypes.join(" | ") || "any"} to ${newTypes.join(" | ") || "any"}`,
        oldValue: oldSchema.type,
        newValue: newSchema.type,
      });
    }
  }

  // Format changes
  if (oldSchema.format !== newSchema.format) {
    if (!oldSchema.format && newSchema.format) {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Format constraint added: ${newSchema.format}`,
        oldValue: undefined,
        newValue: newSchema.format,
      });
    } else if (oldSchema.format && !newSchema.format) {
      changes.push({
        path,
        type: "changed",
        breaking: false,
        description: `Format constraint removed: ${oldSchema.format}`,
        oldValue: oldSchema.format,
        newValue: undefined,
      });
    } else {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Format changed from "${oldSchema.format}" to "${newSchema.format}"`,
        oldValue: oldSchema.format,
        newValue: newSchema.format,
      });
    }
  }

  // Enum changes
  const oldEnum = oldSchema.enum ? JSON.stringify(oldSchema.enum) : undefined;
  const newEnum = newSchema.enum ? JSON.stringify(newSchema.enum) : undefined;
  if (oldEnum !== newEnum) {
    if (!oldSchema.enum && newSchema.enum) {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Enum constraint added: [${newSchema.enum!.map((e) => JSON.stringify(e)).join(", ")}]`,
        oldValue: undefined,
        newValue: newSchema.enum,
      });
    } else if (oldSchema.enum && !newSchema.enum) {
      changes.push({
        path,
        type: "changed",
        breaking: false,
        description: `Enum constraint removed`,
        oldValue: oldSchema.enum,
        newValue: undefined,
      });
    } else if (oldSchema.enum && newSchema.enum) {
      const removed = oldSchema.enum.filter(
        (v) => !newSchema.enum!.some((nv) => JSON.stringify(nv) === JSON.stringify(v))
      );
      const added = newSchema.enum.filter(
        (v) => !oldSchema.enum!.some((ov) => JSON.stringify(ov) === JSON.stringify(v))
      );
      if (removed.length > 0) {
        changes.push({
          path,
          type: "changed",
          breaking: true,
          description: `Enum values removed: ${removed.map((v) => JSON.stringify(v)).join(", ")}`,
          oldValue: oldSchema.enum,
          newValue: newSchema.enum,
        });
      }
      if (added.length > 0) {
        changes.push({
          path,
          type: "changed",
          breaking: false,
          description: `Enum values added: ${added.map((v) => JSON.stringify(v)).join(", ")}`,
          oldValue: oldSchema.enum,
          newValue: newSchema.enum,
        });
      }
    }
  }

  // Numeric constraint changes
  const numericConstraints: Array<{
    key: keyof JsonSchema;
    label: string;
    tighterIsBreaking: boolean;
  }> = [
    { key: "minimum", label: "minimum", tighterIsBreaking: true },
    { key: "maximum", label: "maximum", tighterIsBreaking: true },
    { key: "exclusiveMinimum", label: "exclusiveMinimum", tighterIsBreaking: true },
    { key: "exclusiveMaximum", label: "exclusiveMaximum", tighterIsBreaking: true },
    { key: "minLength", label: "minLength", tighterIsBreaking: true },
    { key: "maxLength", label: "maxLength", tighterIsBreaking: true },
    { key: "minItems", label: "minItems", tighterIsBreaking: true },
    { key: "maxItems", label: "maxItems", tighterIsBreaking: true },
  ];

  for (const { key, label } of numericConstraints) {
    const oldVal = oldSchema[key] as number | undefined;
    const newVal = newSchema[key] as number | undefined;
    if (oldVal !== newVal) {
      const isMin = label.startsWith("min") || label.startsWith("exclusiveMin");
      const added = oldVal === undefined && newVal !== undefined;
      const removed = oldVal !== undefined && newVal === undefined;
      let breaking: boolean;

      if (added) {
        breaking = true; // Adding a constraint is breaking
      } else if (removed) {
        breaking = false; // Removing a constraint is non-breaking
      } else {
        // Changed: tighter is breaking
        if (isMin) {
          breaking = newVal! > oldVal!; // Increased minimum is breaking
        } else {
          breaking = newVal! < oldVal!; // Decreased maximum is breaking
        }
      }

      changes.push({
        path,
        type: "changed",
        breaking,
        description: added
          ? `Constraint "${label}" added: ${newVal}`
          : removed
          ? `Constraint "${label}" removed (was: ${oldVal})`
          : `Constraint "${label}" changed from ${oldVal} to ${newVal}`,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  // Pattern changes
  if (oldSchema.pattern !== newSchema.pattern) {
    if (!oldSchema.pattern && newSchema.pattern) {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Pattern constraint added: ${newSchema.pattern}`,
        oldValue: undefined,
        newValue: newSchema.pattern,
      });
    } else if (oldSchema.pattern && !newSchema.pattern) {
      changes.push({
        path,
        type: "changed",
        breaking: false,
        description: `Pattern constraint removed`,
        oldValue: oldSchema.pattern,
        newValue: undefined,
      });
    } else {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Pattern changed from "${oldSchema.pattern}" to "${newSchema.pattern}"`,
        oldValue: oldSchema.pattern,
        newValue: newSchema.pattern,
      });
    }
  }

  // Property changes (object schemas)
  const oldProps = oldSchema.properties || {};
  const newProps = newSchema.properties || {};
  const oldKeys = new Set(Object.keys(oldProps));
  const newKeys = new Set(Object.keys(newProps));
  const oldRequired = new Set(oldSchema.required || []);
  const newRequired = new Set(newSchema.required || []);

  // Added properties
  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      const isNowRequired = newRequired.has(key);
      changes.push({
        path: path ? `${path}.${key}` : key,
        type: "added",
        breaking: isNowRequired, // Adding a required field is breaking
        description: isNowRequired
          ? `Required field added (breaking: existing data will lack this field)`
          : `Optional field added`,
        newValue: summarizeSchema(newProps[key]),
      });
    }
  }

  // Removed properties
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      changes.push({
        path: path ? `${path}.${key}` : key,
        type: "removed",
        breaking: true,
        description: `Field removed`,
        oldValue: summarizeSchema(oldProps[key]),
      });
    }
  }

  // Changed properties (recurse)
  for (const key of oldKeys) {
    if (newKeys.has(key)) {
      diffSchemas(oldProps[key], newProps[key], path ? `${path}.${key}` : key, changes);
    }
  }

  // Required field changes
  for (const key of newRequired) {
    if (!oldRequired.has(key) && oldKeys.has(key)) {
      changes.push({
        path: path ? `${path}.${key}` : key,
        type: "changed",
        breaking: true,
        description: `Field changed from optional to required`,
      });
    }
  }

  for (const key of oldRequired) {
    if (!newRequired.has(key) && newKeys.has(key)) {
      changes.push({
        path: path ? `${path}.${key}` : key,
        type: "changed",
        breaking: false,
        description: `Field changed from required to optional`,
      });
    }
  }

  // Array items changes
  if (oldSchema.items && newSchema.items) {
    diffSchemas(oldSchema.items, newSchema.items, `${path}[]`, changes);
  } else if (!oldSchema.items && newSchema.items) {
    changes.push({
      path: `${path}[]`,
      type: "added",
      breaking: true,
      description: `Array items schema added`,
      newValue: summarizeSchema(newSchema.items!),
    });
  } else if (oldSchema.items && !newSchema.items) {
    changes.push({
      path: `${path}[]`,
      type: "removed",
      breaking: false,
      description: `Array items schema removed`,
      oldValue: summarizeSchema(oldSchema.items),
    });
  }

  // additionalProperties changes
  if (oldSchema.additionalProperties !== newSchema.additionalProperties) {
    if (oldSchema.additionalProperties !== false && newSchema.additionalProperties === false) {
      changes.push({
        path,
        type: "changed",
        breaking: true,
        description: `Additional properties disallowed`,
        oldValue: oldSchema.additionalProperties,
        newValue: false,
      });
    } else if (oldSchema.additionalProperties === false && newSchema.additionalProperties !== false) {
      changes.push({
        path,
        type: "changed",
        breaking: false,
        description: `Additional properties now allowed`,
        oldValue: false,
        newValue: newSchema.additionalProperties,
      });
    }
  }
}

function summarizeSchema(schema: JsonSchema): string {
  const parts: string[] = [];
  if (schema.type) {
    parts.push(`type: ${Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type}`);
  }
  if (schema.format) parts.push(`format: ${schema.format}`);
  if (schema.enum) parts.push(`enum: [${schema.enum.map((v) => JSON.stringify(v)).join(", ")}]`);
  if (schema.properties) parts.push(`properties: [${Object.keys(schema.properties).join(", ")}]`);
  return parts.join(", ") || "{}";
}

export function diffSchemaObjects(
  oldSchema: unknown,
  newSchema: unknown
): SchemaDiffResult {
  if (!oldSchema || typeof oldSchema !== "object") {
    throw new Error("Old schema must be a valid JSON Schema object");
  }
  if (!newSchema || typeof newSchema !== "object") {
    throw new Error("New schema must be a valid JSON Schema object");
  }

  const changes: SchemaDiffChange[] = [];
  diffSchemas(oldSchema as JsonSchema, newSchema as JsonSchema, "$", changes);

  const breakingChanges = changes.filter((c) => c.breaking).length;
  const nonBreakingChanges = changes.filter((c) => !c.breaking).length;

  const summaryParts: string[] = [];
  if (changes.length === 0) {
    summaryParts.push("Schemas are identical.");
  } else {
    summaryParts.push(`Found ${changes.length} change(s): ${breakingChanges} breaking, ${nonBreakingChanges} non-breaking.`);
    if (breakingChanges > 0) {
      summaryParts.push("Breaking changes detected - existing data may not validate against the new schema.");
    } else {
      summaryParts.push("All changes are backwards-compatible.");
    }
  }

  return {
    compatible: breakingChanges === 0,
    totalChanges: changes.length,
    breakingChanges,
    nonBreakingChanges,
    changes,
    summary: summaryParts.join(" "),
  };
}
