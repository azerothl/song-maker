import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InstallPlan, InstallProgress, SetupGpuInfo } from "./types.ts";
import {
  FIRST_LAUNCH_TOKENS,
  browserDemoFromHash,
  bucketPlanBytes,
  buildFileRows,
  contrastRatio,
  detectHeadline,
  fileMeta,
  formatBytesFr,
  formatEtaFr,
  formatVramGo,
  fileStatusShowsWarningIcon,
  gpuDetailLine,
  installErrorCopy,
  LICENSE_REQUIRED_FR,
  firstLaunchInstallAllowed,
  htdemucsLicenseAllowsDownload,
  licenseAllowsDownload,
  modelPackVramFailureRisk,
  parsePack,
  resolveFirstLaunchView,
  vramBarPercent,
} from "./firstLaunch.ts";

function gpu(partial: Partial<SetupGpuInfo>): SetupGpuInfo {
  return {
    accelerationKind: "nvidiaCuda",
    gpuName: "NVIDIA GeForce RTX 3060",
    driverVersion: "560.00",
    vramMib: 12288,
    suggestedPack: "q4",
    suggestedPackReasonFr: "Pourquoi : il tient dans vos 12 Go de VRAM.",
    accelerationAvailable: true,
    ...partial,
  };
}

function plan(partial: Partial<InstallPlan> = {}): InstallPlan {
  return {
    pack: "q4",
    fileCount: 2,
    bytesToDownload: 3_000_000_000,
    bytesKnown: true,
    hasPartialDownloads: false,
    files: [
      {
        name: "audio-v0.8.2-bin-ubuntu-x64-cuda12.8-colab.tar.gz",
        status: "complete",
        totalBytes: 65_293_844,
        receivedBytes: 65_293_844,
        remainingBytes: 0,
      },
      {
        name: "yue2-3b-q4_0.gguf",
        status: "missing",
        totalBytes: 2_665_632_320,
        receivedBytes: 0,
        remainingBytes: 2_665_632_320,
      },
    ],
    ...partial,
  };
}

describe("firstLaunch view", () => {
  it("montre l’état GPU pour NVIDIA et Metal, jamais Metal en sans GPU", () => {
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({}),
        plan: plan(),
        progress: null,
        busy: false,
        interruptDismissed: false,
      }),
      "gpu",
    );
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({
          accelerationKind: "appleMetal",
          gpuName: "Apple Metal",
          vramMib: null,
          accelerationAvailable: true,
        }),
        plan: plan(),
        progress: null,
        busy: false,
        interruptDismissed: false,
      }),
      "gpu",
    );
    assert.equal(detectHeadline("appleMetal").status, "Apple Metal détecté");
    assert.match(gpuDetailLine(gpu({})), /RTX 3060/);
    assert.match(gpuDetailLine(gpu({})), /12 Go/);
  });

  it("montre l’état sans GPU seulement si l’accélération est absente", () => {
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({
          accelerationKind: "none",
          gpuName: null,
          vramMib: null,
          accelerationAvailable: false,
        }),
        plan: plan(),
        progress: null,
        busy: false,
        interruptDismissed: false,
      }),
      "noGpu",
    );
  });

  it("passe en interrompu sur erreur ou fichier partiel, et en téléchargement si occupé", () => {
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({}),
        plan: plan({ hasPartialDownloads: true }),
        progress: null,
        busy: false,
        interruptDismissed: false,
      }),
      "interrupted",
    );
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({}),
        plan: plan({ hasPartialDownloads: true }),
        progress: null,
        busy: false,
        interruptDismissed: true,
      }),
      "gpu",
    );
    const progress: InstallProgress = {
      state: "error",
      label: "connexion",
      fileIndex: 2,
      fileCount: 2,
      receivedBytes: 100,
      error: { message: "timeout", cause: "network", fileName: "yue2-3b-q4_0.gguf" },
    };
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({}),
        plan: plan(),
        progress,
        busy: false,
        interruptDismissed: false,
      }),
      "interrupted",
    );
    assert.equal(
      resolveFirstLaunchView({
        loading: false,
        gpu: gpu({ accelerationKind: "none", accelerationAvailable: false }),
        plan: plan(),
        progress: { ...progress, state: "downloading" },
        busy: true,
        interruptDismissed: false,
      }),
      "download",
    );
  });

  it("résout les fixtures navigateur depuis le hash", () => {
    assert.equal(browserDemoFromHash("b").gpu.accelerationKind, "none");
    assert.equal(browserDemoFromHash("metal").gpu.accelerationKind, "appleMetal");
    assert.equal(browserDemoFromHash("c").plan.hasPartialDownloads, true);
    assert.equal(browserDemoFromHash("c").progress?.state, "error");
  });
});

