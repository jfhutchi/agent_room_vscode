/**
 * Resolves a model tier to a concrete model name from the user's
 * agentRoom.models.* settings (SPEC §6, §15). Empty strings mean
 * "use provider default", expressed here as `undefined`.
 *
 * Never invents model availability: this only echoes what the user
 * configured; whether the provider actually exposes the model is checked by
 * the provider itself at run time.
 */

import { ModelTier, ModelTierMappings, ProviderId } from "./Types";
import type { OperatingMode } from "./OperatingMode";

function orUndefined(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

export function resolveConcreteModel(
  models: ModelTierMappings,
  operatingMode: OperatingMode,
  providerId: ProviderId,
  tier: ModelTier
): string | undefined {
  if (tier === "providerDefault" || tier === "userSelected") return undefined;

  if (operatingMode === "workCopilotNative") {
    const work = models.work;
    switch (tier) {
      case "fast":
        return orUndefined(work.fast);
      case "balanced":
        return orUndefined(work.balanced);
      case "deepReasoning":
        return orUndefined(work.deepReasoning);
      case "coding":
        return orUndefined(work.coding);
      case "review":
        return orUndefined(work.review);
      case "testing":
        return orUndefined(work.testing);
      case "research":
        return undefined; // no Work research mapping; Scout is policy-gated
    }
  }

  if (providerId === "claudeCodeCli" || providerId === "codexCli") {
    const mapping = providerId === "claudeCodeCli" ? models.personal.claude : models.personal.codex;
    switch (tier) {
      case "fast":
        return orUndefined(mapping.fast);
      case "balanced":
        return orUndefined(mapping.balanced);
      case "deepReasoning":
        return orUndefined(mapping.deepReasoning);
      case "coding":
        return orUndefined(mapping.coding);
      // Review/testing/research tiers have no personal CLI mapping keys
      // (SPEC §15); the provider default is the honest resolution.
      default:
        return undefined;
    }
  }
  if (providerId === "openAiWebSearch" && tier === "research") {
    return orUndefined(models.personal.webResearch.research);
  }
  return undefined;
}
