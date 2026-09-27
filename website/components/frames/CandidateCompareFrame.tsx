import styles from "./frames.module.css";

export function CandidateCompareFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>candidate compare</span>
      </div>
      <div className={styles.body}>
        <aside className={styles.side}>
          <span className={styles.active}>A / B</span>
          <span>Queue</span>
        </aside>
        <div className={`${styles.main} ${styles.compare}`}>
          <div className={styles.cand}>
            <h4>gen-021 · A</h4>
            <em style={{ color: "var(--muted)", fontStyle: "normal" }}>seed 1204</em>
            <div className={styles.waveMini} />
            <div className={styles.meter}>
              <span style={{ width: "62%" }} />
            </div>
          </div>
          <div className={`${styles.cand} ${styles.selected}`}>
            <h4>gen-022 · B</h4>
            <em style={{ color: "var(--muted)", fontStyle: "normal" }}>seed 1205 · pick</em>
            <div className={styles.waveMini} />
            <div className={styles.meter}>
              <span style={{ width: "84%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
