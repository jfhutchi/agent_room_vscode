import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { ProviderId } from "./Types";

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, Provider>();

  constructor(initial: Provider[] = []) {
    for (const provider of initial) this.register(provider);
  }

  register(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): Provider | undefined {
    return this.providers.get(id);
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
