/**
 * Small helpers for producing Markdown exports. Rendering of agent Markdown
 * inside the webview is handled client-side (media/agentRoom.js) with a
 * DOM-based renderer; this module is only for text output.
 */

export function mdHeading(level: number, text: string): string {
  const n = Math.min(6, Math.max(1, level));
  return `${"#".repeat(n)} ${text}`;
}
