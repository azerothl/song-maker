import { useEffect, useMemo, useState } from "react";
import {
  createEmptyEnvelope,
  createProjectSyncClient,
  FilesystemProjectSyncTransport,
  HttpProjectSyncTransport,
  NotImplementedProjectSyncTransport,
  type ProjectSyncPreferences,
  type ProjectSyncStatus,
  type ProjectSyncTransport,
  type SyncFsBackend,
} from "@song-maker/project-sync";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { t } from "../ui/i18n";

const STORAGE_KEY = "song-maker.project-sync.prefs";
const KEY_STORAGE = "song-maker.project-sync.aes-key";

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

function loadOrCreateKey(): Uint8Array {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (raw) {
      const arr = JSON.parse(raw) as number[];
      if (Array.isArray(arr) && arr.length === 32) return new Uint8Array(arr);
    }
  } catch {
    /* generate */
  }
  const key = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(KEY_STORAGE, JSON.stringify([...key]));
  return key;
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
    case "conflict":
      return status;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function createTauriFsBackend(): SyncFsBackend {
  return {
    async listLocal(projectId) {
      return runtimeApi.projectSyncListArtifacts(projectId);
    },
    async readLocal(projectId, relativePath) {
      const bytes = await runtimeApi.projectSyncReadBytes(
        projectId,
        relativePath,
      );
      return new Uint8Array(bytes);
    },
    async writeLocal(projectId, relativePath, bytes) {
      await runtimeApi.projectSyncWriteBytes(projectId, relativePath, [
        ...bytes,
      ]);
    },
    async listRemote(root, projectId) {
      return runtimeApi.projectSyncFsList(root, projectId);
    },
    async readRemote(root, projectId, relativePath) {
      const bytes = await runtimeApi.projectSyncFsRead(
        root,
        projectId,
        relativePath,
      );
      return new Uint8Array(bytes);
    },
    async writeRemote(root, projectId, relativePath, bytes) {
      await runtimeApi.projectSyncFsWrite(root, projectId, relativePath, [
        ...bytes,
      ]);
    },
    async deleteRemote(root, projectId) {
      await runtimeApi.projectSyncFsDelete(root, projectId);
    },
  };
}

export type ProjectSyncPanelProps = {
  projectId?: string | null;
};

/**
 * Per-project sync opt-in. Filesystem (NAS/USB) or self-hosted HTTP.
 */
