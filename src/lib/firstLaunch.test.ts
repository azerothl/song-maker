import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMUCS_327_ISSUE_URL, HTDEMUCS_NOTICE_FR } from "@song-maker/stem-providers";
import type { InstallPlan, InstallProgress, SetupGpuInfo } from "./types.ts";
import {
  FIRST_LAUNCH_TOKENS,
  browserDemoFromHash,
  bucketPlanBytes,
  buildFileRows,
  contrastRatio,
  detectHeadline,
  downloadAnnounceSnapshot,
  downloadLiveAnnouncementChanged,
  downloadProgressOrdinal,
  downloadSequentialLead,
  fileRowNeedsRetry,
  fileMeta,
  formatBytesFr,
  formatEtaFr,
  formatVramGo,
  fileStatusShowsWarningIcon,
  gpuDetailLine,
  installErrorCopy,
  mergeInstallProgress,
  resolveInstallErrorFileName,
  HTDEMUCS_FIRST_LAUNCH_NOTICE_FR,
  HTDEMUCS_LICENSE_URL,
  LICENSE_REQUIRED_FR,
  licenseAllowsDownload,
  modelPackVramFailureRisk,
  parsePack,
  queuedFileStatusFr,
  resolveFirstLaunchView,
  vramBarPercent,
} from "./firstLaunch.ts";
import { t } from "../ui/i18n.ts";

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
    assert.equal(detectHeadline("appleMetal").status, "Puce Apple compatible détectée");
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
    assert.equal(browserDemoFromHash("").yue2LicenseAccepted, false);
    assert.equal(browserDemoFromHash("metal").yue2LicenseAccepted, false);
    assert.equal(browserDemoFromHash("download").yue2LicenseAccepted, true);
    assert.equal(browserDemoFromHash("download").progress?.state, "downloading");
    assert.equal(browserDemoFromHash("download").pack, "q8");
    const dlRows = buildFileRows(
      browserDemoFromHash("download").plan,
      browserDemoFromHash("download").progress,
    );
    assert.equal(dlRows.find((r) => r.status === "active")?.title, "YuE2 (Q8)");
    const cRows = buildFileRows(browserDemoFromHash("c").plan, browserDemoFromHash("c").progress);
    assert.equal(cRows.filter((r) => r.status === "error").length, 1);
  });

  it("clarifie file d’attente vs à télécharger (#202)", () => {
    assert.deepEqual(
      queuedFileStatusFr({ status: "waiting", activeTitle: "YuE2 (Q8)" }),
      {
        primary: "En file d’attente",
        secondary: "Démarre après YuE2 (Q8)",
      },
    );
    assert.deepEqual(queuedFileStatusFr({ status: "waiting" }), {
      primary: "À télécharger",
    });
    assert.deepEqual(queuedFileStatusFr({ status: "missing" }), {
      primary: "À télécharger",
    });
    assert.deepEqual(
      queuedFileStatusFr({ status: "waiting", installInFlight: true }),
      { primary: "En file d’attente" },
    );
    const names = browserDemoFromHash("download").plan.files.map((f) => f.name);
    assert.ok(names.includes("yue2-qwen.tiktoken"));
    assert.ok(names.includes("yue2-model-config.json"));
    assert.ok(!names.includes("tokenizer.json"));
    assert.ok(!names.includes("cudart-sidecar.json"));
  });

  it("calcule le compteur séquentiel depuis les lignes (#202)", () => {
    const fixture = browserDemoFromHash("download");
    const rows = buildFileRows(fixture.plan, fixture.progress);
    assert.deepEqual(downloadProgressOrdinal(fixture.progress, rows), {
      index: 3,
      total: 6,
    });
    assert.match(
      downloadSequentialLead(fixture.progress, rows) ?? "",
      /· 3 sur 6/,
    );
    assert.equal(fileRowNeedsRetry("error"), true);
    assert.equal(fileRowNeedsRetry("partial"), true);
    assert.equal(fileRowNeedsRetry("waiting"), false);
    assert.deepEqual(downloadProgressOrdinal(null, []), null);
    assert.deepEqual(downloadProgressOrdinal({ ...fixture.progress!, fileCount: 0 }, []), {
      index: 0,
      total: 0,
    });
    assert.equal(
      downloadSequentialLead({ ...fixture.progress!, fileCount: 0, state: "downloading", label: "", fileIndex: 0, receivedBytes: 0 }, []),
      null,
    );
    const reprise = browserDemoFromHash("reprise");
    const repriseRows = buildFileRows(reprise.plan, reprise.progress);
    assert.equal(repriseRows.filter((r) => r.status === "partial").length, 1);
    assert.ok((reprise.progress?.etaSeconds ?? 0) > 0);
    assert.equal(reprise.progress?.state, "error");
  });

  it("n’annonce pas le live region à chaque pourcentage (#202)", () => {
    const fixture = browserDemoFromHash("download");
    const baseRows = buildFileRows(fixture.plan, fixture.progress);
    const lead = downloadSequentialLead(fixture.progress, baseRows);
    let prev = null;
    let announcements = 0;
    for (let pct = 1; pct <= 99; pct += 1) {
      const rows = baseRows.map((row) =>
        row.status === "active" ? { ...row, percent: pct } : row,
      );
      const snap = downloadAnnounceSnapshot(rows, lead);
      if (downloadLiveAnnouncementChanged(prev, snap)) {
        announcements += 1;
        prev = snap;
      }
    }
    assert.equal(announcements, 1);
  });

  it("distingue licence requise et file d’attente (#202)", () => {
    assert.deepEqual(queuedFileStatusFr({ status: "waiting", licenseBlocked: true }), {
      primary: "Licence requise",
    });
  });
});

