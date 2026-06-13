/**
 * `copilotAgentSession` — capability-gated scaffold, permanently disabled
 * until public APIs verifiably support direct Copilot agent session
 * orchestration (SPEC §4, §7 Level 3). @types/vscode 1.91.0 contains no such
 * API, so this provider is disabled, reports the canonical §3.2 limitation,
 * and refuses every turn. No scraping, no UI automation, no private APIs,
 * no fake implementation.
 */

import { ProviderId } from "./Types";
import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { DIRECT_SESSION_LIMITATION } from "./CopilotIntegration";

export class CopilotAgentSessionProvider implements Provider {
  readonly id: ProviderId = "copilotAgentSession";
  readonly displayName = "Copilot Agent Session";
  readonly kind = "copilot";
  /** Stays false until the public API exists; there is no setting that enables it. */
  readonly enabled = false;
  readonly supportedModes = ["workCopilotNative"] as const;

  async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: this.id,
      available: false,
      configured: false,
      authenticatedLikely: false,
      capabilities: {},
      warnings: [DIRECT_SESSION_LIMITATION],
      checkedAt: new Date().toISOString()
    };
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    return {
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status: "error",
      finalText: DIRECT_SESSION_LIMITATION,
      diagnostics: {},
      durationMs: 0,
      fallbackUsed: false,
      warnings: []
    };
  }
}
