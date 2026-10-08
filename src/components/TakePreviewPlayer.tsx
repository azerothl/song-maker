import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { t } from "../ui/i18n";

export const TAKE_PREVIEW_PLAY_EVENT = "song-maker:take-preview-play";

/** Audition a take without changing the project's active generation or mix. */
export function TakePreviewPlayer({ audioPath, label }: { audioPath: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = /^(data:|blob:|https?:)/.test(audioPath) ? audioPath : convertFileSrc(audioPath);
    // Polling can replace the generation objects without changing their files.
    // Reassigning src in that case resets the media clock to zero (#379).
    if (audio.getAttribute("src") === url) return;
    const resume = !audio.paused && !audio.ended;
    const position = audio.currentTime;
    audio.pause();
    const loaded = () => {
      if (position > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(position, Math.max(0, audio.duration - 0.01));
      }
      if (resume) void audio.play().catch(() => setFailedPath(audioPath));
    };
    audio.addEventListener("loadedmetadata", loaded, { once: true });
    audio.src = url;
    audio.load();
    return () => audio.removeEventListener("loadedmetadata", loaded);
  }, [audioPath]);

  useEffect(() => {
    const audio = audioRef.current;
    const stopOtherPreview = (event: Event) => {
      if ((event as CustomEvent).detail !== audioRef.current) audioRef.current?.pause();
    };
    window.addEventListener(TAKE_PREVIEW_PLAY_EVENT, stopOtherPreview);
    return () => {
      window.removeEventListener(TAKE_PREVIEW_PLAY_EVENT, stopOtherPreview);
      audio?.pause();
    };
  }, []);

  return (
    <div className="take-preview-player">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        aria-label={t("candidates.listenNamed", { name: label })}
        onPlay={() => {
          setFailedPath(null);
          window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: audioRef.current }));
        }}
        onError={() => setFailedPath(audioPath)}
      />
      {failedPath === audioPath && <p className="hint error" role="alert">{t("candidates.listenError")}</p>}
    </div>
  );
}
