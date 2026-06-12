import { ProviderHealth } from "./ProviderTypes";

export type ProviderHealthState = "ready" | "disabled" | "missing" | "needsAuth" | "needsConfig";

export function providerHealthState(health: ProviderHealth, enabled: boolean): ProviderHealthState {
  if (!enabled) return "disabled";
  if (!health.available) return "missing";
  if (!health.configured) return "needsConfig";
  if (!health.authenticatedLikely) return "needsAuth";
  return "ready";
}

export function providerHealthSummary(health: ProviderHealth, enabled = true): string {
  const state = providerHealthState(health, enabled);
  switch (state) {
    case "ready":
      return `${health.providerId} is ready.`;
    case "disabled":
      return `${health.providerId} is disabled.`;
    case "missing":
      return `${health.providerId} executable is unavailable.`;
    case "needsAuth":
      return `${health.providerId} may need CLI authentication.`;
    case "needsConfig":
      return `${health.providerId} needs configuration.`;
  }
}
