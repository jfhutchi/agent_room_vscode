import * as fs from "fs/promises";
import * as path from "path";
import {
  AgentRoomMessage,
  MessageStatus,
  newId,
  nowIso,
  Transcript,
  RoomProfile
} from "./Types";
import { ensureAgentRoomDir, safeFileName } from "../utils/paths";
import { mdHeading } from "../utils/markdown";

export interface TranscriptStoreOptions {
  mode: "memory" | "workspace" | "global";
  workspaceRoot?: string;
  globalStore?: {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void> | Promise<void>;
  };
}

export interface CreateTranscriptInput {
  workspacePath?: string;
  workspaceName?: string;
  gitBranch?: string;
  roomProfileSnapshot: RoomProfile;
  workflowId?: string;
  settingsSnapshot: Record<string, unknown>;
}

export type AppendMessageInput = Omit<AgentRoomMessage, "id" | "createdAt"> &
  Partial<Pick<AgentRoomMessage, "id" | "createdAt">>;

const GLOBAL_KEY = "agentRoom.transcripts";

export class TranscriptStore {
  private transcripts = new Map<string, Transcript>();
  private currentId: string | undefined;

  constructor(private readonly options: TranscriptStoreOptions) {
    const globalTranscripts = options.globalStore?.get<Transcript[]>(GLOBAL_KEY);
    if (globalTranscripts) {
      for (const transcript of globalTranscripts) this.transcripts.set(transcript.id, transcript);
      this.currentId = globalTranscripts.at(-1)?.id;
    }
  }

  async create(input: CreateTranscriptInput): Promise<Transcript> {
    const now = nowIso();
    const transcript: Transcript = {
      id: newId("transcript"),
      createdAt: now,
      updatedAt: now,
      workspacePath: input.workspacePath,
      workspaceName: input.workspaceName,
      gitBranch: input.gitBranch,
      roomProfileSnapshot: input.roomProfileSnapshot,
      workflowId: input.workflowId,
      messages: [],
      settingsSnapshot: input.settingsSnapshot
    };
    this.transcripts.set(transcript.id, transcript);
    this.currentId = transcript.id;
    await this.persist(transcript);
    return transcript;
  }

  current(): Transcript | undefined {
    return this.currentId ? this.transcripts.get(this.currentId) : undefined;
  }

  get(id: string): Transcript | undefined {
    return this.transcripts.get(id);
  }

  all(): Transcript[] {
    return [...this.transcripts.values()];
  }

  async appendMessage(transcriptId: string, input: AppendMessageInput): Promise<AgentRoomMessage> {
    const transcript = this.requireTranscript(transcriptId);
    const now = nowIso();
    const message: AgentRoomMessage = {
      id: input.id ?? newId("msg"),
      createdAt: input.createdAt ?? now,
      participantKind: input.participantKind,
      participantId: input.participantId,
      displayName: input.displayName,
      providerId: input.providerId,
      roleIds: input.roleIds,
      roleNames: input.roleNames,
      workflowId: input.workflowId,
      workflowStepId: input.workflowStepId,
      status: input.status,
      content: input.content,
      diagnostics: input.diagnostics,
      reactions: input.reactions,
      replyToMessageId: input.replyToMessageId,
      metadata: input.metadata
    };
    transcript.messages.push(message);
    transcript.updatedAt = now;
    await this.persist(transcript);
    return message;
  }

  async updateMessage(
    transcriptId: string,
    messageId: string,
    patch: Partial<Pick<AgentRoomMessage, "content" | "status" | "diagnostics" | "metadata">>
  ): Promise<AgentRoomMessage> {
    const transcript = this.requireTranscript(transcriptId);
    const message = transcript.messages.find((entry) => entry.id === messageId);
    if (!message) throw new Error(`Message not found: ${messageId}`);
    Object.assign(message, patch, { updatedAt: nowIso() });
    transcript.updatedAt = nowIso();
    await this.persist(transcript);
    return message;
  }

  async clearCurrent(): Promise<void> {
    const transcript = this.current();
    if (!transcript) return;
    transcript.messages = [];
    transcript.updatedAt = nowIso();
    await this.persist(transcript);
  }

  exportJson(id: string): string {
    return JSON.stringify(this.requireTranscript(id), null, 2);
  }

  exportMarkdown(id: string, includeDiagnostics = false): string {
    const transcript = this.requireTranscript(id);
    const lines: string[] = [
      mdHeading(1, "Agent Room Transcript"),
      "",
      `Workspace: ${transcript.workspaceName ?? "unavailable"}`,
      `Workflow: ${transcript.workflowId ?? "manual"}`,
      `Created: ${transcript.createdAt}`,
      `Updated: ${transcript.updatedAt}`,
      "",
      mdHeading(2, "Role Assignments"),
      ""
    ];

    for (const agent of transcript.roomProfileSnapshot.virtualAgents) {
      const provider = transcript.roomProfileSnapshot.providers.find((entry) => entry.id === agent.providerId);
      const roles = transcript.roomProfileSnapshot.roles
        .filter((role) => agent.assignedRoleIds.includes(role.id))
        .map((role) => role.name);
      lines.push(`${agent.displayName} - ${provider?.displayName ?? agent.providerId} - ${roles.join(", ") || "no roles"}`);
    }

    for (const message of transcript.messages) {
      lines.push("", mdHeading(2, message.displayName));
      if (message.roleNames.length) lines.push(`Roles: ${message.roleNames.join(", ")}`, "");
      lines.push(message.content || `(${message.status})`);
      if (includeDiagnostics && message.diagnostics) {
        lines.push("", "Diagnostics:", "```json", JSON.stringify(message.diagnostics, null, 2), "```");
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private requireTranscript(id: string): Transcript {
    const transcript = this.transcripts.get(id);
    if (!transcript) throw new Error(`Transcript not found: ${id}`);
    return transcript;
  }

  private async persist(transcript: Transcript): Promise<void> {
    if (this.options.mode === "workspace" && this.options.workspaceRoot) {
      const dir = await ensureAgentRoomDir(this.options.workspaceRoot, "transcripts");
      await fs.writeFile(
        path.join(dir, `${safeFileName(transcript.id)}.json`),
        JSON.stringify(transcript, null, 2),
        "utf8"
      );
    }
    if (this.options.mode === "global" && this.options.globalStore) {
      await this.options.globalStore.update(GLOBAL_KEY, this.all());
    }
  }
}

export function messageStatusFromProvider(status: string): MessageStatus {
  switch (status) {
    case "complete":
      return "complete";
    case "cancelled":
      return "cancelled";
    default:
      return "error";
  }
}
