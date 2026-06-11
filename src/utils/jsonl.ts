/**
 * Tolerant JSON-lines parsing and text extraction for CLI provider output.
 * CLI event schemas change between releases, so extraction is field-tolerant
 * and unknown events are preserved (redacted) in diagnostics.
 */

export interface JsonLinesResult {
  events: unknown[];
  invalidLines: number;
  /** Raw lines that failed to parse (useful as a plain-text fallback). */
  plainLines: string[];
}

export function parseJsonLines(text: string): JsonLinesResult {
  const events: unknown[] = [];
  const plainLines: string[] = [];
  let invalidLines = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("{") || line.startsWith("[")) {
      try {
        events.push(JSON.parse(line));
        continue;
      } catch {
        invalidLines++;
      }
    } else {
      invalidLines++;
    }
    plainLines.push(rawLine);
  }
  return { events, invalidLines, plainLines };
}

const DEFAULT_TEXT_FIELDS = [
  "content",
  "text",
  "message",
  "delta",
  "output",
  "result",
  "final",
  "assistant"
];

/**
 * Pull human-readable text out of an arbitrary event object.
 * Walks nested objects/arrays breadth-first up to a depth limit and joins
 * every string found under a known text-ish field name.
 */
export function extractTextFromEvent(
  event: unknown,
  fields: string[] = DEFAULT_TEXT_FIELDS,
  depth = 5
): string {
  const found: string[] = [];
  const visit = (value: unknown, remaining: number, underTextField: boolean) => {
    if (remaining < 0 || value == null) return;
    if (typeof value === "string") {
      if (underTextField && value.trim()) found.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, remaining - 1, underTextField);
      return;
    }
    if (typeof value === "object") {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        const isTextField = fields.includes(key);
        visit(v, remaining - 1, underTextField || isTextField);
      }
    }
  };
  visit(event, depth, false);
  return found.join("");
}

/** Lowercased `type`-ish discriminator of an event, if present. */
export function eventType(event: unknown): string {
  if (event && typeof event === "object") {
    const obj = event as Record<string, unknown>;
    for (const key of ["type", "event", "kind"]) {
      if (typeof obj[key] === "string") return (obj[key] as string).toLowerCase();
    }
    // Codex legacy shape: { msg: { type: "agent_message", ... } }
    if (obj.msg && typeof obj.msg === "object") {
      const t = (obj.msg as Record<string, unknown>).type;
      if (typeof t === "string") return t.toLowerCase();
    }
    if (obj.item && typeof obj.item === "object") {
      const item = obj.item as Record<string, unknown>;
      const t = item.item_type ?? item.type;
      if (typeof t === "string") return t.toLowerCase();
    }
  }
  return "";
}
