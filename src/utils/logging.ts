/**
 * Leveled logger for the "Agent Room" output channel.
 * The sink is injected so core code and tests never import `vscode`.
 * Everything written through this logger is redacted first.
 */

import { redactText } from "./redaction";

export type LogLevel = "error" | "info" | "debug" | "trace";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  info: 1,
  debug: 2,
  trace: 3
};

export interface LogSink {
  appendLine(line: string): void;
}

export class Logger {
  private level: LogLevel = "error";

  constructor(private readonly sink: LogSink) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  error(message: string): void {
    this.write("error", message);
  }

  info(message: string): void {
    this.write("info", message);
  }

  debug(message: string): void {
    this.write("debug", message);
  }

  trace(message: string): void {
    this.write("trace", message);
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.level]) return;
    const stamp = new Date().toISOString();
    this.sink.appendLine(`[${stamp}] [${level}] ${redactText(message)}`);
  }
}
