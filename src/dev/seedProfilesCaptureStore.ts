import { useAppStore } from "../store/appStore";
import type { ProfilesState } from "../lib/profilesTypes";

const hobby: ProfilesState = {
  profiles: [
    {
      id: "profile-001",
      name: "Profil Hobby (vos projets existants)",
      kind: "hobby",
      projectCount: 12,
      acceptedContractCount: 3,
      isLastUsed: true,
      isActive: true,
    },
    {
      id: "profile-002",
      name: "Reprises",
      kind: "hobby",
      projectCount: 4,
      acceptedContractCount: 1,
      isLastUsed: false,
      isActive: false,
    },
    {
      id: "profile-003",
      name: "Jams",
      kind: "hobby",
      projectCount: 7,
      acceptedContractCount: 0,
      isLastUsed: false,
      isActive: false,
    },
  ],
  activeProfileId: "profile-001",
  lastUsedProfileId: "profile-001",
  onboardingComplete: true,
  migrationBannerVisible: false,
  commercialCreationAllowed: false,
  maxProfiles: 6,
};

export function seedProfilesCaptureStore(patch?: Partial<ProfilesState>): void {
  useAppStore.setState({
    screen: "library",
    profilesState: { ...hobby, ...patch },
    job: null,
    profileOperationBusy: false,
    project: {
      schema: "song-maker.project",
      schemaVersion: 1,
      id: "capture-profile",
      title: "Nuit claire",
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      style: "Piano lent",
      lyrics: "Paroles d'exemple",
      cot: "full",
    },
  });
}

export function seedOnboardingCaptureStore(
  patch?: Partial<ProfilesState>,
  sixOfSix = false,
): void {
  const profiles = sixOfSix
    ? Array.from({ length: 6 }, (_, i) => ({
        id: `profile-${i + 1}`,
        name: ["Hobby", "Reprises", "Jams", "Covers", "Ateliers", "Démos"][i]!,
        kind: "hobby" as const,
        projectCount: 12 - i,
        acceptedContractCount: i === 0 ? 3 : 0,
        isLastUsed: i === 0,
        isActive: i === 0,
      }))
    : hobby.profiles;

  useAppStore.setState({
    screen: "profiles",
    profilesState: {
      ...hobby,
      profiles,
      onboardingComplete: false,
      ...patch,
    },
    job: null,
    profileOperationBusy: false,
    project: null,
  });
}
