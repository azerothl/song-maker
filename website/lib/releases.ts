import rootPackage from "../../package.json";

/** App version from the monorepo root — matches Tauri / GitHub release asset names. */
export const APP_VERSION = rootPackage.version;

export const RELEASE_LATEST_DOWNLOAD =
  "https://github.com/azerothl/song-maker/releases/latest/download";

export const RELEASE_LATEST_PAGE =
  "https://github.com/azerothl/song-maker/releases/latest";

export function releaseAsset(filename: string): string {
  return `${RELEASE_LATEST_DOWNLOAD}/${filename}`;
}

/** Installer filenames for the current app version on the `latest` release. */
export const releaseAssets = {
  windowsSetup: releaseAsset(`Song.Maker_${APP_VERSION}_x64-setup.exe`),
  windowsMsi: releaseAsset(`Song.Maker_${APP_VERSION}_x64_en-US.msi`),
  macAppleSilicon: releaseAsset(`Song.Maker_${APP_VERSION}_aarch64.dmg`),
  macIntel: releaseAsset(`Song.Maker_${APP_VERSION}_x64.dmg`),
  linuxAppImage: releaseAsset(`Song.Maker_${APP_VERSION}_amd64.AppImage`),
  linuxDeb: releaseAsset(`Song.Maker_${APP_VERSION}_amd64.deb`),
  linuxRpm: releaseAsset(`Song.Maker-${APP_VERSION}-1.x86_64.rpm`),
} as const;
