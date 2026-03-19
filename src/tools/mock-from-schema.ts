/**
 * Generate realistic mock data from a JSON Schema.
 * Smart field name detection: email -> valid email, name -> realistic name, etc.
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
  default?: unknown;
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
}

// Deterministic pseudo-random number generator (mulberry32)
function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry",
  "Iris", "Jack", "Karen", "Leo", "Mia", "Noah", "Olivia", "Paul",
  "Quinn", "Ruby", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson",
];

const DOMAINS = ["example.com", "test.org", "sample.net", "demo.io", "mock.dev"];

const CITIES = [
  "New York", "London", "Tokyo", "Paris", "Berlin", "Sydney",
  "Toronto", "Mumbai", "Seoul", "Dubai", "Stockholm", "Lisbon",
];

const COUNTRIES = ["US", "GB", "JP", "FR", "DE", "AU", "CA", "IN", "KR", "AE"];

const STREETS = [
  "Main St", "Oak Ave", "Elm Dr", "Maple Ln", "Cedar Rd",
  "Pine Way", "Birch Ct", "Walnut Blvd", "Cherry Pl", "Spruce Ter",
];

const COMPANY_NAMES = [
  "Acme Corp", "Globex Inc", "Initech", "Umbrella Co", "Stark Industries",
  "Wayne Enterprises", "Aperture Science", "Cyberdyne Systems",
];

const LOREM_WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
  "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore",
  "et", "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam",
];

class MockGenerator {
  private rng: () => number;

  constructor(seed?: number) {
    this.rng = createRng(seed ?? Date.now());
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  private randInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private randFloat(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private firstName(): string {
    return this.pick(FIRST_NAMES);
  }

  private lastName(): string {
    return this.pick(LAST_NAMES);
  }

  private fullName(): string {
    return `${this.firstName()} ${this.lastName()}`;
  }

  private email(): string {
    return `${this.firstName().toLowerCase()}.${this.lastName().toLowerCase()}@${this.pick(DOMAINS)}`;
  }

  private phone(): string {
    const area = this.randInt(200, 999);
    const mid = this.randInt(200, 999);
    const last = this.randInt(1000, 9999);
    return `+1-${area}-${mid}-${last}`;
  }

  private url(): string {
    return `https://${this.pick(DOMAINS)}/${LOREM_WORDS[this.randInt(0, 10)]}`;
  }

  private uuid(): string {
    const hex = () => this.randInt(0, 15).toString(16);
    const seg = (n: number) => Array.from({ length: n }, hex).join("");
    return `${seg(8)}-${seg(4)}-4${seg(3)}-${["8", "9", "a", "b"][this.randInt(0, 3)]}${seg(3)}-${seg(12)}`;
  }

  private isoDate(): string {
    const year = this.randInt(2020, 2026);
    const month = String(this.randInt(1, 12)).padStart(2, "0");
    const day = String(this.randInt(1, 28)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private isoDateTime(): string {
    const hour = String(this.randInt(0, 23)).padStart(2, "0");
    const min = String(this.randInt(0, 59)).padStart(2, "0");
    const sec = String(this.randInt(0, 59)).padStart(2, "0");
    return `${this.isoDate()}T${hour}:${min}:${sec}Z`;
  }

  private ipv4(): string {
    return `${this.randInt(1, 255)}.${this.randInt(0, 255)}.${this.randInt(0, 255)}.${this.randInt(1, 254)}`;
  }

  private loremSentence(wordCount?: number): string {
    const count = wordCount ?? this.randInt(5, 15);
    const words = Array.from({ length: count }, () => this.pick(LOREM_WORDS));
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(" ") + ".";
  }

  private smartString(fieldName: string, schema: JsonSchema): string {
    const lower = fieldName.toLowerCase();

    // Format-based
    if (schema.format) {
      switch (schema.format) {
        case "email": return this.email();
        case "uri":
        case "url": return this.url();
        case "date-time": return this.isoDateTime();
        case "date": return this.isoDate();
        case "uuid": return this.uuid();
        case "ipv4": return this.ipv4();
      }
    }

    // Field-name based heuristics
    if (lower === "email" || lower.endsWith("_email") || lower.endsWith("email")) return this.email();
    if (lower === "url" || lower === "website" || lower === "homepage" || lower.endsWith("_url")) return this.url();
    if (lower === "id" || lower.endsWith("_id") || lower.endsWith("id")) return this.uuid();
    if (lower === "name" || lower === "full_name" || lower === "fullname" || lower === "fullName") return this.fullName();
    if (lower === "first_name" || lower === "firstname" || lower === "firstName" || lower === "given_name") return this.firstName();
    if (lower === "last_name" || lower === "lastname" || lower === "lastName" || lower === "surname" || lower === "family_name") return this.lastName();
    if (lower === "username" || lower === "user_name") return this.firstName().toLowerCase() + this.randInt(1, 999);
    if (lower === "phone" || lower === "telephone" || lower === "phone_number" || lower === "phoneNumber") return this.phone();
    if (lower === "city") return this.pick(CITIES);
    if (lower === "country" || lower === "country_code") return this.pick(COUNTRIES);
    if (lower === "street" || lower === "address" || lower === "street_address") return `${this.randInt(1, 9999)} ${this.pick(STREETS)}`;
    if (lower === "zip" || lower === "zip_code" || lower === "zipcode" || lower === "postal_code") return String(this.randInt(10000, 99999));
    if (lower === "company" || lower === "company_name" || lower === "organization") return this.pick(COMPANY_NAMES);
    if (lower === "title" || lower === "subject") return this.loremSentence(this.randInt(3, 7)).slice(0, -1);
    if (lower === "description" || lower === "bio" || lower === "summary" || lower === "about") return this.loremSentence(this.randInt(10, 20));
    if (lower.includes("date") || lower.includes("_at") || lower.endsWith("At")) return this.isoDateTime();
    if (lower === "status") return this.pick(["active", "inactive", "pending", "archived"]);
    if (lower === "role" || lower === "type") return this.pick(["admin", "user", "editor", "viewer"]);
    if (lower === "color" || lower === "colour") return `#${this.randInt(0, 0xffffff).toString(16).padStart(6, "0")}`;
    if (lower === "currency") return this.pick(["USD", "EUR", "GBP", "JPY", "CAD"]);
    if (lower === "language" || lower === "lang" || lower === "locale") return this.pick(["en", "es", "fr", "de", "ja", "zh"]);
    if (lower === "avatar" || lower === "image" || lower === "photo" || lower === "picture") return `https://${this.pick(DOMAINS)}/images/${this.randInt(1, 1000)}.jpg`;
    if (lower === "tag" || lower === "label" || lower === "category") return this.pick(["important", "featured", "new", "archived", "draft"]);
    if (lower === "password" || lower === "secret" || lower === "token") return `${this.pick(LOREM_WORDS)}${this.randInt(100, 999)}!${this.pick(LOREM_WORDS).toUpperCase()}`;

    // Fallback: respect length constraints
    const minLen = schema.minLength ?? 1;
    const maxLen = schema.maxLength ?? 50;
    const targetLen = Math.min(maxLen, Math.max(minLen, 10));
    let result = this.loremSentence(Math.ceil(targetLen / 5));
    if (result.length > maxLen) result = result.slice(0, maxLen);
    while (result.length < minLen) result += " " + this.pick(LOREM_WORDS);
    return result.slice(0, maxLen);
  }

  generate(schema: JsonSchema, fieldName: string = "root"): unknown {
    if (schema.const !== undefined) return schema.const;
    if (schema.default !== undefined && this.rng() < 0.3) return schema.default;
    if (schema.enum) return this.pick(schema.enum as unknown[]);

    if (schema.oneOf) return this.generate(this.pick(schema.oneOf), fieldName);
    if (schema.anyOf) return this.generate(this.pick(schema.anyOf), fieldName);

    const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : ["object"];
    const type = this.pick(types.filter((t) => t !== "null"));

    switch (type) {
      case "string":
        return this.smartString(fieldName, schema);

      case "number":
      case "integer": {
        const min = schema.minimum ?? schema.exclusiveMinimum !== undefined ? (schema.exclusiveMinimum ?? 0) + 1 : 0;
        const max = schema.maximum ?? schema.exclusiveMaximum !== undefined ? (schema.exclusiveMaximum ?? 100) - 1 : 100;
        // Smart number field names
        const lower = fieldName.toLowerCase();
        if (lower === "age") return this.randInt(18, 80);
        if (lower === "price" || lower === "amount" || lower === "cost") return Math.round(this.randFloat(1, 999) * 100) / 100;
        if (lower === "quantity" || lower === "count" || lower === "total") return this.randInt(1, 100);
        if (lower === "rating" || lower === "score") return Math.round(this.randFloat(1, 5) * 10) / 10;
        if (lower === "latitude" || lower === "lat") return Math.round(this.randFloat(-90, 90) * 10000) / 10000;
        if (lower === "longitude" || lower === "lng" || lower === "lon") return Math.round(this.randFloat(-180, 180) * 10000) / 10000;
        if (lower === "year") return this.randInt(2020, 2026);
        if (lower === "percentage" || lower === "percent") return this.randInt(0, 100);
        if (type === "integer") return this.randInt(min, max);
        return Math.round(this.randFloat(min, max) * 100) / 100;
      }

      case "boolean":
        return this.rng() > 0.5;

      case "null":
        return null;

      case "array": {
        const minItems = schema.minItems ?? 1;
        const maxItems = schema.maxItems ?? Math.max(minItems, 3);
        const count = this.randInt(minItems, maxItems);
        const itemSchema = schema.items || {};
        return Array.from({ length: count }, (_, i) =>
          this.generate(itemSchema, `${fieldName}Item`)
        );
      }

      case "object": {
        const result: Record<string, unknown> = {};
        const requiredSet = new Set(schema.required || []);

        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            // Always include required fields, 80% chance for optional
            if (requiredSet.has(key) || this.rng() < 0.8) {
              result[key] = this.generate(propSchema, key);
            }
          }
        }
        return result;
      }

      default:
        return null;
    }
  }
}

export function generateMockData(
  schema: unknown,
  options?: { count?: number; seed?: number }
): unknown {
  if (!schema || typeof schema !== "object") {
    throw new Error("Schema must be a valid JSON Schema object");
  }

  const count = options?.count ?? 1;
  const generator = new MockGenerator(options?.seed);

  if (count === 1) {
    return generator.generate(schema as JsonSchema);
  }

  return Array.from({ length: count }, () =>
    generator.generate(schema as JsonSchema)
  );
}
