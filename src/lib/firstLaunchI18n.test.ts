import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import fr from "../ui/fr.json";
import enProfiles from "../ui/en.profiles.json";
import { t } from "../ui/i18n.ts";
import {
  browserDemoFromHash,
  buildFileRows,
  downloadLiveAnnouncementText,
  downloadSequentialLead,
  fileMeta,
  formatBytesFr,
  formatEtaFr,
  formatRateFr,
  installErrorCopy,
  remainingAfterResumeLabel,
} from "./firstLaunch.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

const FIRST_LAUNCH_KEYS = Object.keys(fr).filter((k) => k.startsWith("firstLaunch."));

before(() => {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
});

afterEach(() => {
  store.delete(LOCALE_KEY);
});

describe("firstLaunch i18n (#202 / #221)", () => {
  it("FR and EN share the same firstLaunch key set", () => {
    const enKeys = Object.keys(enProfiles).filter((k) => k.startsWith("firstLaunch."));
    assert.deepEqual(enKeys.sort(), FIRST_LAUNCH_KEYS.sort());
  });

  it("forbidden marketing words absent from firstLaunch copy", () => {
    const texts = FIRST_LAUNCH_KEYS.flatMap((key) => [
      String(fr[key as keyof typeof fr]),
      String(enProfiles[key as keyof typeof enProfiles]),
    ]);
    for (const text of texts) {
      assert.equal(
        COMMERCIAL_COPY_FORBIDDEN.test(text),
        false,
        `forbidden word in: ${text}`,
      );
    }
  });

  it("English path resolves download counter lead", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(
      t("firstLaunch.download.leadSequential", { index: 3, total: 9 }),
      "Files download one after another · 3 of 9",
    );
    assert.equal(t("firstLaunch.status.failed"), "Failed");
    assert.equal(t("firstLaunch.retryFile"), "Retry");
  });

  it("English ETA and partial resume line contain no French (#220 Gabriel)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const pending = formatEtaFr(null, true);
    assert.equal(pending, "Estimated once download speed is known");
    assert.doesNotMatch(pending, /Estimation|dès que|reçus|sur/i);
    const twelveSec = formatEtaFr(12, true);
    assert.match(twelveSec, /≈ 12 s \(estimate\)/);
    assert.doesNotMatch(twelveSec, /estimation/i);
    const resumeLine = remainingAfterResumeLabel(85, true);
    assert.doesNotMatch(resumeLine, /Estimation dès|après reprise|min \d+ s \(estimation\)/i);
    assert.match(resumeLine, /≈ .+\(estimate\)/);
    assert.doesNotMatch(resumeLine, / left after resume.*Estimation/i);
  });

  it("English remainingAfterResume with invalid ETA (#221)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const line = remainingAfterResumeLabel(null, true);
    assert.match(line, /left after resume/);
    assert.match(line, /Estimated once download speed is known/);
    assert.doesNotMatch(line, /Reste|après reprise|Estimation|dès que/i);
  });

  it("English units and speedZero match (#221)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(formatBytesFr(8.5 * 1024 ** 3), "8.5 GB");
    assert.equal(formatBytesFr(12 * 1024 ** 2), "12 MB");
    assert.equal(formatRateFr(2 * 1024 ** 2), "2 MB/s");
    assert.equal(t("firstLaunch.download.speedZero"), "Speed: 0 MB/s");
    assert.doesNotMatch(formatBytesFr(1024 ** 3), /Go|Mo/);
  });

  it("English file row labels and aria-live active title (#221)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.deepEqual(fileMeta("audio.cpp"), {
      title: "Audio engine",
      hint: "Audio processing",
      kind: "engine",
    });
    assert.equal(fileMeta("yue2-3b-q8_0.gguf").hint, "Generation model");
    assert.doesNotMatch(fileMeta("htdemucs-q8_0.gguf").hint, /Séparation|stems$/);

    const fixture = browserDemoFromHash("download");
    const rows = buildFileRows(fixture.plan, fixture.progress);
    const lead = downloadSequentialLead(fixture.progress, rows);
    const active = rows.find((row) => row.status === "active");
    assert.ok(active);
    const live = downloadLiveAnnouncementText({
      lead,
      activeTitle: active!.title,
      errorCount: 0,
    });
    assert.match(live, /Active file:/);
    assert.match(live, new RegExp(active!.title.replace(/[()]/g, "\\$&")));
    assert.doesNotMatch(live, /Fichier en cours|Moteur audio|Traitement du son|Première/i);
  });

  it("English install error copy on download interrupt (#221)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const copy = installErrorCopy({ message: "timeout", cause: "network" });
    assert.match(copy.title, /Internet connection dropped/i);
    assert.doesNotMatch(copy.title, /connexion Internet|téléchargement/i);
    assert.doesNotMatch(copy.body, /octets déjà reçus|Ce n’est pas grave/i);
  });

  it("download chrome strings resolve in English (#221)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(t("firstLaunch.download.cancelBack"), "Cancel and go back to choices");
    assert.equal(t("firstLaunch.download.techDetails"), "Technical details");
    assert.equal(t("firstLaunch.download.eyebrow"), "First install · Download");
  });
});
