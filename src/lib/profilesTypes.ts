export type ProfileKind = "hobby" | "commercial";

export type ProfileSummary = {
  id: string;
  name: string;
  kind: ProfileKind;
  projectCount: number;
  acceptedContractCount: number;
  acceptedEngineContractIds?: string[];
  isLastUsed: boolean;
  isActive: boolean;
};

export type ProfilesState = {
  profiles: ProfileSummary[];
  activeProfileId: string | null;
  lastUsedProfileId: string | null;
  onboardingComplete: boolean;
  migrationBannerVisible: boolean;
  commercialCreationAllowed: boolean;
  maxProfiles: number;
};
