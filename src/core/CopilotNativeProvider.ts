/**
 * Work Mode provider backed by the public VS Code Language Model API
 * (SPEC §7, §3.2). Verified against @types/vscode 1.91.0:
 *
 *   `export function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[]>;`
 *   `sendRequest(messages: LanguageModelChatMessage[], options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;`
 *   `text: AsyncIterable<string>;`
 *
 * Models come only from what the environment actually exposes — typically
 * GitHub Copilot Chat under the user's company policy. When no models are
 * exposed, health and runTurn say so honestly; nothing is faked, scraped,
 * or routed through private APIs.
 *
 * The VS Code bindings are injected so the §18 tests can exercise this
 * provider with fakes; the controller passes the real `vscode.lm` functions.
 */

import { ProviderId } from "./Types";
import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { ORG_POLICY_LIMITATION } from "./CopilotIntegration";

/** Structural subset of vscode.LanguageModelChat (1.91.0). */
export interface CopilotChatModelLike {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  readonly family: string;
  readonly version: string;
  readonly maxInputTokens: number;
  sendRequest(
    messages: unknown[],
    options?: object,
    token?: unknown
  ): Thenable<{ text: AsyncIterable<string> }>;
}

export interface CancellationHandle {
  token: unknown;
  cancel(): void;
  dispose(): void;
}

export interface CopilotNativeProviderOptions {
  /** Bind to `vscode.lm.selectChatModels` (or a test fake). */
  selectChatModels(selector?: {
    vendor?: string;
    family?: string;
    id?: string;
  }): Thenable<CopilotChatModelLike[]>;
  /** Bind to `(content) => vscode.LanguageModelChatMessage.User(content)`. */
  createUserMessage(content: string): unknown;
  /** Bind to `() => new vscode.CancellationTokenSource()`. */
  createCancellation(): CancellationHandle;
}

export const NO_COPILOT_MODELS_MESSAGE =
  "No Copilot chat models are exposed in this environment. Install and sign in to GitHub " +
  "Copilot Chat, or check whether your organization's policy exposes chat models. " +
  ORG_POLICY_LIMITATION;

export class CopilotNativeProvider implements Provider {
  readonly id: ProviderId = "copilotNative";
  readonly displayName = "GitHub Copilot Native";
  readonly kind = "copilot";
  readonly enabled = true;
  readonly supportedModes = ["workCopilotNative"] as const;

  constructor(private readonly options: CopilotNativeProviderOptions) {}

  async healthCheck(): Promise<ProviderHealth> {
    const base: ProviderHealth = {
      providerId: this.id,
      available: false,
      configured: false,
      authenticatedLikely: false,
      capabilities: {},
      warnings: [],
      checkedAt: new Date().toISOString()
    };
    try {
      const models = await this.options.selectChatModels({ vendor: "copilot" });
      base.available = true; // the Language Model API itself responded
      if (models.length === 0) {
        base.warnings.push(NO_COPILOT_MODELS_MESSAGE);
        return base;
      }
      base.configured = true;
      base.authenticatedLikely = true;
      base.versionText = models
        .map((model) => `${model.name} (${model.family})`)
        .join(", ");
      return base;
    } catch (error) {
      base.error = error instanceof Error ? error.message : String(error);
      base.warnings.push(
        "The VS Code Language Model API rejected the model query. " + NO_COPILOT_MODELS_MESSAGE
      );
      return base;
    }
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const startedAt = Date.now();
    const result = (
      status: ProviderResult["status"],
      finalText: string,
      extra: Partial<ProviderResult["diagnostics"]> = {}
    ): ProviderResult => ({
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status,
      finalText,
      diagnostics: { durationMs: Date.now() - startedAt, ...extra },
      durationMs: Date.now() - startedAt,
      fallbackUsed: false,
      warnings: []
    });

    let models: CopilotChatModelLike[];
    try {
      models = await this.options.selectChatModels({ vendor: "copilot" });
    } catch (error) {
      return result("error", NO_COPILOT_MODELS_MESSAGE, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (models.length === 0) {
      return result("error", NO_COPILOT_MODELS_MESSAGE);
    }

    const requested = invocation.concreteModelName;
    let model = models[0];
    if (requested) {
      const match = models.find(
        (candidate) =>
          candidate.id === requested ||
          candidate.family === requested ||
          candidate.name === requested
      );
      if (!match) {
        return result(
          "error",
          `Requested model "${requested}" is not exposed here. ${ORG_POLICY_LIMITATION} ` +
            `Available: ${models.map((candidate) => candidate.family).join(", ")}.`
        );
      }
      model = match;
    }

    const cancellation = this.options.createCancellation();
    const onAbort = () => cancellation.cancel();
    invocation.abortSignal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      cancellation.cancel();
    }, invocation.timeoutMs);

    try {
      const response = await model.sendRequest(
        [this.options.createUserMessage(invocation.prompt)],
        {},
        cancellation.token
      );
      let text = "";
      for await (const chunk of response.text) {
        text += chunk;
        invocation.onPartialText?.(text);
      }
      return result("complete", text, { commandLabel: `Copilot model ${model.name}` });
    } catch (error) {
      if (invocation.abortSignal?.aborted) {
        return result("cancelled", "Run cancelled.");
      }
      if (timedOut) {
        return result("timeout", `Copilot model did not answer within ${invocation.timeoutMs} ms.`, {
          timedOut: true
        });
      }
      return result("error", error instanceof Error ? error.message : String(error), {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      clearTimeout(timeout);
      invocation.abortSignal?.removeEventListener("abort", onAbort);
      cancellation.dispose();
    }
  }
}
