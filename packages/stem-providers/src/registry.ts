import type { AudiocppSepTransport, StemSeparatorProvider } from "./types.js";
import {
  HTDEMUCS_CAPABILITIES,
  createHtDemucsStemSeparator,
} from "./htdemucs.js";
import {
  BS_ROFORMER_CAPABILITIES,
  createBsRoFormerStemSeparator,
} from "./bs-roformer.js";
import {
  HTDEMUCS_6S_CAPABILITIES,
  createHtDemucs6sStemSeparator,
} from "./htdemucs-6s.js";

export type StemProviderId = "htdemucs" | "htdemucs_6s" | "bs_roformer";

export type StemProviderConfig = {
  /** When false, BS-RoFormer stays listed but separate() must not be selected live. */
  bsRoFormerWeightsPresent: boolean;
  htdemucs6sRuntimeAvailable?: boolean;
};

const DEFAULT_CONFIG: StemProviderConfig = {
  bsRoFormerWeightsPresent: false,
  htdemucs6sRuntimeAvailable: false,
};

export function listStemProviderIds(): StemProviderId[] {
  return ["htdemucs", "htdemucs_6s", "bs_roformer"];
}

export function createStemSeparator(
  id: StemProviderId,
  transport?: AudiocppSepTransport,
): StemSeparatorProvider {
  switch (id) {
    case "htdemucs":
      return createHtDemucsStemSeparator(transport);
    case "bs_roformer":
      return createBsRoFormerStemSeparator(transport);
    case "htdemucs_6s":
      return createHtDemucs6sStemSeparator(transport);
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown stem provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Whether the host may run this provider now (weights + config).
 * HTDemucs is always the default path of the first build.
 */
export function isStemProviderRunnable(
  id: StemProviderId,
  config: StemProviderConfig = DEFAULT_CONFIG,
): boolean {
  switch (id) {
    case "htdemucs":
      return true;
    case "bs_roformer":
      return config.bsRoFormerWeightsPresent;
    case "htdemucs_6s":
      return Boolean(config.htdemucs6sRuntimeAvailable);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function describeStemProvidersFr(
  config: StemProviderConfig = DEFAULT_CONFIG,
): Array<{
  id: StemProviderId;
  displayNameFr: string;
  stemLayoutNoteFr: string;
  runnable: boolean;
  unavailableRoles: readonly string[];
}> {
  return [
    {
      id: "htdemucs",
      displayNameFr: HTDEMUCS_CAPABILITIES.displayNameFr,
      stemLayoutNoteFr: HTDEMUCS_CAPABILITIES.stemLayoutNoteFr,
      runnable: isStemProviderRunnable("htdemucs", config),
      unavailableRoles: HTDEMUCS_CAPABILITIES.unavailableRoles,
    },
    {
      id: "htdemucs_6s",
      displayNameFr: HTDEMUCS_6S_CAPABILITIES.displayNameFr,
      stemLayoutNoteFr: HTDEMUCS_6S_CAPABILITIES.stemLayoutNoteFr,
      runnable: isStemProviderRunnable("htdemucs_6s", config),
      unavailableRoles: HTDEMUCS_6S_CAPABILITIES.unavailableRoles,
    },
    {
      id: "bs_roformer",
      displayNameFr: BS_ROFORMER_CAPABILITIES.displayNameFr,
      stemLayoutNoteFr: BS_ROFORMER_CAPABILITIES.stemLayoutNoteFr,
      runnable: isStemProviderRunnable("bs_roformer", config),
      unavailableRoles: BS_ROFORMER_CAPABILITIES.unavailableRoles,
    },
  ];
}
