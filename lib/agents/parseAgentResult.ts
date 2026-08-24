import "server-only";

// Claude's structured tool-call output should match the JSON schema, but for
// large array payloads it sometimes wraps the value as a JSON-encoded
// string instead of a native array (occasionally double-nested under the
// same key, e.g. `{"modules": "{\"modules\":[...]}"}`). Rather than crash
// downstream with a cryptic ".filter is not a function", unwrap that shape
// before giving up.
export function coerceArrayField<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];

  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Expected "${key}" to be an array; got an unparseable string.`);
    }
    if (Array.isArray(parsed)) return parsed as T[];
    if (parsed && typeof parsed === "object" && key in (parsed as Record<string, unknown>)) {
      return coerceArrayField<T>((parsed as Record<string, unknown>)[key], key);
    }
  }

  throw new Error(
    `Expected "${key}" to be an array, got: ${JSON.stringify(raw).slice(0, 500)}`
  );
}