describe("firstLaunch formatters", () => {
  it("formate les octets et les ETA en français, avec mention d’estimation", () => {
    assert.equal(formatBytesFr(8.5 * 1024 ** 3), "8,5 Go");
    assert.equal(formatVramGo(12288), "12 Go");
    assert.equal(parsePack("q8"), "q8");
    assert.equal(parsePack("q4"), "q4");
    assert.match(formatEtaFr(180, true), /estimation/i);
    assert.equal(formatEtaFr(null, true), t("firstLaunch.eta.pendingEstimate"));
  });

  it("sépare le poids du modèle YuE2 du reste du plan", () => {
    const buckets = bucketPlanBytes(plan());
    assert.equal(buckets.modelBytes, 2_665_632_320);
    assert.equal(fileMeta("htdemucs-q8_0.gguf").title, "Séparation des pistes");
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

  it("garde la ligne Échec après double événement sans fileName (#202)", () => {
    const p = plan({
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
      ],
    });
    const first: InstallProgress = {
      state: "error",
      label: "yue2-3b-q4_0.gguf",
      fileIndex: 2,
      fileCount: 2,
      receivedBytes: 430,
      totalBytes: 1000,
      fileName: "yue2-3b-q4_0.gguf",
      error: { message: "réseau", cause: "network", fileName: "yue2-3b-q4_0.gguf" },
    };
    const second = mergeInstallProgress(first, {
      ...first,
      fileName: undefined,
      error: { ...first.error!, fileName: undefined },
    });
    assert.equal(resolveInstallErrorFileName(second), "yue2-3b-q4_0.gguf");
    const rows = buildFileRows(p, second);
    assert.equal(rows[1]?.status, "error");
    const copy = installErrorCopy(second.error);
    assert.match(copy.title, /YuE2 \(Q4\)/);
  });

  it("rédige une erreur réseau lisible, pas un dump brut", () => {
    const copy = installErrorCopy({
      message: "timed out",
      cause: "network",
      fileName: "yue2-3b-q4_0.gguf",
    });
    assert.match(copy.title, /connexion/i);
    assert.match(copy.body, /conservés/);
    assert.equal(copy.steps.length, 2);
  });
});

describe("firstLaunch licence et VRAM", () => {
  it("réutilise la notice HTDemucs canonique (sans #issuecomment)", () => {
    assert.equal(HTDEMUCS_LICENSE_URL, DEMUCS_327_ISSUE_URL);
    assert.doesNotMatch(HTDEMUCS_LICENSE_URL, /issuecomment/);
    assert.equal(HTDEMUCS_FIRST_LAUNCH_NOTICE_FR, HTDEMUCS_NOTICE_FR);
    assert.match(HTDEMUCS_FIRST_LAUNCH_NOTICE_FR, /Demucs #327/);
  });

  it("bloque le téléchargement tant que la licence n’est pas acceptée", () => {
    assert.equal(LICENSE_REQUIRED_FR, "Acceptez la licence pour continuer.");
    assert.equal(licenseAllowsDownload(false, false), false);
    assert.equal(licenseAllowsDownload(true, false), true);
    assert.equal(licenseAllowsDownload(false, true), true);
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
