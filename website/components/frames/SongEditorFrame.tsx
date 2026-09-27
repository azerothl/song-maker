import styles from "./frames.module.css";

export function SongEditorFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>song editor · style + lyrics</span>
      </div>
      <div className={styles.body}>
        <aside className={styles.side}>
          <span>Formulaire</span>
          <span className={styles.active}>Arrangement</span>
          <span>Export</span>
        </aside>
        <div className={`${styles.main} ${styles.form}`}>
          <div className={styles.row}>
            <label>Style</label>
            <div className={styles.field}>warm electronic ballad, intimate vocal</div>
          </div>
          <div className={styles.row}>
            <label>Paroles</label>
            <div className={styles.field}>[verse] lights on the console…</div>
          </div>
          <div className={styles.row}>
            <label>CoT</label>
            <div className={styles.field}>cot · seed 48291 · Q4</div>
          </div>
          <div className={styles.row}>
            <label>Clips</label>
            <div className={styles.field}>intro · verse · chorus · outro</div>
          </div>
        </div>
      </div>
    </div>
  );
}
