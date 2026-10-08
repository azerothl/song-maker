import type { LoraPack } from "@song-maker/lora-packs";
import type { AppSettings, LocalLoraAdapter } from "./types";

type LoraSelection = Pick<AppSettings, "cacheDir" | "yue2ArLora" | "yue2NarLora" | "yue2ArLoraScale" | "yue2NarLoraScale">;

export function adapterPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/\/\?\//, "").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function loraPackForLocalAdapter(
  adapter: Pick<LocalLoraAdapter, "name">,
  packs: readonly LoraPack[],
): LoraPack | undefined {
  const relativeName = adapter.name.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  return packs.find((pack) => pack.files.some((file) =>
    `${pack.id}/${file.filename}`.toLowerCase() === relativeName,
  ));
}

export function adapterFilename(name: string): string {
  const filename = name.split(/[\\/]/).pop() ?? name;
  return filename.replace(/\.safetensors$/i, "");
}

export function adapterActive(path: string, settings: LoraSelection): boolean {
  if (!path.trim()) return false;
  return (adapterPath(path) === adapterPath(settings.yue2ArLora ?? "") && (settings.yue2ArLoraScale ?? 1) > 0)
    || (adapterPath(path) === adapterPath(settings.yue2NarLora ?? "") && (settings.yue2NarLoraScale ?? 1) > 0);
}

export function packLibraryState(pack: LoraPack, files: LocalLoraAdapter[], settings: LoraSelection): { installed: boolean; active: boolean } {
  const paths = new Set(files.map(file => adapterPath(file.path)));
  const expected = pack.files.map(file => ({slot: file.slot, path: adapterPath(`${settings.cacheDir}/models/lora/${pack.id}/${file.filename}`)}));
  const installed = expected.length > 0 && expected.every(file => paths.has(file.path));
  const active = installed && expected.every(file => {
    const selected = file.slot === "ar" ? settings.yue2ArLora : settings.yue2NarLora;
    const scale = file.slot === "ar" ? settings.yue2ArLoraScale : settings.yue2NarLoraScale;
    return adapterPath(selected ?? "") === file.path && (scale ?? 1) > 0;
  });
  return { installed, active };
}
