import { useMemo, useState } from "react";
import {
  createProjectSyncClient,
  createEmptyEnvelope,
  type ProjectSyncPreferences,
  type ProjectSyncStatus,
} from "@song-maker/project-sync";
import { t } from "../ui/i18n";

const STORAGE_KEY = "song-maker.project-sync.prefs";

type StoredMap = Record<string, ProjectSyncPreferences>;

function loadAll(): StoredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredMap) : {};
  } catch {
    return {};
  }
}

function saveAll(map: StoredMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function statusLabel(status: ProjectSyncStatus): string {
  switch (status) {
    case "never_synced":
      return t("phase4.sync.never");
    case "not_implemented":
      return t("phase4.sync.notImplemented");
    case "pending":
    case "syncing":
    case "synced":
    case "error":
      return status;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export type ProjectSyncPanelProps = {
  /** When set, toggles apply to this project. */
  projectId?: string | null;
};

/**
 * Per-project sync opt-in + status. Honest: cloud backend not shipped.
 * Settings (no projectId) shows intro only; library/song can pass projectId.
 */
export function ProjectSyncPanel({ projectId }: ProjectSyncPanelProps) {
  const client = useMemo(() => createProjectSyncClient(), []);
  const [map, setMap] = useState<StoredMap>(loadAll);
  const prefs: ProjectSyncPreferences = projectId
    ? (map[projectId] ?? client.getPreferences(projectId))
    : {
        syncEnabled: false,
        endpointBaseUrl: "",
        lastSyncedAt: null,
        lastError: null,
        status: "never_synced",
      };
  const [notice, setNotice] = useState<string | null>(null);

  const update = (patch: Partial<ProjectSyncPreferences>) => {
    if (!projectId) return;
    const nextPrefs = client.setPreferences(projectId, patch);
    const next = { ...map, [projectId]: nextPrefs };
    setMap(next);
    saveAll(next);
  };

  const onTryPush = async () => {
    if (!projectId || !prefs.syncEnabled) return;
    const result = await client.push(projectId, createEmptyEnvelope(projectId));
    update({
      status: result.status,
      lastError: result.error ?? null,
    });
    setNotice(result.error ?? statusLabel(result.status));
  };

  return (
    <section className="project-sync-panel" aria-labelledby="project-sync-title">
      <h2 id="project-sync-title">{t("phase4.sync.title")}</h2>
      <p className="hint">{t("phase4.sync.intro")}</p>
      <p className="hint">{t("phase4.sync.localWorks")}</p>
      {!projectId && (
        <p className="hint">{t("phase4.sync.pickProject")}</p>
      )}
      {projectId && (
        <>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={prefs.syncEnabled}
              onChange={(e) => update({ syncEnabled: e.target.checked })}
            />
            {t("phase4.sync.enable")}
          </label>
          <p className="hint">
            {t("phase4.sync.status")}: {statusLabel(prefs.status)}
          </p>
          {prefs.lastError && <p className="hint error">{prefs.lastError}</p>}
          <button
            type="button"
            className="btn"
            disabled={!prefs.syncEnabled}
            onClick={() => void onTryPush()}
          >
            {t("phase4.sync.tryPush")}
          </button>
          {notice && <pre className="phase3-download-notice">{notice}</pre>}
        </>
      )}
    </section>
  );
}
