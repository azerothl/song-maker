import type { StemSeparatorProvider } from "./types.js";
import { createHtDemucsStemSeparator } from "./htdemucs.js";
import { createBsRoFormerStemSeparatorStub } from "./bs-roformer.js";

export type StemProviderId = "htdemucs" | "bs_roformer";

const registry: Record<StemProviderId, () => StemSeparatorProvider> = {
  htdemucs: createHtDemucsStemSeparator,
  bs_roformer: createBsRoFormerStemSeparatorStub,
};

export function listStemProviderIds(): StemProviderId[] {
  return Object.keys(registry) as StemProviderId[];
}

export function createStemSeparator(
  id: StemProviderId,
): StemSeparatorProvider {
  const factory = registry[id];
  return factory();
}
