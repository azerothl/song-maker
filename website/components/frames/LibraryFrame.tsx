import styles from "./frames.module.css";

export function LibraryFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>library</span>
      </div>
      <div className={styles.body}>
        <aside className={styles.side}>
          <span className={styles.active}>Morceaux</span>
          <span>Réglages</span>
        </aside>
        <div className={styles.main}>
          <div className={styles.grid}>
            {[
              ["Nocturne GPU", "gen-014 · cot"],
              ["Bass sketch", "midi import"],
              ["Stem bed", "htdemucs"],
              ["Clip mix", "phase 3"],
              ["Candidate B", "compare"],
              ["LoRA pack", "cc by-nc"],
            ].map(([title, meta]) => (
              <div key={title} className={styles.tile}>
                <strong>{title}</strong>
                <em>{meta}</em>
                <div className={styles.waveMini} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
