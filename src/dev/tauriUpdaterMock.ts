/** Stub `@tauri-apps/plugin-updater` pour captures navigateur. */
export type Update = {
  version: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (event: DownloadEvent) => void,
  ) => Promise<void>;
  close: () => Promise<void>;
};

export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export async function check(): Promise<Update | null> {
  return null;
}
