/**
 * Validate data against JSON Schema with detailed error messages
 * including path, expected type, actual value.
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
  uniqueItems?: boolean;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  const?: unknown;
  not?: JsonSchema;
}

export interface ValidationError {
  path: string;
  message: string;
  expected: string;
  actual: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  errorCount: number;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function truncate(value: unknown, maxLen: number = 80): string {
  const str = JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

const FORMAT_VALIDATORS: Record<string, (v: string) => boolean> = {
  email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  uri: (v) => /^https?:\/\/.+/.test(v),
  "date-time": (v) => !isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  ipv4: (v) => /^\d{1,3}(\.\d{1,3}){3}$/.test(v),
  ipv6: (v) => /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(v),
};

function validate(
  schema: JsonSchema,
  data: unknown,
  path: string,
  errors: ValidationError[]
): void {
  // const
  if (schema.const !== undefined) {
    if (JSON.stringify(data) !== JSON.stringify(schema.const)) {
      errors.push({
        path,
        message: `Value must be ${JSON.stringify(schema.const)}`,
        expected: JSON.stringify(schema.const),
        actual: truncate(data),
        keyword: "const",
      });
    }
    return;
  }

  // enum
  if (schema.enum) {
    const match = schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data));
    if (!match) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`,
        expected: `one of [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}]`,
        actual: truncate(data),
        keyword: "enum",
      });
    }
  }

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = typeOf(data);
    const typeMatch = types.some((t) => {
      if (t === "integer") return typeof data === "number" && Number.isInteger(data);
      if (t === "array") return Array.isArray(data);
      if (t === "null") return data === null;
      if (t === "object") return typeof data === "object" && data !== null && !Array.isArray(data);
      return typeof data === t;
    });

    if (!typeMatch) {
      errors.push({
        path,
        message: `Expected type ${types.join(" | ")}, got ${actualType}`,
        expected: types.join(" | "),
        actual: actualType,
        keyword: "type",
      });
      return; // Stop further checks if type is wrong
    }
  }

  // String validations
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        expected: `minLength: ${schema.minLength}`,
        actual: `length: ${data.length}`,
        keyword: "minLength",
      });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        expected: `maxLength: ${schema.maxLength}`,
        actual: `length: ${data.length}`,
        keyword: "maxLength",
      });
    }
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          path,
          message: `String does not match pattern: ${schema.pattern}`,
          expected: `pattern: ${schema.pattern}`,
          actual: truncate(data),
          keyword: "pattern",
        });
      }
    }
    if (schema.format && FORMAT_VALIDATORS[schema.format]) {
      if (!FORMAT_VALIDATORS[schema.format](data)) {
        errors.push({
          path,
          message: `Invalid ${schema.format} format`,
          expected: `format: ${schema.format}`,
          actual: truncate(data),
          keyword: "format",
        });
      }
    }
  }

  // Number validations
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Value must be >= ${schema.minimum}`,
        expected: `minimum: ${schema.minimum}`,
        actual: String(data),
        keyword: "minimum",
      });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Value must be <= ${schema.maximum}`,
        expected: `maximum: ${schema.maximum}`,
        actual: String(data),
        keyword: "maximum",
      });
    }
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) {
      errors.push({
        path,
        message: `Value must be > ${schema.exclusiveMinimum}`,
        expected: `exclusiveMinimum: ${schema.exclusiveMinimum}`,
        actual: String(data),
        keyword: "exclusiveMinimum",
      });
    }
    if (schema.exclusiveMaximum !== undefined && data >= schema.exclusiveMaximum) {
      errors.push({
        path,
        message: `Value must be < ${schema.exclusiveMaximum}`,
        expected: `exclusiveMaximum: ${schema.exclusiveMaximum}`,
        actual: String(data),
        keyword: "exclusiveMaximum",
      });
    }
  }

  // Object validations
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Missing required field "${key}"`,
            expected: "field to exist",
            actual: "undefined",
            keyword: "required",
          });
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          validate(propSchema, obj[key], path ? `${path}.${key}` : key, errors);
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Additional property "${key}" is not allowed`,
            expected: `one of [${[...allowed].join(", ")}]`,
            actual: key,
            keyword: "additionalProperties",
          });
        }
      }
    }

    if (typeof schema.additionalProperties === "object" && schema.properties) {
      const knownKeys = new Set(Object.keys(schema.properties));
      for (const [key, val] of Object.entries(obj)) {
        if (!knownKeys.has(key)) {
          validate(schema.additionalProperties, val, path ? `${path}.${key}` : key, errors);
        }
      }
    }
  }

  // Array validations
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        expected: `minItems: ${schema.minItems}`,
        actual: `length: ${data.length}`,
        keyword: "minItems",
      });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        expected: `maxItems: ${schema.maxItems}`,
        actual: `length: ${data.length}`,
        keyword: "maxItems",
      });
    }
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i++) {
        const serialized = JSON.stringify(data[i]);
        if (seen.has(serialized)) {
          errors.push({
            path: `${path}[${i}]`,
            message: `Duplicate item found at index ${i}`,
            expected: "unique items",
            actual: truncate(data[i]),
            keyword: "uniqueItems",
          });
        }
        seen.add(serialized);
      }
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        validate(schema.items, data[i], `${path}[${i}]`, errors);
      }
    }
  }

  // allOf
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      validate(subSchema, data, path, errors);
    }
  }

  // anyOf
  if (schema.anyOf) {
    const anyValid = schema.anyOf.some((sub) => {
      const subErrors: ValidationError[] = [];
      validate(sub, data, path, subErrors);
      return subErrors.length === 0;
    });
    if (!anyValid) {
      errors.push({
        path,
        message: "Value does not match any of the allowed schemas (anyOf)",
        expected: "match at least one schema",
        actual: truncate(data),
        keyword: "anyOf",
      });
    }
  }

  // oneOf
  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter((sub) => {
      const subErrors: ValidationError[] = [];
      validate(sub, data, path, subErrors);
      return subErrors.length === 0;
    }).length;
    if (matchCount !== 1) {
      errors.push({
        path,
        message: `Value must match exactly one schema (oneOf), matched ${matchCount}`,
        expected: "match exactly one schema",
        actual: `matched ${matchCount}`,
        keyword: "oneOf",
      });
    }
  }
}

export function validateSchema(
  schema: unknown,
  data: unknown
): ValidationResult {
  if (!schema || typeof schema !== "object") {
    throw new Error("Schema must be a valid JSON Schema object");
  }

  const errors: ValidationError[] = [];
  validate(schema as JsonSchema, data, "$", errors);

  return {
    valid: errors.length === 0,
    errors,
    errorCount: errors.length,
  };
}