export function ProjectSyncPanel({ projectId }: ProjectSyncPanelProps) {
  const [map, setMap] = useState<StoredMap>(loadAll);
  const keyBytes = useMemo(() => loadOrCreateKey(), []);
  const [defaultFsRoot, setDefaultFsRoot] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void runtimeApi.projectSyncFsRoot().then(setDefaultFsRoot).catch(() => {});
  }, []);

  const prefs: ProjectSyncPreferences = (() => {
    if (!projectId) {
      return {
        syncEnabled: false,
        endpointBaseUrl: "",
        syncRootPath: "",
        lastSyncedAt: null,
        lastError: null,
        status: "never_synced" as const,
      };
    }
    const stored = map[projectId];
    return {
      syncEnabled: stored?.syncEnabled ?? false,
      endpointBaseUrl: stored?.endpointBaseUrl ?? "",
      syncRootPath: stored?.syncRootPath || defaultFsRoot || "",
      lastSyncedAt: stored?.lastSyncedAt ?? null,
      lastError: stored?.lastError ?? null,
      status: stored?.status ?? "never_synced",
    };
  })();

  const transport: ProjectSyncTransport = useMemo(() => {
    if (!isTauriRuntime()) {
      return new NotImplementedProjectSyncTransport();
    }
    const backend = createTauriFsBackend();
    const httpUrl = prefs.endpointBaseUrl.trim();
    if (httpUrl.startsWith("http://") || httpUrl.startsWith("https://")) {
      return new HttpProjectSyncTransport({
        baseUrl: httpUrl,
        keyBytes,
        artifactSource: {
          list: (id) => backend.listLocal(id),
          read: (id, p) => backend.readLocal(id, p),
          write: (id, p, b) => backend.writeLocal(id, p, b),
        },
      });
    }
    const root = prefs.syncRootPath.trim() || defaultFsRoot;
    return new FilesystemProjectSyncTransport({
      root,
      backend,
      keyBytes,
      onConflict: async (path) => {
        const choice = window.confirm(
          `Conflit sur ${path}.\nOK = garder local (écrase distant)\nAnnuler = garder distant`,
        );
        return choice ? "keep-local" : "keep-remote";
      },
    });
  }, [
    prefs.endpointBaseUrl,
    prefs.syncRootPath,
    defaultFsRoot,
    keyBytes,
  ]);

  const client = useMemo(() => {
    const c = createProjectSyncClient(transport);
    c.hydrate(map);
    return c;
  }, [transport, map]);

  const update = (patch: Partial<ProjectSyncPreferences>) => {
    if (!projectId) return;
    const nextPrefs = client.setPreferences(projectId, patch);
    const next = { ...map, [projectId]: nextPrefs };
    setMap(next);
    saveAll(next);
  };

  const onPush = async () => {
    if (!projectId || !prefs.syncEnabled) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await client.push(
        projectId,
        createEmptyEnvelope(projectId),
      );
      update({
        status: result.status,
        lastError: result.error ?? null,
        lastSyncedAt:
          result.status === "synced" ? new Date().toISOString() : prefs.lastSyncedAt,
      });
      setNotice(result.error ?? statusLabel(result.status));
    } finally {
      setBusy(false);
    }
  };

  const onPull = async () => {
    if (!projectId || !prefs.syncEnabled) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await client.pull(projectId);
      update({
        status: result.status,
        lastError: result.error ?? null,
        lastSyncedAt:
          result.status === "synced" ? new Date().toISOString() : prefs.lastSyncedAt,
      });
      setNotice(result.error ?? statusLabel(result.status));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteRemote = async () => {
    if (!projectId || !prefs.syncEnabled) return;
    if (!window.confirm(t("phase4.sync.confirmDelete"))) return;
    setBusy(true);
    try {
      const result = await client.deleteRemote(projectId);
      update({
        status: result.status,
        lastError: result.error ?? null,
      });
      setNotice(result.error ?? statusLabel(result.status));
    } finally {
      setBusy(false);
    }
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
          <label className="invariant-level">
            {t("phase4.sync.root")}
            <input
              type="text"
              value={prefs.syncRootPath || defaultFsRoot}
              placeholder={defaultFsRoot || "…/Song Maker/sync"}
              onChange={(e) => update({ syncRootPath: e.target.value })}
              disabled={!prefs.syncEnabled}
            />
          </label>
          <label className="invariant-level">
            {t("phase4.sync.endpoint")}
            <input
              type="text"
              value={prefs.endpointBaseUrl}
              placeholder="http://127.0.0.1:8787 (optionnel)"
              onChange={(e) => update({ endpointBaseUrl: e.target.value })}
              disabled={!prefs.syncEnabled}
            />
          </label>
          <p className="hint">
            {t("phase4.sync.status")}: {statusLabel(prefs.status)}
            {prefs.lastSyncedAt ? ` · ${prefs.lastSyncedAt}` : ""}
          </p>
          {prefs.lastError && <p className="hint error">{prefs.lastError}</p>}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={!prefs.syncEnabled || busy}
              onClick={() => void onPush()}
            >
              {t("phase4.sync.push")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!prefs.syncEnabled || busy}
              onClick={() => void onPull()}
            >
              {t("phase4.sync.pull")}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!prefs.syncEnabled || busy}
              onClick={() => void onDeleteRemote()}
            >
              {t("phase4.sync.deleteRemote")}
            </button>
          </div>
          {notice && <pre className="phase3-download-notice">{notice}</pre>}
        </>
      )}
    </section>
  );
}
