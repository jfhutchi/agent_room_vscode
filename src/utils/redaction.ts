/**
 * Best-effort secret redaction for diagnostics and logs.
 *
 * The goal is to keep obvious credentials out of transcripts, diagnostics and
 * the output channel without mangling ordinary source code. Patterns are
 * deliberately anchored to secret-ish labels or well-known token shapes.
 */

const REDACTED = "[redacted]";

interface RedactionRule {
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const RULES: RedactionRule[] = [
  // Authorization headers: keep the scheme, hide the credential.
  {
    pattern: /(authorization\s*[:=]\s*)(bearer\s+|basic\s+|token\s+)?(\S{4,})/gi,
    replace: (_m, p1: string, p2: string | undefined) => `${p1}${p2 ?? ""}${REDACTED}`
  },
  // Bare bearer tokens.
  {
    pattern: /\b(bearer\s+)([A-Za-z0-9\-._~+/=]{16,})/gi,
    replace: (_m, p1: string) => `${p1}${REDACTED}`
  },
  // Well-known API key shapes (OpenAI, Anthropic, GitHub, Slack, AWS).
  {
    pattern: /\b(sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    replace: () => REDACTED
  },
  // key=value style assignments with secret-ish labels.
  {
    pattern:
      /\b((?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|password|passwd|pwd|token|secret|credentials?)\s*[:=]\s*["']?)([^\s"',;]{6,})/gi,
    replace: (_m, p1: string) => `${p1}${REDACTED}`
  },
  // Long high-entropy strings immediately following a secret-ish word.
  {
    pattern: /\b((?:key|token|secret|password)\b[^\n=:]{0,20}[:=]\s*)([A-Za-z0-9+/_-]{24,})/gi,
    replace: (_m, p1: string) => `${p1}${REDACTED}`
  }
];

export function redactText(input: string): string {
  if (!input) return input;
  let out = input;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replace as (...args: string[]) => string);
  }
  return out;
}

/** Redact every string found in an arbitrary JSON-ish value (depth-limited). */
export function redactDeep(value: unknown, depth = 6): unknown {
  if (depth <= 0) return "[truncated]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth - 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(authorization|api[_-]?key|secret|token|password|passwd)$/i.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactDeep(v, depth - 1);
      }
    }
    return out;
  }
  return value;
}

/** Truncate huge text safely for diagnostics, keeping head and tail. */
export function truncateForDiagnostics(text: string, maxChars = 8000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.2));
  return `${head}\n…[${text.length - maxChars} chars truncated by Agent Room]…\n${tail}`;
}
