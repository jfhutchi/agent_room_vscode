/**
 * Small helpers for producing Markdown exports. Rendering of agent Markdown
 * inside the webview is handled client-side (media/agentRoom.js) with a
 * DOM-based renderer; this module is only for text output.
 */

export function mdEscape(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#|])/g, "\\$1");
}

export function mdHeading(level: number, text: string): string {
  const n = Math.min(6, Math.max(1, level));
  return `${"#".repeat(n)} ${text}`;
}

export function mdCodeBlock(code: string, lang = ""): string {
  // Pick a fence longer than any backtick run inside the code.
  const longestRun = (code.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${lang}\n${code}\n${fence}`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