describe("firstLaunch formatters", () => {
  it("formate les octets et les ETA en français, avec mention d’estimation", () => {
    assert.equal(formatBytesFr(8.5 * 1024 ** 3), "8,5 Go");
    assert.equal(formatVramGo(12288), "12 Go");
    assert.equal(parsePack("q8"), "q8");
    assert.equal(parsePack("q4"), "q4");
    assert.match(formatEtaFr(180, true), /estimation/);
    assert.equal(formatEtaFr(null, true), "Estimation dès que le débit sera mesuré");
  });

  it("sépare le poids du modèle YuE2 du reste du plan", () => {
    const buckets = bucketPlanBytes(plan());
    assert.equal(buckets.modelBytes, 2_665_632_320);
    assert.equal(fileMeta("htdemucs-q8_0.gguf").title, "HTDemucs");
    assert.ok(vramBarPercent("q4", 12288) < vramBarPercent("q8", 12288));
  });

  it("construit les lignes de fichiers avec octets, statut et fichier actif", () => {
    const rows = buildFileRows(
      plan({
        hasPartialDownloads: true,
        files: [
          {
            name: "audio.tar.gz",
            status: "complete",
            totalBytes: 100,
            receivedBytes: 100,
            remainingBytes: 0,
          },
          {
            name: "yue2-3b-q4_0.gguf",
            status: "partial",
            totalBytes: 1000,
            receivedBytes: 430,
            remainingBytes: 570,
          },
          {
            name: "yue2-vae-f16.gguf",
            status: "missing",
            totalBytes: 200,
            receivedBytes: 0,
            remainingBytes: 200,
          },
        ],
      }),
      {
        state: "error",
        label: "yue2-3b-q4_0.gguf",
        fileIndex: 2,
        fileCount: 3,
        receivedBytes: 430,
        totalBytes: 1000,
        fileName: "yue2-3b-q4_0.gguf",
        error: { message: "réseau", cause: "network", fileName: "yue2-3b-q4_0.gguf" },
      },
    );
    assert.equal(rows[0]?.status, "complete");
    assert.equal(rows[1]?.status, "error");
    assert.equal(rows[1]?.percent, 43);
    assert.equal(rows[2]?.status, "waiting");
  });

  it("rédige une erreur réseau lisible, pas un dump brut", () => {
    const copy = installErrorCopy({
      message: "timed out",
      cause: "network",
      fileName: "YuE2",
    });
    assert.match(copy.title, /connexion/i);
    assert.match(copy.body, /conservés/);
    assert.equal(copy.steps.length, 2);
  });
});

describe("firstLaunch licence et VRAM", () => {
  it("bloque le téléchargement tant que la licence n’est pas acceptée", () => {
    assert.equal(LICENSE_REQUIRED_FR, "Acceptez la licence pour continuer.");
    assert.equal(licenseAllowsDownload(false, false), false);
    assert.equal(licenseAllowsDownload(true, false), true);
    assert.equal(licenseAllowsDownload(false, true), true);
    assert.equal(htdemucsLicenseAllowsDownload(false, {}), false);
    assert.equal(
      htdemucsLicenseAllowsDownload(false, { htdemucs: true }),
      true,
    );
    assert.equal(
      firstLaunchInstallAllowed(true, false, true, { htdemucs: true }),
      true,
    );
    assert.equal(firstLaunchInstallAllowed(true, false, false, {}), false);
  });

  it("signale le risque Q8 quand le pic dépasse la VRAM détectée", () => {
    assert.equal(modelPackVramFailureRisk("q4", 8188), false);
    assert.equal(modelPackVramFailureRisk("q8", 8188), true);
    assert.equal(modelPackVramFailureRisk("q8", 12288), false);
  });

  it("n’affiche pas l’icône d’alerte sur l’estimation de reprise (fichier partiel)", () => {
    assert.equal(fileStatusShowsWarningIcon("partial"), false);
    assert.equal(fileStatusShowsWarningIcon("error"), true);
  });
});

describe("firstLaunch contrast tokens", () => {
  it("respecte WCAG AA sur les paires de la maquette corrigée", () => {
    const t = FIRST_LAUNCH_TOKENS;
    assert.ok(contrastRatio(t.text, t.card) >= 4.5);
    assert.ok(contrastRatio(t.teal, t.card) >= 4.5);
    assert.ok(contrastRatio(t.buttonText, t.button) >= 4.5);
    assert.ok(contrastRatio(t.buttonText, t.buttonHover) >= 4.5);
    assert.ok(contrastRatio(t.alert, t.alertBg) >= 4.5);
    assert.ok(contrastRatio(t.focus, t.card) >= 4.5);
    assert.ok(contrastRatio(t.link, t.card) >= 4.5);
    assert.ok(contrastRatio(t.license, t.foot) >= 4.5);
    assert.ok(contrastRatio(t.muted, t.card) >= 4.5);
    assert.ok(contrastRatio(t.line2, t.panel) >= 3);
    assert.ok(contrastRatio(t.line2, t.foot) >= 3);
    assert.ok(contrastRatio(t.button, t.foot) >= 3);
  });
});
