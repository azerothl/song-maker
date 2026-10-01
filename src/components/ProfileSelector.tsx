import { useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  focusProfileElement,
  handleProfileOverlayKeydown,
  listProfileFocusables,
} from "../lib/profileDialogA11y";
import { formatProfileProjectCount } from "../lib/profileProjectCount";
import { profileSwitchBlockReason } from "../lib/profileSwitchBlock";
import type { ProfileSummary } from "../lib/profilesTypes";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import { ProfileSwitchConfirmDialog } from "./ProfileSwitchConfirmDialog";

function kindLabel(kind: string): string {
  return kind === "commercial"
    ? t("profiles.onboarding.type.commercial")
    : t("profiles.onboarding.type.hobby");
}

function profileMetaLine(p: ProfileSummary): string {
  const projects = formatProfileProjectCount(p.projectCount);
  const kind = kindLabel(p.kind);
  return `${kind} · ${projects}`;
}

type Props = {
  collapsed: boolean;
};

export function ProfileSelector({ collapsed }: Props) {
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const job = useAppStore((s) => s.job);
  const profileOperationBusy = useAppStore((s) => s.profileOperationBusy);
  const project = useAppStore((s) => s.project);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ProfileSummary | null>(null);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = profilesState?.profiles.find((p) => p.isActive) ?? null;
  const block = profileSwitchBlockReason(job, profileOperationBusy);

  const closeMenu = () => {
    setOpen(false);
    window.setTimeout(() => {
      focusProfileElement(triggerRef.current);
    }, 0);
  };

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    const hash = globalThis.location?.hash?.toLowerCase() ?? "";
    if (hash.includes("blocked-generation") && block.blocked) {
      setOpen(true);
      return;
    }
    if (hash.includes("selector-collapsed-open") || hash.includes("collapsed-menu-open")) {
      setOpen(true);
      return;
    }
    if (hash.includes("selector-open") && !hash.includes("collapsed")) {
      setOpen(true);
      return;
    }
    if (!hash.includes("switch-confirm")) return;
    const target = profilesState?.profiles.find((p) => !p.isActive);
    if (target) setPending(target);
  }, [profilesState, block.blocked]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = menuRef.current ?? document.getElementById(menuId);
      if (menu?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, menuId]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = listProfileFocusables(menu);
    focusProfileElement(items[0] ?? menu);

    const onKey = (e: KeyboardEvent) => {
      handleProfileOverlayKeydown(e, menu, closeMenu);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!active) return null;

  const tip = collapsed
    ? `${active.name} — ${kindLabel(active.kind)}`
    : `${active.name} (${kindLabel(active.kind)})`;
  const collapsedAriaLabel = t("profiles.selector.collapsedAria", {
    name: active.name,
    kind: kindLabel(active.kind),
  });

  const blockMessage =
    block.blocked && block.kind === "generation"
      ? t("profiles.switch.blocked.generation")
      : block.blocked && block.kind === "separation"
        ? t("profiles.switch.blocked.separation")
        : block.blocked && block.kind === "export"
          ? t("profiles.switch.blocked.export")
          : null;

  const menuKicker = t("profiles.selector.menuKicker", {
    count: profilesState?.profiles.length ?? 0,
    max: profilesState?.maxProfiles ?? 6,
  });

  const performSwitch = async (target: ProfileSummary) => {
    try {
      if (project) {
        await api.saveProjectForm(project.id, useAppStore.getState().form);
      }
      await api.activateProfile(target.id);
      await refreshProfiles();
      await refreshSettings();
      await refreshLibrary();
      useAppStore.setState({
        project: null,
        projects: [],
        mix: null,
        generations: [],
      });
      setScreen("library");
      setOpen(false);
      setPending(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <div className="profile-selector-wrap">
        <button
          ref={triggerRef}
          type="button"
          className="profile-selector-trigger profile-focusable"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          title={tip}
          aria-label={collapsed ? collapsedAriaLabel : undefined}
          {...(block.blocked ? { "aria-disabled": true } : {})}
          data-testid="profile-selector-trigger"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={`profile-selector-icon ${active.kind}`}
            aria-hidden="true"
          >
            {active.kind === "commercial" ? "💼" : "🏠"}
          </span>
          {!collapsed && (
            <>
              <span className="profile-selector-text">
                <span className="profile-selector-name">{active.name}</span>
                <span className={`profile-selector-kind ${active.kind}`}>
                  {kindLabel(active.kind)}
                </span>
              </span>
              <span className="profile-selector-chevron" aria-hidden="true">
                ▾
              </span>
            </>
          )}
        </button>
        {open && (
          <div
            ref={menuRef}
            id={menuId}
            className="profile-selector-menu"
            role="menu"
            data-testid="profile-selector-menu"
          >
            <p className="profile-menu-kicker">{menuKicker}</p>
            {blockMessage ? (
              <div
                className="profile-switch-block-alert"
                role="alert"
                data-testid="profile-switch-block-alert"
              >
                {blockMessage}
              </div>
            ) : null}
            <ul className="profile-menu-list">
              {profilesState?.profiles.map((p) => {
                const isCurrent = p.id === active.id;
                const blocked = block.blocked && !isCurrent;
                const meta = profileMetaLine(p);
                const labelTitle = collapsed ? { title: p.name } : {};
                const metaTitle = collapsed ? { title: meta } : {};
                return (
                  <li key={p.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      className={`profile-menu-item profile-focusable${blocked ? " is-blocked" : ""}`}
                      aria-checked={isCurrent}
                      {...(blocked ? { "aria-disabled": true } : {})}
                      tabIndex={0}
                      data-testid={`profile-menu-item-${p.id}`}
                      onClick={() => {
                        if (blocked || isCurrent) return;
                        setPending(p);
                        setOpen(false);
                      }}
                    >
                      <span className={`profile-selector-icon ${p.kind}`} aria-hidden="true">
                        {p.kind === "commercial" ? "💼" : "🏠"}
                      </span>
                      <span className="profile-menu-item-text">
                        <span className="profile-menu-item-name" {...labelTitle}>
                          {p.name}
                        </span>
                        <span className="profile-menu-item-meta" {...metaTitle}>
                          {meta}
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="profile-menu-check" aria-hidden="true">✓</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="profile-menu-footer profile-focusable"
              role="menuitem"
              data-testid="profile-menu-new"
              onClick={() => {
                setOpen(false);
                setScreen("profiles");
              }}
            >
              + {t("profiles.selector.new")}
            </button>
          </div>
        )}
      </div>
      {active ? (
        <ProfileSwitchConfirmDialog
          open={pending !== null}
          current={active}
          target={pending ?? active}
          returnFocusRef={triggerRef}
          onConfirm={() => {
            if (pending) void performSwitch(pending);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}
