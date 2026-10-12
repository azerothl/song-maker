const TRACK_PALETTE = [
  "#55c7dc",
  "#a78bfa",
  "#f5b942",
  "#fb7185",
  "#34d399",
  "#60a5fa",
  "#e879f9",
  "#a3e635",
  "#fb923c",
  "#2dd4bf",
  "#f87171",
  "#818cf8",
  "#4ade80",
  "#f472b6",
  "#38bdf8",
  "#c084fc",
];

const STORAGE_PREFIX = "song-maker.studio-track-colors.v1.";

export function defaultStudioTrackColor(index: number): string {
  return TRACK_PALETTE[Math.abs(index) % TRACK_PALETTE.length];
}

export function readStudioTrackColors(projectId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`) ?? "{}",
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, color]) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveStudioTrackColor(
  projectId: string,
  trackId: string,
  color: string,
): void {
  if (typeof window === "undefined" || !/^#[0-9a-f]{6}$/i.test(color)) return;
  const colors = readStudioTrackColors(projectId);
  colors[trackId] = color;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${projectId}`,
      JSON.stringify(colors),
    );
  } catch {
    // Track colors are a convenience preference; storage limits should not block editing.
  }
}

export function libraryWaveColors(key: string): { color: string; playedColor: string } {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash, 31) + key.charCodeAt(index) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    color: `hsl(${hue} 74% 58%)`,
    playedColor: `hsl(${hue} 82% 76%)`,
  };
}

export function playlistHue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash, 31) + id.charCodeAt(index) | 0;
  }
  return Math.abs(hash) % 360;
}
