import { ProviderHealth } from "./ProviderTypes";
import { ProviderRegistry } from "./ProviderRegistry";

export async function checkProviderHealth(registry: ProviderRegistry): Promise<Record<string, ProviderHealth>> {
  const entries = await registry.healthCheckAll();
  return Object.fromEntries(entries.map((health) => [health.providerId, health]));
}
