/** Helpers for narrowing `unknown` values (parsed JSON, caught errors). */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Stringify any value without falling back to "[object Object]". */
export function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (
    typeof v === "number" ||
    typeof v === "boolean" ||
    typeof v === "bigint"
  ) {
    return String(v);
  }
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function") return "[function]";
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}

/** Human-readable message for a caught value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (isRecord(e) && typeof e.message === "string") return e.message;
  return str(e);
}
