import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { ProviderId } from "./Types";
import { DEFAULT_OPERATING_MODE, modeName, type OperatingMode } from "./OperatingMode";

/**
 * Mode-partitioned provider registry (SPEC §3.4). The registry is bound to a
 * single operating mode; registering a provider whose `supportedModes` does
 * not include that mode is a hard error, so cross-mode providers can never
 * exist inside a registry — there is no code path that can reach them.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, Provider>();

  constructor(
    initial: Provider[] = [],
    readonly operatingMode: OperatingMode = DEFAULT_OPERATING_MODE
  ) {
    for (const provider of initial) this.register(provider);
  }

  register(provider: Provider): void {
    if (!provider.supportedModes.includes(this.operatingMode)) {
      throw new Error(
        `Provider ${provider.id} does not support ${modeName(this.operatingMode)} and cannot be registered.`
      );
    }
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): Provider | undefined {
    return this.providers.get(id);
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  all(): Provider[] {
    return [...this.providers.values()];
  }

  async healthCheckAll(): Promise<ProviderHealth[]> {
    return Promise.all(this.all().map((provider) => provider.healthCheck()));
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    const provider = this.providers.get(invocation.providerId);
    if (!provider) {
      throw new Error(`Provider not registered: ${invocation.providerId}`);
    }
    if (!provider.enabled) {
      throw new Error(`Provider is disabled: ${invocation.providerId}`);
    }
    return provider.runTurn(invocation);
  }
}
